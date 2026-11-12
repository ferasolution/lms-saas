<?php

namespace App\Http\Controllers\Api\School;

use App\Http\Controllers\Controller;
use App\Models\ActivityLog;
use App\Models\PlatformSetting;
use App\Models\User;
use App\Services\School;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Crypt;
use Illuminate\Support\Facades\Http;
use Illuminate\Validation\Rule;
use Throwable;

/**
 * AI helpers for teachers (lesson plans, quizzes, worksheets, comments),
 * the office (announcements), students (a tutor that explains) and parents
 * (a plain-language summary of their child's week). Uses the platform
 * owner's Anthropic API key from the console. Output is a draft for a person
 * to review — it is never saved or sent automatically.
 */
class AiController extends Controller
{
    public const STAFF_TOOLS = ['lesson_plan', 'quiz', 'worksheet', 'homework', 'rubric', 'report_comment', 'announcement', 'explain'];

    public function __construct(protected School $school) {}

    public static function config(): array
    {
        $ai = PlatformSetting::get('ai', []) ?: [];
        $key = null;
        if (! empty($ai['api_key'])) {
            try {
                $key = Crypt::decryptString($ai['api_key']);
            } catch (Throwable) {
                $key = null;
            }
        }

        return ['key' => $key ?: config('services.anthropic.key'), 'model' => $ai['model'] ?? 'claude-haiku-5-5'];
    }

    public function status(Request $request): JsonResponse
    {
        $u = $request->user();

        return response()->json([
            'enabled' => (bool) self::config()['key'] && data_get($this->school->tenant()->settings, 'modules.ai') !== false,
            'tools' => $u->hasRole(User::ROLE_STUDENT) ? ['tutor'] : ($u->hasRole(User::ROLE_PARENT) ? ['child_summary', 'tutor'] : self::STAFF_TOOLS),
        ]);
    }

    public function generate(Request $request): JsonResponse
    {
        $u = $request->user();
        $allowed = $u->hasRole(User::ROLE_STUDENT) ? ['tutor'] : ($u->hasRole(User::ROLE_PARENT) ? ['child_summary', 'tutor'] : self::STAFF_TOOLS);
        $data = $request->validate([
            'tool' => ['required', Rule::in($allowed)],
            'subject' => ['nullable', 'string', 'max:120'],
            'grade' => ['nullable', 'string', 'max:60'],
            'topic' => ['nullable', 'required_unless:tool,child_summary', 'string', 'max:500'],
            'details' => ['nullable', 'string', 'max:3000'],
            'count' => ['nullable', 'integer', 'min:1', 'max:30'],
            'student_id' => ['nullable', 'integer'],
        ]);

        $cfg = self::config();
        abort_if(! $cfg['key'], 422, 'The AI assistant isn’t set up yet. The platform owner adds an API key in the owner console.');

        [$system, $prompt] = $this->prompt($data, $u);

        try {
            $res = Http::withHeaders(['x-api-key' => $cfg['key'], 'anthropic-version' => '2023-06-01'])
                ->timeout(60)->post('https://api.anthropic.com/v1/messages', [
                    'model' => $cfg['model'],
                    'max_tokens' => 2000,
                    'system' => $system,
                    'messages' => [['role' => 'user', 'content' => $prompt]],
                ]);
        } catch (Throwable $e) {
            report($e);
            abort(503, 'The AI service didn’t respond. Please try again in a minute.');
        }
        abort_if($res->failed(), 503, 'The AI service returned an error ('.$res->status().'). Please try again.');

        $text = collect($res->json('content', []))->where('type', 'text')->pluck('text')->implode("\n");
        ActivityLog::record('ai.generate', "AI {$data['tool']}".(isset($data['topic']) ? ": {$data['topic']}" : ''), ['tokens' => $res->json('usage')]);

        return response()->json(['text' => trim($text)]);
    }

    protected function prompt(array $d, User $u): array
    {
        $school = $this->school->tenant()->name;
        $base = "You are an assistant inside Fera EduSphere, the school platform used by {$school}. Write clear, accurate, age-appropriate content in plain language. Use Markdown headings and lists. Never invent facts about specific students. The result is a draft a teacher or parent will review.";
        $ctx = trim(implode("\n", array_filter([
            ! empty($d['subject']) ? "Subject: {$d['subject']}" : null,
            ! empty($d['grade']) ? "Class or grade level: {$d['grade']}" : null,
            ! empty($d['topic']) ? "Topic: {$d['topic']}" : null,
            ! empty($d['details']) ? "Notes from the user: {$d['details']}" : null,
        ])));
        $n = $d['count'] ?? 10;

        return match ($d['tool']) {
            'lesson_plan' => [$base, "Draft a lesson plan.\n{$ctx}\nInclude: learning objectives, materials, a warm-up, step-by-step activities with timings, checks for understanding, differentiation for learners who need support or extension, and a short homework idea."],
            'quiz' => [$base, "Write {$n} multiple-choice questions.\n{$ctx}\nFor each: the question, four options labelled A–D, the correct letter, and a one-sentence explanation. Put an answer key at the end."],
            'worksheet' => [$base, "Create a printable practice worksheet with about {$n} questions that build in difficulty.\n{$ctx}\nAdd an answer key at the end."],
            'homework' => [$base, "Write a homework assignment that takes about 20–30 minutes.\n{$ctx}\nGive clear instructions a student can follow alone, and what to hand in."],
            'rubric' => [$base, "Create a marking rubric as a Markdown table with 4 criteria and 4 levels (Excellent, Good, Developing, Beginning), with a short descriptor in each cell.\n{$ctx}"],
            'report_comment' => [$base, "Write three different report-card comments (2–3 sentences each), warm and specific, ending with a next step.\n{$ctx}"],
            'announcement' => [$base, "Draft a short announcement for parents and students.\n{$ctx}\nFriendly, clear, under 150 words, with any date or action needed stated plainly."],
            'explain', 'tutor' => [$base.' You are a patient tutor. Teach step by step, check understanding with a question at the end, and do not simply give answers to homework — guide the student to them.', "Explain this so a student can understand it.\n{$ctx}"],
            'child_summary' => [$base, $this->childSummaryPrompt($d, $u)],
        };
    }

    protected function childSummaryPrompt(array $d, User $u): string
    {
        $ids = $this->school->familyStudentIds($u);
        abort_if(! $ids, 422, 'No child is linked to your account.');
        $id = $d['student_id'] ?? $ids[0];
        abort_if(! in_array($id, $ids, true), 403);

        $family = app(OverviewController::class)->family(request())->getData(true)['children'];
        $child = collect($family)->firstWhere('id', $id);

        return "Summarise this child's school week for their parent in under 150 words: what's going well, what needs attention, and one thing to do at home. Use only these facts.\n"
            .json_encode([
                'name' => $child['name'] ?? null, 'class' => $child['section']['label'] ?? null,
                'attendance_last_30_days' => $child['attendance'] ?? null, 'homework_due' => $child['homework_due'] ?? [],
                'recent_diary' => $child['diary'] ?? [],
            ], JSON_UNESCAPED_UNICODE);
    }
}

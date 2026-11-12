<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Course;
use App\Models\Lesson;
use App\Models\Quiz;
use App\Models\QuizAnswer;
use App\Models\QuizAttempt;
use App\Models\QuizOption;
use App\Models\QuizQuestion;
use App\Services\Learning;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\Rule;
use Illuminate\Validation\ValidationException;

/**
 * Quizzes live inside a "quiz" lesson. Teachers edit the whole question set at
 * once; students start an attempt, submit answers, and get an instant grade.
 * Passing the quiz completes its lesson.
 */
class QuizController extends Controller
{
    public const TYPES = ['single', 'multiple', 'true_false'];

    /** Seconds allowed after the time limit for slow connections. */
    public const GRACE_SECONDS = 60;

    public function __construct(protected Learning $learning) {}

    public function show(Request $request, Quiz $quiz): JsonResponse
    {
        $user = $request->user();
        [$course, $lesson] = $this->context($quiz);
        $manage = $this->learning->canManage($user, $course);

        if (! $manage) {
            $enrollment = $this->learning->enrollment($user, $course);
            [$open] = $lesson ? $this->learning->lessonAccess($user, $lesson, $course, $enrollment) : [false];
            abort_unless($open && $enrollment, 403, 'Enrol in this course to take the quiz.');
        }

        $quiz->load('questions.options');

        $attempts = QuizAttempt::where('quiz_id', $quiz->id)->where('user_id', $user->id)
            ->whereNotNull('submitted_at')->latest('submitted_at')->get();

        return response()->json([
            'id' => $quiz->id,
            'lesson_id' => $quiz->lesson_id,
            'course_id' => $quiz->course_id,
            'title' => $quiz->title,
            'description' => $quiz->description,
            'pass_percentage' => $quiz->pass_percentage,
            'time_limit_minutes' => $quiz->time_limit_minutes,
            'max_attempts' => $quiz->max_attempts,
            'shuffle_questions' => (bool) $quiz->shuffle_questions,
            'can_manage' => $manage,
            // Students get the questions only after starting an attempt.
            'questions' => $manage ? $quiz->questions->map(fn ($q) => $this->questionPayload($q, true))->values() : null,
            'questions_count' => $quiz->questions->count(),
            'attempts' => $attempts->map(fn ($a) => $this->attemptSummary($a))->values(),
            'passed' => $attempts->contains('passed', true),
            'attempts_left' => $quiz->max_attempts ? max(0, $quiz->max_attempts - $attempts->count()) : null,
        ]);
    }

    /** Teacher: save settings and replace the full question set. */
    public function update(Request $request, Quiz $quiz): JsonResponse
    {
        [$course] = $this->context($quiz);
        $this->learning->authorizeManage($request->user(), $course);

        $data = $request->validate([
            'title' => ['sometimes', 'string', 'max:200'],
            'description' => ['nullable', 'string', 'max:2000'],
            'pass_percentage' => ['sometimes', 'integer', 'between:1,100'],
            'time_limit_minutes' => ['nullable', 'integer', 'between:1,600'],
            'max_attempts' => ['nullable', 'integer', 'between:1,50'],
            'shuffle_questions' => ['sometimes', 'boolean'],
            'questions' => ['sometimes', 'array', 'max:200'],
            'questions.*.type' => ['required', Rule::in(self::TYPES)],
            'questions.*.question' => ['required', 'string', 'max:2000'],
            'questions.*.explanation' => ['nullable', 'string', 'max:2000'],
            'questions.*.points' => ['nullable', 'integer', 'between:1,100'],
            'questions.*.options' => ['required', 'array', 'min:2', 'max:10'],
            'questions.*.options.*.text' => ['required', 'string', 'max:500'],
            'questions.*.options.*.is_correct' => ['required', 'boolean'],
        ], [
            'questions.*.question.required' => 'Every question needs text.',
            'questions.*.options.min' => 'Every question needs at least two answers.',
            'questions.*.options.*.text.required' => 'Answers cannot be empty.',
        ]);

        foreach ($data['questions'] ?? [] as $i => $q) {
            $correct = collect($q['options'])->where('is_correct', true)->count();
            if ($correct === 0) {
                throw ValidationException::withMessages(["questions.$i.options" => 'Mark at least one correct answer.']);
            }
            if ($q['type'] !== 'multiple' && $correct > 1) {
                throw ValidationException::withMessages(["questions.$i.options" => 'This question type has exactly one correct answer.']);
            }
        }

        DB::transaction(function () use ($quiz, $data) {
            $quiz->fill(collect($data)->except('questions')->all())->save();

            if (! array_key_exists('questions', $data)) {
                return;
            }

            // Questions are replaced as a set. Past attempts keep their scores.
            QuizQuestion::where('quiz_id', $quiz->id)->delete(); // options cascade

            foreach (array_values($data['questions']) as $i => $q) {
                $question = new QuizQuestion([
                    'type' => $q['type'],
                    'question' => $q['question'],
                    'explanation' => $q['explanation'] ?? null,
                    'points' => $q['points'] ?? 1,
                    'position' => $i + 1,
                ]);
                $question->quiz_id = $quiz->id;
                $question->save();

                foreach (array_values($q['options']) as $j => $o) {
                    $option = new QuizOption(['text' => $o['text'], 'is_correct' => $o['is_correct'], 'position' => $j + 1]);
                    $option->question_id = $question->id;
                    $option->save();
                }
            }
        });

        if ($quiz->lesson_id && isset($data['title'])) {
            Lesson::whereKey($quiz->lesson_id)->update(['title' => $data['title']]);
        }

        return $this->show($request, $quiz->refresh());
    }

    /** Student: start (or resume) an attempt and receive the questions. */
    public function start(Request $request, Quiz $quiz): JsonResponse
    {
        $user = $request->user();
        [$course, $lesson] = $this->context($quiz);
        $enrollment = $this->learning->enrollment($user, $course);
        $manage = $this->learning->canManage($user, $course);

        if (! $manage) {
            [$open] = $lesson ? $this->learning->lessonAccess($user, $lesson, $course, $enrollment) : [false];
            abort_unless($enrollment && $open, 403, 'Enrol in this course to take the quiz.');
        }

        $quiz->load('questions.options');
        abort_if($quiz->questions->isEmpty(), 422, 'This quiz has no questions yet.');

        $open = QuizAttempt::where('quiz_id', $quiz->id)->where('user_id', $user->id)->whereNull('submitted_at')->latest()->first();
        if ($open && $this->expired($quiz, $open)) {
            $this->grade($quiz, $open, []); // time ran out: grade what was saved (nothing)
            $open = null;
        }

        if (! $open) {
            $used = QuizAttempt::where('quiz_id', $quiz->id)->where('user_id', $user->id)->whereNotNull('submitted_at')->count();
            if ($quiz->max_attempts && $used >= $quiz->max_attempts && ! $manage) {
                abort(422, 'You have used all your attempts for this quiz.');
            }

            $open = new QuizAttempt(['started_at' => now()]);
            $open->quiz_id = $quiz->id;
            $open->user_id = $user->id;
            $open->save();
        }

        $questions = $quiz->questions->map(fn ($q) => $this->questionPayload($q, false));
        if ($quiz->shuffle_questions) {
            $questions = $questions->shuffle();
        }

        return response()->json([
            'attempt_id' => $open->id,
            'started_at' => $open->started_at,
            'ends_at' => $quiz->time_limit_minutes ? $open->started_at->copy()->addMinutes($quiz->time_limit_minutes) : null,
            'questions' => $questions->values(),
        ]);
    }

    /** Student: submit answers. Body: { answers: { questionId: [optionId, ...] } } */
    public function submit(Request $request, QuizAttempt $attempt): JsonResponse
    {
        $user = $request->user();
        abort_unless((int) $attempt->user_id === (int) $user->id, 404);
        abort_if($attempt->submitted_at !== null, 422, 'This attempt was already submitted.');

        $data = $request->validate([
            'answers' => ['present', 'array'],
            'answers.*' => ['array'],
            'answers.*.*' => ['integer'],
        ]);

        $quiz = Quiz::with('questions.options')->findOrFail($attempt->quiz_id);
        $answers = $this->expired($quiz, $attempt, self::GRACE_SECONDS) ? [] : $data['answers'];

        $attempt = $this->grade($quiz, $attempt, $answers);

        $result = ['attempt' => $this->attemptSummary($attempt), 'progress' => null, 'review' => []];

        foreach ($quiz->questions as $q) {
            $chosen = array_map('intval', $answers[$q->id] ?? []);
            $result['review'][] = [
                'question_id' => $q->id,
                'chosen' => $chosen,
                'correct' => $q->options->where('is_correct', true)->pluck('id')->values(),
                'is_correct' => $this->isCorrect($q, $chosen),
                'explanation' => $q->explanation,
            ];
        }

        // Passing completes the quiz lesson and may finish the course.
        [$course] = $this->context($quiz);
        $enrollment = $this->learning->enrollment($user, $course);
        if ($attempt->passed && $quiz->lesson_id && $enrollment) {
            $this->learning->completeLesson($user, Lesson::findOrFail($quiz->lesson_id));
            $enrollment = $this->learning->recalculate($enrollment);
        }
        if ($enrollment) {
            $result['progress'] = $this->learning->progress($enrollment);
        }

        return response()->json($result);
    }

    /* ---------- Helpers ---------- */

    protected function grade(Quiz $quiz, QuizAttempt $attempt, array $answers): QuizAttempt
    {
        $score = 0;
        $max = 0;

        DB::transaction(function () use ($quiz, $attempt, $answers, &$score, &$max) {
            foreach ($quiz->questions as $q) {
                $chosen = array_values(array_unique(array_map('intval', $answers[$q->id] ?? [])));
                $correct = $this->isCorrect($q, $chosen);
                $max += $q->points;
                $score += $correct ? $q->points : 0;

                $answer = new QuizAnswer([
                    'question_id' => $q->id,
                    'option_ids' => $chosen,
                    'is_correct' => $correct,
                    'points_awarded' => $correct ? $q->points : 0,
                ]);
                $answer->attempt_id = $attempt->id;
                $answer->save();
            }

            $attempt->score = $score;
            $attempt->max_score = $max;
            $attempt->percentage = $max ? round($score * 100 / $max, 2) : 0;
            $attempt->passed = $attempt->percentage >= $quiz->pass_percentage;
            $attempt->submitted_at = now();
            $attempt->save();
        });

        return $attempt;
    }

    protected function isCorrect(QuizQuestion $q, array $chosen): bool
    {
        $correct = $q->options->where('is_correct', true)->pluck('id')->map(fn ($id) => (int) $id)->sort()->values()->all();
        sort($chosen);

        return $chosen === $correct;
    }

    protected function expired(Quiz $quiz, QuizAttempt $attempt, int $grace = 0): bool
    {
        return $quiz->time_limit_minutes
            && $attempt->started_at->copy()->addMinutes($quiz->time_limit_minutes)->addSeconds($grace)->isPast();
    }

    protected function questionPayload(QuizQuestion $q, bool $withAnswers): array
    {
        return [
            'id' => $q->id,
            'type' => $q->type,
            'question' => $q->question,
            'points' => $q->points,
            'explanation' => $withAnswers ? $q->explanation : null,
            'options' => $q->options->map(fn ($o) => array_filter([
                'id' => $o->id,
                'text' => $o->text,
                'is_correct' => $withAnswers ? (bool) $o->is_correct : null,
            ], fn ($v) => $v !== null))->values(),
        ];
    }

    protected function attemptSummary(QuizAttempt $a): array
    {
        return [
            'id' => $a->id,
            'score' => $a->score,
            'max_score' => $a->max_score,
            'percentage' => (float) $a->percentage,
            'passed' => (bool) $a->passed,
            'submitted_at' => $a->submitted_at,
        ];
    }

    /** @return array{0: Course, 1: ?Lesson} */
    protected function context(Quiz $quiz): array
    {
        $course = Course::findOrFail($quiz->course_id);
        $lesson = $quiz->lesson_id ? Lesson::find($quiz->lesson_id) : null;

        return [$course, $lesson];
    }
}

<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Course;
use App\Models\CourseSection;
use App\Models\Enrollment;
use App\Models\Lesson;
use App\Models\Quiz;
use App\Models\User;
use App\Services\Learning;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\Rule;

/**
 * Sections and lessons of a course: reading the outline, and the course builder.
 */
class CurriculumController extends Controller
{
    public const LESSON_TYPES = ['video', 'text', 'pdf', 'live', 'quiz', 'assignment'];

    /** lesson_id => my submission summary, for assignment lessons. */
    protected array $submissions = [];

    public function __construct(protected Learning $learning) {}

    /** Course outline. Content is included only for lessons this user may open. */
    public function show(Request $request, Course $course): JsonResponse
    {
        $user = $request->user();
        abort_unless($this->learning->canView($user, $course), 404);

        $course->load(['instructor', 'category', 'sections.lessons.quiz.questions']);
        $enrollment = $this->learning->enrollment($user, $course);
        $done = array_flip($this->learning->completedLessonIds($user, $course));
        $this->submissions = \App\Models\AssignmentSubmission::where('user_id', $user->id)
            ->whereIn('lesson_id', Lesson::where('course_id', $course->id)->where('type', 'assignment')->select('id'))
            ->get(['lesson_id', 'status', 'grade'])->keyBy('lesson_id')
            ->map(fn ($s) => ['status' => $s->status, 'grade' => $s->grade])->all();
        $manage = $this->learning->canManage($user, $course);

        $sections = $course->sections->map(fn (CourseSection $s) => [
            'id' => $s->id,
            'title' => $s->title,
            'position' => $s->position,
            'lessons' => $s->lessons->map(fn (Lesson $l) => $this->lessonPayload($l, $user, $course, $enrollment, isset($done[$l->id])))->values(),
        ])->values();

        $lessonCount = $course->sections->sum(fn ($s) => $s->lessons->count());

        return response()->json([
            'course' => [
                'id' => $course->id,
                'title' => $course->title,
                'slug' => $course->slug,
                'short_description' => $course->short_description,
                'description' => $course->description,
                'what_you_learn' => $course->what_you_learn,
                'thumbnail' => $course->thumbnail,
                'level' => $course->level,
                'language' => $course->language,
                'is_free' => (bool) $course->is_free,
                'price' => $course->price,
                'sale_price' => $course->sale_price,
                'currency' => $course->currency,
                'status' => $course->status,
                'certificate_enabled' => (bool) $course->certificate_enabled,
                'instructor' => $course->instructor?->only('id', 'name'),
                'category' => $course->category?->only('id', 'name'),
                'students_count' => $course->enrollments()->count(),
                'rating' => ($avg = $course->reviews()->avg('rating')) !== null ? round((float) $avg, 1) : null,
                'reviews_count' => $course->reviews()->count(),
            ],
            'sections' => $sections,
            'stats' => [
                'lessons' => $lessonCount,
                'duration_seconds' => $course->sections->sum(fn ($s) => $s->lessons->sum('duration_seconds')),
            ],
            'can_manage' => $manage,
            'enrollment' => $enrollment ? [
                'status' => $enrollment->status,
                'progress_percent' => $enrollment->progress_percent,
                'enrolled_at' => $enrollment->enrolled_at,
                'completed_at' => $enrollment->completed_at,
            ] : null,
            'pending_order' => $enrollment ? null : $course->orders()
                ->where('user_id', $user->id)->where('status', 'pending')
                ->first(['id', 'total', 'currency', 'payment_reference', 'created_at']),
            'certificate' => $enrollment?->status === 'completed'
                ? $course->certificates()->where('user_id', $user->id)->first(['code', 'issued_at'])
                : null,
        ]);
    }

    /* ---------- Sections ---------- */

    public function storeSection(Request $request, Course $course): JsonResponse
    {
        $this->learning->authorizeManage($request->user(), $course);
        $data = $request->validate(['title' => ['required', 'string', 'max:200']]);

        $section = $course->sections()->create([
            'title' => $data['title'],
            'position' => (int) $course->sections()->max('position') + 1,
        ]);

        return response()->json(['id' => $section->id, 'title' => $section->title, 'position' => $section->position, 'lessons' => []], 201);
    }

    public function updateSection(Request $request, CourseSection $section): JsonResponse
    {
        $this->learning->authorizeManage($request->user(), $section->course()->firstOrFail());
        $section->update($request->validate(['title' => ['required', 'string', 'max:200']]));

        return response()->json(['id' => $section->id, 'title' => $section->title]);
    }

    public function destroySection(Request $request, CourseSection $section): JsonResponse
    {
        $course = $section->course()->firstOrFail();
        $this->learning->authorizeManage($request->user(), $course);
        $section->delete();
        $this->refreshProgress($course);

        return response()->json(['message' => 'Section deleted.']);
    }

    /* ---------- Lessons ---------- */

    public function storeLesson(Request $request, CourseSection $section): JsonResponse
    {
        $course = $section->course()->firstOrFail();
        $this->learning->authorizeManage($request->user(), $course);
        $data = $this->validateLesson($request);

        $lesson = DB::transaction(function () use ($data, $section, $course) {
            $lesson = new Lesson($data);
            $lesson->course_id = $course->id;
            $lesson->section_id = $section->id;
            $lesson->position = (int) Lesson::where('section_id', $section->id)->max('position') + 1;
            $lesson->save();

            if ($lesson->type === 'quiz') {
                $quiz = new Quiz(['title' => $lesson->title, 'pass_percentage' => 60]);
                $quiz->course_id = $course->id;
                $quiz->lesson_id = $lesson->id;
                $quiz->save();
            }

            return $lesson;
        });

        $this->refreshProgress($course);

        return response()->json($this->lessonPayload($lesson->load('quiz.questions'), $request->user(), $course, null, false), 201);
    }

    public function updateLesson(Request $request, Lesson $lesson): JsonResponse
    {
        $course = $lesson->course()->firstOrFail();
        $this->learning->authorizeManage($request->user(), $course);
        $data = $this->validateLesson($request, $lesson);
        unset($data['type']); // a lesson's type is fixed once created

        $lesson->update($data);

        if ($lesson->type === 'quiz' && isset($data['title'])) {
            Quiz::where('lesson_id', $lesson->id)->update(['title' => $data['title']]);
        }

        return response()->json($this->lessonPayload($lesson->load('quiz.questions'), $request->user(), $course, null, false));
    }

    public function destroyLesson(Request $request, Lesson $lesson): JsonResponse
    {
        $course = $lesson->course()->firstOrFail();
        $this->learning->authorizeManage($request->user(), $course);
        $lesson->delete();
        $this->refreshProgress($course);

        return response()->json(['message' => 'Lesson deleted.']);
    }

    /** Body: { sections: [{ id, lessons: [lessonId, ...] }, ...] } in the new order. */
    public function reorder(Request $request, Course $course): JsonResponse
    {
        $this->learning->authorizeManage($request->user(), $course);
        $data = $request->validate([
            'sections' => ['required', 'array'],
            'sections.*.id' => ['required', 'integer'],
            'sections.*.lessons' => ['present', 'array'],
            'sections.*.lessons.*' => ['integer'],
        ]);

        $sectionIds = CourseSection::where('course_id', $course->id)->pluck('id')->map(fn ($id) => (int) $id)->all();
        $lessonIds = Lesson::where('course_id', $course->id)->pluck('id')->map(fn ($id) => (int) $id)->all();

        DB::transaction(function () use ($data, $sectionIds, $lessonIds) {
            foreach (array_values($data['sections']) as $i => $section) {
                abort_unless(in_array((int) $section['id'], $sectionIds, true), 422, 'Unknown section.');
                CourseSection::whereKey($section['id'])->update(['position' => $i + 1]);

                foreach (array_values($section['lessons']) as $j => $lessonId) {
                    abort_unless(in_array((int) $lessonId, $lessonIds, true), 422, 'Unknown lesson.');
                    Lesson::whereKey($lessonId)->update(['section_id' => $section['id'], 'position' => $j + 1]);
                }
            }
        });

        return response()->json(['message' => 'Order saved.']);
    }

    /* ---------- Helpers ---------- */

    protected function validateLesson(Request $request, ?Lesson $lesson = null): array
    {
        $sometimes = $lesson ? 'sometimes' : 'required';

        return $request->validate([
            'title' => [$sometimes, 'string', 'max:200'],
            'summary' => ['nullable', 'string', 'max:500'],
            'type' => [$lesson ? 'prohibited' : 'required', Rule::in(self::LESSON_TYPES)],
            'content' => ['nullable', 'string', 'max:100000'],
            'video_url' => ['nullable', 'url:http,https', 'max:500'],
            'file_path' => ['nullable', 'url:http,https', 'max:500'],
            'live_url' => ['nullable', 'url:http,https', 'max:500'],
            'live_starts_at' => ['nullable', 'date'],
            'duration_seconds' => ['nullable', 'integer', 'min:0', 'max:86400'],
            'is_preview' => ['sometimes', 'boolean'],
            'drip_days' => ['nullable', 'integer', 'min:0', 'max:365'],
            'max_points' => ['nullable', 'integer', 'min:1', 'max:1000'],
        ]);
    }

    public function lessonPayload(Lesson $lesson, User $user, Course $course, ?Enrollment $enrollment, bool $completed): array
    {
        [$open, $reason] = $this->learning->lessonAccess($user, $lesson, $course, $enrollment);
        $quiz = $lesson->type === 'quiz' ? $lesson->quiz : null;

        $payload = [
            'id' => $lesson->id,
            'section_id' => $lesson->section_id,
            'title' => $lesson->title,
            'summary' => $lesson->summary,
            'type' => $lesson->type,
            'duration_seconds' => (int) $lesson->duration_seconds,
            'is_preview' => (bool) $lesson->is_preview,
            'drip_days' => $lesson->drip_days,
            'max_points' => $lesson->type === 'assignment' ? ($lesson->max_points ?: 100) : null,
            'submission' => $this->submissions[$lesson->id] ?? null,
            'position' => $lesson->position,
            'completed' => $completed,
            'locked' => ! $open,
            'locked_reason' => $open ? null : $reason,
            'quiz' => $quiz ? [
                'id' => $quiz->id,
                'questions_count' => $quiz->questions->count(),
                'pass_percentage' => $quiz->pass_percentage,
                'time_limit_minutes' => $quiz->time_limit_minutes,
                'max_attempts' => $quiz->max_attempts,
            ] : null,
        ];

        if ($open) {
            $payload += [
                'content' => $lesson->content,
                'video_url' => $lesson->video_url,
                'file_path' => $lesson->file_path,
                'live_url' => $lesson->live_url,
                'live_starts_at' => $lesson->live_starts_at,
            ];
        }

        return $payload;
    }

    /** Lesson counts changed, so stored percentages need refreshing. */
    protected function refreshProgress(Course $course): void
    {
        Enrollment::where('course_id', $course->id)->get()->each(fn ($e) => $this->learning->recalculate($e));
    }
}

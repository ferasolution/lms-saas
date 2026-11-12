<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Certificate;
use App\Models\Course;
use App\Models\Enrollment;
use App\Models\Lesson;
use App\Models\LessonProgress;
use App\Models\Order;
use App\Models\User;
use App\Services\Learning;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

/**
 * The student side: enrolling, studying lessons, progress and certificates,
 * plus the teacher's view of who is enrolled.
 */
class LearningController extends Controller
{
    public function __construct(protected Learning $learning) {}

    /**
     * Free course: enrol straight away.
     * Paid course: create a payment request with the student's transaction reference.
     */
    public function enrol(Request $request, Course $course): JsonResponse
    {
        $user = $request->user();
        abort_unless($course->status === Course::STATUS_PUBLISHED, 404);

        if ($existing = $this->learning->enrollment($user, $course)) {
            if ($existing->status !== 'cancelled') {
                return response()->json(['status' => 'enrolled', 'progress_percent' => $existing->progress_percent]);
            }
        }

        if (! $course->isPaid()) {
            $enrollment = $this->learning->enrol($user, $course);

            return response()->json(['status' => 'enrolled', 'progress_percent' => $enrollment->progress_percent], 201);
        }

        $data = $request->validate([
            'payment_method' => ['required', Rule::in(['jazzcash', 'easypaisa', 'bank', 'cash'])],
            'payment_reference' => ['required', 'string', 'max:120'],
            'note' => ['nullable', 'string', 'max:500'],
        ], [
            'payment_reference.required' => 'Enter the transaction ID or receipt number so the institute can find your payment.',
        ]);

        $order = Order::where('user_id', $user->id)->where('course_id', $course->id)->where('status', 'pending')->first()
            ?? new Order(['user_id' => $user->id, 'course_id' => $course->id]);

        $order->fill([
            'amount' => (float) $course->price,
            'discount' => max(0, (float) $course->price - $course->effectivePrice()),
            'total' => $course->effectivePrice(),
            'currency' => $course->currency,
            'gateway' => $data['payment_method'],
            'payment_reference' => $data['payment_reference'],
            'note' => $data['note'] ?? null,
            'status' => 'pending',
        ]);
        $order->user_id = $user->id;
        $order->course_id = $course->id;
        $order->save();

        return response()->json(['status' => 'pending', 'order_id' => $order->id], 202);
    }

    /** The student's own courses with progress, newest activity first. */
    public function myCourses(Request $request): JsonResponse
    {
        $enrollments = Enrollment::with(['course' => fn ($q) => $q->withTrashed()->with('instructor')])
            ->where('user_id', $request->user()->id)
            ->where('status', '!=', 'cancelled')
            ->latest('updated_at')
            ->get()
            ->filter(fn ($e) => $e->course && ! $e->course->trashed());

        $certificates = Certificate::where('user_id', $request->user()->id)->pluck('code', 'course_id');

        $nextLessons = $this->nextLessons($request->user(), $enrollments->pluck('course_id')->all());

        return response()->json(['data' => $enrollments->map(fn (Enrollment $e) => [
            'course' => [
                'id' => $e->course->id,
                'title' => $e->course->title,
                'thumbnail' => $e->course->thumbnail,
                'instructor' => $e->course->instructor?->only('id', 'name'),
            ],
            'status' => $e->status,
            'progress_percent' => $e->progress_percent,
            'enrolled_at' => $e->enrolled_at,
            'completed_at' => $e->completed_at,
            'next_lesson' => $nextLessons[$e->course_id] ?? null,
            'certificate_code' => $certificates[$e->course_id] ?? null,
        ])->values()]);
    }

    public function completeLesson(Request $request, Lesson $lesson): JsonResponse
    {
        $user = $request->user();
        $course = $lesson->course()->firstOrFail();
        $enrollment = $this->learning->enrollment($user, $course);

        abort_unless($enrollment && $enrollment->status !== 'cancelled', 403, 'Enrol in this course first.');
        [$open] = $this->learning->lessonAccess($user, $lesson, $course, $enrollment);
        abort_unless($open, 403, 'This lesson is not open yet.');
        abort_if($lesson->type === 'quiz', 422, 'Pass the quiz to complete this lesson.');

        $this->learning->completeLesson($user, $lesson);
        $enrollment = $this->learning->recalculate($enrollment);

        return response()->json($this->learning->progress($enrollment));
    }

    /* ---------- Certificates ---------- */

    public function myCertificates(Request $request): JsonResponse
    {
        $certs = Certificate::with('course')
            ->where('user_id', $request->user()->id)
            ->latest('issued_at')
            ->get();

        return response()->json(['data' => $certs->map(fn ($c) => [
            'code' => $c->code,
            'issued_at' => $c->issued_at,
            'course' => $c->course?->only('id', 'title'),
        ])]);
    }

    /** Public: anyone with the code can check a certificate is genuine. */
    public function verifyCertificate(string $code): JsonResponse
    {
        $cert = Certificate::withoutGlobalScope('tenant')
            ->with([
                'user' => fn ($q) => $q->withoutGlobalScope('tenant'),
                'course' => fn ($q) => $q->withoutGlobalScope('tenant')->withTrashed()->with(['instructor' => fn ($q) => $q->withoutGlobalScope('tenant')]),
                'tenant',
            ])
            ->where('code', $code)
            ->first();

        abort_unless($cert && $cert->user && $cert->course && $cert->tenant, 404, 'No certificate has this code.');

        return response()->json([
            'code' => $cert->code,
            'issued_at' => $cert->issued_at,
            'student_name' => $cert->user->name,
            'course_title' => $cert->course->title,
            'instructor_name' => $cert->course->instructor?->name,
            'institute' => [
                'name' => $cert->tenant->name,
                'slug' => $cert->tenant->slug,
                // Only what the certificate itself shows; never payment or contact details.
                'settings' => (object) collect($cert->tenant->settings ?? [])->only(['brand', 'logo_url', 'certificate_signatory'])->all(),
            ],
        ]);
    }

    /* ---------- Teacher view of a course's students ---------- */

    public function students(Request $request, Course $course): JsonResponse
    {
        $this->learning->authorizeManage($request->user(), $course);

        $enrollments = Enrollment::with('user')
            ->where('course_id', $course->id)
            ->orderByDesc('progress_percent')
            ->orderBy('enrolled_at')
            ->get();

        $lastActive = LessonProgress::query()
            ->whereIn('lesson_id', Lesson::where('course_id', $course->id)->select('id'))
            ->selectRaw('user_id, max(updated_at) as last_at')
            ->groupBy('user_id')
            ->pluck('last_at', 'user_id');

        return response()->json(['data' => $enrollments->filter(fn ($e) => $e->user)->map(fn (Enrollment $e) => [
            'user' => $e->user->only('id', 'name', 'email'),
            'status' => $e->status,
            'progress_percent' => $e->progress_percent,
            'enrolled_at' => $e->enrolled_at,
            'completed_at' => $e->completed_at,
            'last_active_at' => $lastActive[$e->user_id] ?? null,
        ])->values()]);
    }

    /** Admin/instructor adds students to a course directly (e.g. after cash payment). */
    public function addStudents(Request $request, Course $course): JsonResponse
    {
        $this->learning->authorizeManage($request->user(), $course);
        $data = $request->validate([
            'user_ids' => ['required', 'array', 'max:500'],
            'user_ids.*' => ['integer'],
        ]);

        $students = User::whereIn('id', $data['user_ids'])->where('role', User::ROLE_STUDENT)->get();
        foreach ($students as $student) {
            $this->learning->enrol($student, $course);
        }

        return response()->json(['added' => $students->count()]);
    }

    public function removeStudent(Request $request, Course $course, User $user): JsonResponse
    {
        $this->learning->authorizeManage($request->user(), $course);
        Enrollment::where('course_id', $course->id)->where('user_id', $user->id)->update(['status' => 'cancelled']);

        return response()->json(['message' => 'Removed from course.']);
    }

    /* ---------- Helpers ---------- */

    /** First unfinished lesson per course, so "Continue" opens the right place. */
    protected function nextLessons(User $user, array $courseIds): array
    {
        if (! $courseIds) {
            return [];
        }

        $done = LessonProgress::where('user_id', $user->id)->whereNotNull('completed_at')->pluck('lesson_id')->flip();
        $lessons = Lesson::query()
            ->join('course_sections', 'course_sections.id', '=', 'lessons.section_id')
            ->whereIn('lessons.course_id', $courseIds)
            ->orderBy('course_sections.position')
            ->orderBy('lessons.position')
            ->get(['lessons.id', 'lessons.course_id', 'lessons.title']);

        $next = [];
        foreach ($lessons as $lesson) {
            if (! isset($next[$lesson->course_id]) && ! isset($done[$lesson->id])) {
                $next[$lesson->course_id] = ['id' => $lesson->id, 'title' => $lesson->title];
            }
        }

        return $next;
    }
}

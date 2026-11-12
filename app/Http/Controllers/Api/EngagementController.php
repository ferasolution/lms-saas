<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Announcement;
use App\Models\AssignmentSubmission;
use App\Models\Course;
use App\Models\CourseReview;
use App\Models\Enrollment;
use App\Models\Lesson;
use App\Models\LessonComment;
use App\Models\User;
use App\Models\UserNotification;
use App\Services\Learning;
use App\Services\Notifier;
use App\Tenancy\TenantManager;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Str;
use Illuminate\Validation\Rule;

/**
 * Notifications, announcements, reviews, lesson discussion and assignments.
 */
class EngagementController extends Controller
{
    public function __construct(protected Learning $learning, protected Notifier $notifier, protected TenantManager $tenants) {}

    /* ============================================================ notifications */

    public function notifications(Request $request): JsonResponse
    {
        $uid = $request->user()->id;

        return response()->json([
            'unread' => UserNotification::where('user_id', $uid)->whereNull('read_at')->count(),
            'data' => UserNotification::where('user_id', $uid)->latest('id')->limit(40)
                ->get(['id', 'type', 'title', 'body', 'url', 'read_at', 'created_at']),
        ]);
    }

    public function readNotifications(Request $request): JsonResponse
    {
        $ids = $request->validate(['ids' => ['nullable', 'array'], 'ids.*' => ['integer']])['ids'] ?? null;

        UserNotification::where('user_id', $request->user()->id)->whereNull('read_at')
            ->when($ids, fn ($q) => $q->whereIn('id', $ids))
            ->update(['read_at' => now()]);

        return response()->json(['unread' => UserNotification::where('user_id', $request->user()->id)->whereNull('read_at')->count()]);
    }

    /* ============================================================ announcements */

    public function announcements(Request $request): JsonResponse
    {
        $user = $request->user();
        $tenantId = $this->tenants->id();
        $audiences = ['everyone', match (true) {
            $user->hasRole(User::ROLE_ADMIN) => 'admins',
            $user->hasRole(User::ROLE_INSTRUCTOR) => 'teachers',
            default => 'students',
        }];
        if ($user->hasRole(User::ROLE_ADMIN)) {
            $audiences[] = 'teachers';
        }

        $myCourses = $user->hasRole(User::ROLE_ADMIN)
            ? null
            : Enrollment::where('user_id', $user->id)->where('status', '!=', 'cancelled')->pluck('course_id')
                ->merge(Course::where('instructor_id', $user->id)->pluck('id'))->unique()->values()->all();

        $items = Announcement::with(['author', 'course'])
            ->where(function ($q) use ($tenantId, $audiences, $myCourses, $user) {
                // Institute-wide announcements for my audience.
                $q->where(fn ($q) => $q->where('tenant_id', $tenantId)->whereNull('course_id')->whereIn('audience', $audiences))
                    // Course announcements for my courses.
                    ->orWhere(fn ($q) => $q->where('tenant_id', $tenantId)->whereNotNull('course_id')
                        ->when($myCourses !== null, fn ($q) => $q->whereIn('course_id', $myCourses)));
                // Platform news, for admins.
                if ($user->hasRole(User::ROLE_ADMIN)) {
                    $q->orWhereNull('tenant_id');
                }
            })
            ->when($request->filled('course_id'), fn ($q) => $q->where('course_id', $request->integer('course_id')))
            ->orderByDesc('pinned')->latest('id')->limit(30)->get();

        return response()->json(['data' => $items->map(fn (Announcement $a) => $this->announcementRow($a, $user))]);
    }

    public function storeAnnouncement(Request $request): JsonResponse
    {
        $user = $request->user();
        $data = $request->validate([
            'title' => ['required', 'string', 'max:200'],
            'body' => ['required', 'string', 'max:5000'],
            'course_id' => ['nullable', 'integer'],
            'audience' => ['sometimes', Rule::in(Announcement::AUDIENCES)],
            'pinned' => ['sometimes', 'boolean'],
        ]);

        $course = null;
        if (! empty($data['course_id'])) {
            $course = Course::findOrFail($data['course_id']);
            $this->learning->authorizeManage($user, $course);
            $data['audience'] = 'students';
        } else {
            abort_unless($user->hasRole(User::ROLE_ADMIN), 403, 'Only admins can post to the whole institute.');
        }

        $a = new Announcement($data + ['audience' => 'everyone']);
        $a->tenant_id = $this->tenants->id();
        $a->user_id = $user->id;
        $a->save();

        // Notify the audience.
        $tenantId = $this->tenants->id();
        $ids = $course
            ? Enrollment::where('course_id', $course->id)->where('status', '!=', 'cancelled')->pluck('user_id')->all()
            : $this->notifier->roleIds($tenantId, match ($a->audience) {
                'students' => [User::ROLE_STUDENT, User::ROLE_PARENT],
                'teachers' => [User::ROLE_INSTRUCTOR, User::ROLE_ADMIN],
                'admins' => [User::ROLE_ADMIN],
                default => User::TENANT_ROLES,
            });
        $ids = array_values(array_diff($ids, [$user->id]));
        $this->notifier->send($ids, 'announcement', $a->title, Str::limit($a->body, 140),
            $course ? "/courses/{$course->id}" : '/', $tenantId);

        return response()->json($this->announcementRow($a->load(['author', 'course']), $user), 201);
    }

    public function destroyAnnouncement(Request $request, Announcement $announcement): JsonResponse
    {
        $user = $request->user();
        abort_unless((int) $announcement->tenant_id === (int) $this->tenants->id(), 404);
        $can = $user->hasRole(User::ROLE_ADMIN) || (int) $announcement->user_id === (int) $user->id;
        abort_unless($can, 403);
        $announcement->delete();

        return response()->json(['message' => 'Announcement removed.']);
    }

    protected function announcementRow(Announcement $a, User $viewer): array
    {
        return [
            'id' => $a->id,
            'title' => $a->title,
            'body' => $a->body,
            'audience' => $a->audience,
            'pinned' => (bool) $a->pinned,
            'platform' => $a->tenant_id === null,
            'course' => $a->course?->only('id', 'title'),
            'author' => $a->tenant_id === null ? ['name' => 'Fera Learn'] : $a->author?->only('id', 'name'),
            'created_at' => $a->created_at,
            'can_delete' => $a->tenant_id !== null && ($viewer->hasRole(User::ROLE_ADMIN) || (int) $a->user_id === (int) $viewer->id),
        ];
    }

    /* ============================================================ reviews */

    public function reviews(Request $request, Course $course): JsonResponse
    {
        abort_unless($this->learning->canView($request->user(), $course), 404);
        $reviews = CourseReview::with('user')->where('course_id', $course->id)->latest()->limit(100)->get();
        $dist = $reviews->countBy('rating');

        return response()->json([
            'average' => $reviews->count() ? round($reviews->avg('rating'), 1) : null,
            'count' => $reviews->count(),
            'distribution' => collect(range(5, 1))->mapWithKeys(fn ($r) => [$r => (int) ($dist[$r] ?? 0)]),
            'mine' => $reviews->firstWhere('user_id', $request->user()->id)?->only('id', 'rating', 'body'),
            'can_review' => (bool) $this->learning->enrollment($request->user(), $course),
            'data' => $reviews->map(fn ($r) => [
                'id' => $r->id, 'rating' => $r->rating, 'body' => $r->body, 'created_at' => $r->created_at,
                'user' => $r->user?->only('id', 'name'),
                'can_delete' => (int) $r->user_id === (int) $request->user()->id || $request->user()->hasRole(User::ROLE_ADMIN),
            ])->values(),
        ]);
    }

    public function storeReview(Request $request, Course $course): JsonResponse
    {
        $user = $request->user();
        $enrollment = $this->learning->enrollment($user, $course);
        abort_unless($enrollment && $enrollment->status !== 'cancelled', 403, 'Enrol in the course to review it.');

        $data = $request->validate([
            'rating' => ['required', 'integer', 'between:1,5'],
            'body' => ['nullable', 'string', 'max:2000'],
        ]);

        $review = CourseReview::firstOrNew(['course_id' => $course->id, 'user_id' => $user->id]);
        $isNew = ! $review->exists;
        $review->fill($data)->save();

        if ($isNew && $course->instructor_id) {
            $this->notifier->send($course->instructor_id, 'review', "{$user->name} rated “{$course->title}” {$data['rating']}/5",
                $data['body'] ? Str::limit($data['body'], 140) : null, "/courses/{$course->id}", $this->tenants->id());
        }

        return response()->json($review->only('id', 'rating', 'body'), $isNew ? 201 : 200);
    }

    public function destroyReview(Request $request, CourseReview $review): JsonResponse
    {
        $user = $request->user();
        abort_unless((int) $review->user_id === (int) $user->id || $user->hasRole(User::ROLE_ADMIN), 403);
        $review->delete();

        return response()->json(['message' => 'Review removed.']);
    }

    /* ============================================================ lesson discussion */

    public function comments(Request $request, Lesson $lesson): JsonResponse
    {
        [$course] = $this->lessonAccess($request->user(), $lesson);

        $comments = LessonComment::with(['user', 'replies.user'])
            ->where('lesson_id', $lesson->id)->whereNull('parent_id')
            ->latest()->limit(100)->get();

        $manage = $this->learning->canManage($request->user(), $course);

        return response()->json(['data' => $comments->map(fn ($c) => $this->commentRow($c, $request->user(), $manage, $course))]);
    }

    public function storeComment(Request $request, Lesson $lesson): JsonResponse
    {
        $user = $request->user();
        [$course] = $this->lessonAccess($user, $lesson);

        $data = $request->validate([
            'body' => ['required', 'string', 'max:3000'],
            'parent_id' => ['nullable', 'integer'],
        ]);

        $parent = null;
        if (! empty($data['parent_id'])) {
            $parent = LessonComment::where('lesson_id', $lesson->id)->whereNull('parent_id')->findOrFail($data['parent_id']);
        }

        $c = new LessonComment(['body' => $data['body'], 'parent_id' => $parent?->id]);
        $c->lesson_id = $lesson->id;
        $c->user_id = $user->id;
        $c->save();

        $url = "/learn/{$course->id}/{$lesson->id}";
        $tenantId = $this->tenants->id();
        if ($parent && (int) $parent->user_id !== (int) $user->id) {
            $this->notifier->send($parent->user_id, 'reply', "{$user->name} replied on “{$lesson->title}”", Str::limit($data['body'], 140), $url, $tenantId);
        }
        if (! $parent && $course->instructor_id && (int) $course->instructor_id !== (int) $user->id) {
            $this->notifier->send($course->instructor_id, 'question', "New question on “{$lesson->title}”", "{$user->name}: ".Str::limit($data['body'], 120), $url, $tenantId);
        }

        return response()->json($this->commentRow($c->load(['user', 'replies.user']), $user, $this->learning->canManage($user, $course), $course), 201);
    }

    public function destroyComment(Request $request, LessonComment $comment): JsonResponse
    {
        $user = $request->user();
        $lesson = Lesson::findOrFail($comment->lesson_id);
        $course = Course::findOrFail($lesson->course_id);
        abort_unless((int) $comment->user_id === (int) $user->id || $this->learning->canManage($user, $course), 403);
        $comment->delete();

        return response()->json(['message' => 'Comment removed.']);
    }

    protected function commentRow(LessonComment $c, User $viewer, bool $manage, Course $course): array
    {
        $row = fn (LessonComment $x) => [
            'id' => $x->id,
            'body' => $x->body,
            'created_at' => $x->created_at,
            'user' => $x->user?->only('id', 'name', 'role'),
            'is_teacher' => $x->user && ($x->user->hasRole(User::ROLE_ADMIN) || (int) $x->user_id === (int) $course->instructor_id),
            'can_delete' => $manage || (int) $x->user_id === (int) $viewer->id,
        ];

        return $row($c) + ['replies' => $c->replies->map($row)->values()];
    }

    /* ============================================================ assignments */

    public function mySubmission(Request $request, Lesson $lesson): JsonResponse
    {
        abort_unless($lesson->type === 'assignment', 404);
        $this->lessonAccess($request->user(), $lesson);
        $s = AssignmentSubmission::where('lesson_id', $lesson->id)->where('user_id', $request->user()->id)->first();

        return response()->json(['submission' => $s ? $this->submissionRow($s) : null, 'max_points' => $lesson->max_points]);
    }

    public function submit(Request $request, Lesson $lesson): JsonResponse
    {
        abort_unless($lesson->type === 'assignment', 404);
        $user = $request->user();
        [$course, $enrollment] = $this->lessonAccess($user, $lesson);
        abort_unless($enrollment, 403, 'Enrol in this course to submit work.');

        $data = $request->validate([
            'body' => ['nullable', 'string', 'max:20000', 'required_without:file_path'],
            'file_path' => ['nullable', 'url:http,https', 'max:500'],
        ], ['body.required_without' => 'Write your answer or attach a file.']);

        $s = AssignmentSubmission::firstOrNew(['lesson_id' => $lesson->id, 'user_id' => $user->id]);
        abort_if($s->exists && $s->status === 'graded', 422, 'This work has already been graded.');
        $s->fill($data + ['status' => 'submitted', 'submitted_at' => now()])->save();

        // Handing in completes the lesson; the grade comes later.
        $this->learning->completeLesson($user, $lesson);
        $enrollment = $this->learning->recalculate($enrollment);

        if ($course->instructor_id) {
            $this->notifier->send($course->instructor_id, 'submission', "{$user->name} handed in “{$lesson->title}”", $course->title,
                "/courses/{$course->id}?tab=grading", $this->tenants->id());
        }

        return response()->json(['submission' => $this->submissionRow($s), 'progress' => $this->learning->progress($enrollment)], 201);
    }

    /** Teacher: work waiting to be graded (or all of it) in courses they manage. */
    public function submissions(Request $request): JsonResponse
    {
        $user = $request->user();
        $data = $request->validate([
            'status' => ['nullable', Rule::in(['submitted', 'graded'])],
            'course_id' => ['nullable', 'integer'],
            'lesson_id' => ['nullable', 'integer'],
        ]);

        $courseIds = Course::query()
            ->when(! $user->hasRole(User::ROLE_ADMIN), fn ($q) => $q->where('instructor_id', $user->id))
            ->when($data['course_id'] ?? null, fn ($q, $id) => $q->whereKey($id))
            ->pluck('id');

        $subs = AssignmentSubmission::with(['user', 'lesson'])
            ->whereIn('lesson_id', Lesson::whereIn('course_id', $courseIds)->where('type', 'assignment')->select('id'))
            ->when($data['status'] ?? null, fn ($q, $s) => $q->where('status', $s))
            ->when($data['lesson_id'] ?? null, fn ($q, $id) => $q->where('lesson_id', $id))
            ->latest('submitted_at')->limit(200)->get();

        return response()->json(['data' => $subs->map(fn ($s) => $this->submissionRow($s, true))->values()]);
    }

    public function grade(Request $request, AssignmentSubmission $submission): JsonResponse
    {
        $lesson = Lesson::findOrFail($submission->lesson_id);
        $course = Course::findOrFail($lesson->course_id);
        $this->learning->authorizeManage($request->user(), $course);

        $data = $request->validate([
            'grade' => ['required', 'integer', 'min:0', 'max:'.($lesson->max_points ?: 100)],
            'feedback' => ['nullable', 'string', 'max:5000'],
        ]);

        $submission->fill($data + ['status' => 'graded', 'graded_at' => now()]);
        $submission->graded_by = $request->user()->id;
        $submission->save();

        $this->notifier->send($submission->user_id, 'graded', "“{$lesson->title}” was graded: {$data['grade']}/".($lesson->max_points ?: 100),
            $data['feedback'] ? Str::limit($data['feedback'], 140) : null, "/learn/{$course->id}/{$lesson->id}", $this->tenants->id());

        return response()->json($this->submissionRow($submission->load(['user', 'lesson']), true));
    }

    protected function submissionRow(AssignmentSubmission $s, bool $withContext = false): array
    {
        $row = [
            'id' => $s->id,
            'status' => $s->status,
            'body' => $s->body,
            'file_path' => $s->file_path,
            'grade' => $s->grade,
            'feedback' => $s->feedback,
            'submitted_at' => $s->submitted_at,
            'graded_at' => $s->graded_at,
        ];
        if ($withContext) {
            $row['user'] = $s->user?->only('id', 'name', 'email');
            $row['lesson'] = $s->lesson ? ['id' => $s->lesson->id, 'title' => $s->lesson->title, 'course_id' => $s->lesson->course_id, 'max_points' => $s->lesson->max_points ?: 100] : null;
        }

        return $row;
    }

    /** @return array{0: Course, 1: ?Enrollment} */
    protected function lessonAccess(User $user, Lesson $lesson): array
    {
        $course = Course::findOrFail($lesson->course_id);
        $enrollment = $this->learning->enrollment($user, $course);
        if ($enrollment?->status === 'cancelled') {
            $enrollment = null;
        }
        [$open] = $this->learning->lessonAccess($user, $lesson, $course, $enrollment);
        abort_unless($open, 403, 'Enrol in this course to join in.');

        return [$course, $enrollment];
    }
}

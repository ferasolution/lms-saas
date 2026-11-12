<?php

namespace App\Services;

use App\Models\Certificate;
use App\Models\Course;
use App\Models\Enrollment;
use App\Models\Lesson;
use App\Models\LessonProgress;
use App\Models\User;
use Illuminate\Support\Str;

/**
 * Who may see or change a course, and what happens as a student progresses.
 */
class Learning
{
    /* ---------- Access ---------- */

    public function canManage(User $user, Course $course): bool
    {
        return $user->hasRole(User::ROLE_ADMIN)
            || ($user->hasRole(User::ROLE_INSTRUCTOR) && (int) $course->instructor_id === (int) $user->id);
    }

    public function authorizeManage(User $user, Course $course): void
    {
        abort_unless($this->canManage($user, $course), 403, 'You do not have permission to manage this course.');
    }

    public function enrollment(User $user, Course $course): ?Enrollment
    {
        return Enrollment::where('user_id', $user->id)->where('course_id', $course->id)->first();
    }

    /** Students see a course only once it is published, unless they are already enrolled. */
    public function canView(User $user, Course $course): bool
    {
        return $course->status === Course::STATUS_PUBLISHED
            || $this->canManage($user, $course)
            || $this->enrollment($user, $course) !== null;
    }

    /**
     * Can this user open a lesson's content?
     * Returns [allowed, reason] where reason is 'enrol' or 'drip:<date>'.
     */
    public function lessonAccess(User $user, Lesson $lesson, Course $course, ?Enrollment $enrollment): array
    {
        if ($this->canManage($user, $course)) {
            return [true, null];
        }

        if (! $enrollment || $enrollment->status === 'cancelled') {
            return [(bool) $lesson->is_preview, 'enrol'];
        }

        if ($lesson->drip_days && $enrollment->enrolled_at) {
            $opens = $enrollment->enrolled_at->copy()->addDays($lesson->drip_days);
            if ($opens->isFuture()) {
                return [false, 'drip:'.$opens->toIso8601String()];
            }
        }

        return [true, null];
    }

    /* ---------- Enrolment & progress ---------- */

    public function enrol(User $user, Course $course): Enrollment
    {
        $enrollment = Enrollment::firstOrNew(['user_id' => $user->id, 'course_id' => $course->id]);
        $enrollment->tenant_id = $course->tenant_id;

        if (! $enrollment->exists || $enrollment->status === 'cancelled') {
            $enrollment->status = 'active';
            $enrollment->enrolled_at = now();
            $enrollment->completed_at = null;
        }

        $enrollment->save();

        return $this->recalculate($enrollment);
    }

    public function completeLesson(User $user, Lesson $lesson): LessonProgress
    {
        $progress = LessonProgress::firstOrNew(['user_id' => $user->id, 'lesson_id' => $lesson->id]);
        $progress->tenant_id = $lesson->tenant_id;
        $progress->completed_at ??= now();
        $progress->save();

        return $progress;
    }

    /** Recompute progress; marks the course complete and issues a certificate at 100%. */
    public function recalculate(Enrollment $enrollment): Enrollment
    {
        $lessonIds = Lesson::where('course_id', $enrollment->course_id)->pluck('id');
        $total = $lessonIds->count();
        $done = $total === 0 ? 0 : LessonProgress::where('user_id', $enrollment->user_id)
            ->whereIn('lesson_id', $lessonIds)
            ->whereNotNull('completed_at')
            ->count();

        $enrollment->progress_percent = $total === 0 ? 0 : (int) floor($done * 100 / $total);

        if ($total > 0 && $done >= $total) {
            $enrollment->status = 'completed';
            $enrollment->completed_at ??= now();
        } elseif ($enrollment->status === 'completed') {
            // New lessons were added after completion.
            $enrollment->status = 'active';
            $enrollment->completed_at = null;
        }

        $enrollment->save();

        if ($enrollment->status === 'completed') {
            $course = Course::find($enrollment->course_id);
            if ($course?->certificate_enabled) {
                $this->issueCertificate($enrollment);
            }
        }

        return $enrollment;
    }

    public function issueCertificate(Enrollment $enrollment): Certificate
    {
        $certificate = Certificate::firstOrNew(['user_id' => $enrollment->user_id, 'course_id' => $enrollment->course_id]);

        if (! $certificate->exists) {
            $certificate->tenant_id = $enrollment->tenant_id;
            $certificate->code = (string) Str::uuid();
            $certificate->issued_at = now();
            $certificate->save();
        }

        return $certificate;
    }

    public function progress(Enrollment $enrollment): array
    {
        return [
            'progress_percent' => $enrollment->progress_percent,
            'status' => $enrollment->status,
            'certificate_code' => $enrollment->status === 'completed'
                ? Certificate::where('user_id', $enrollment->user_id)->where('course_id', $enrollment->course_id)->value('code')
                : null,
        ];
    }

    /** Lesson ids this user has finished in a course. */
    public function completedLessonIds(User $user, Course $course): array
    {
        return LessonProgress::where('user_id', $user->id)
            ->whereNotNull('completed_at')
            ->whereIn('lesson_id', Lesson::where('course_id', $course->id)->select('id'))
            ->pluck('lesson_id')
            ->all();
    }
}

<?php

namespace Tests\Feature;

use App\Models\Course;
use App\Models\Enrollment;
use App\Models\Lesson;
use App\Models\Plan;
use App\Models\Tenant;
use App\Models\User;
use App\Models\UserNotification;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class EngagementTest extends TestCase
{
    use RefreshDatabase;

    private Tenant $tenant;

    private User $admin;

    private User $teacher;

    private User $student;

    protected function setUp(): void
    {
        parent::setUp();
        $this->seed();
        $this->tenant = Tenant::factory()->create(['slug' => 'acme', 'trial_ends_at' => now()->addDays(10)]);
        $this->admin = $this->person('admin');
        $this->teacher = $this->person('instructor');
        $this->student = $this->person('student');
    }

    private function person(string $role, string $slug = 'acme'): User
    {
        return User::factory()->role($role)->create(['tenant_id' => Tenant::where('slug', $slug)->value('id')]);
    }

    private function as(User $user, string $slug = 'acme'): static
    {
        $this->app['auth']->forgetGuards();
        $this->flushHeaders();

        return $this->withHeaders(['X-Tenant' => $slug, 'Authorization' => 'Bearer '.$user->createToken('t')->plainTextToken]);
    }

    /** Published course by the teacher with one section and the given lessons. */
    private function course(array $lessons = [['title' => 'Intro', 'type' => 'text']], array $attrs = []): array
    {
        $c = $this->as($this->teacher)->postJson('/api/courses', array_merge(['title' => 'Algebra', 'status' => 'published'], $attrs))->assertCreated()->json();
        $s = $this->as($this->teacher)->postJson("/api/courses/{$c['id']}/sections", ['title' => 'One'])->json();
        $ls = [];
        foreach ($lessons as $l) {
            $ls[] = $this->as($this->teacher)->postJson("/api/sections/{$s['id']}/lessons", $l)->assertCreated()->json();
        }

        return [$c, $ls];
    }

    private function enrol(User $u, int $courseId): void
    {
        $this->as($u)->postJson("/api/courses/{$courseId}/enrol")->assertCreated();
    }

    public function test_announcements_reach_the_right_people(): void
    {
        [$c] = $this->course();
        $this->enrol($this->student, $c['id']);
        $other = $this->person('student');

        // Institute-wide by admin.
        $this->as($this->admin)->postJson('/api/announcements', ['title' => 'Holiday', 'body' => 'Closed Monday', 'audience' => 'everyone'])->assertCreated();
        // Course announcement by its teacher.
        $this->as($this->teacher)->postJson('/api/announcements', ['title' => 'Quiz Friday', 'body' => 'Revise chapter 1', 'course_id' => $c['id']])->assertCreated();
        // Teachers can't post to everyone.
        $this->as($this->teacher)->postJson('/api/announcements', ['title' => 'X', 'body' => 'Y'])->assertForbidden();
        $this->as($this->student)->postJson('/api/announcements', ['title' => 'X', 'body' => 'Y'])->assertForbidden();

        $this->as($this->student)->getJson('/api/announcements')->assertOk()->assertJsonCount(2, 'data');
        $this->as($other)->getJson('/api/announcements')->assertOk()->assertJsonCount(1, 'data')->assertJsonPath('data.0.title', 'Holiday');

        $this->as($this->student)->getJson('/api/notifications')->assertJsonPath('unread', 2);
        $this->as($other)->getJson('/api/notifications')->assertJsonPath('unread', 1);
        $this->as($this->student)->postJson('/api/notifications/read')->assertJsonPath('unread', 0);
    }

    public function test_reviews_need_enrolment_and_update_the_rating(): void
    {
        [$c] = $this->course();
        $this->as($this->student)->postJson("/api/courses/{$c['id']}/reviews", ['rating' => 5])->assertForbidden();

        $this->enrol($this->student, $c['id']);
        $this->as($this->student)->postJson("/api/courses/{$c['id']}/reviews", ['rating' => 4, 'body' => 'Clear'])->assertCreated();
        $this->as($this->student)->postJson("/api/courses/{$c['id']}/reviews", ['rating' => 5])->assertOk(); // edit, not duplicate

        $second = $this->person('student');
        $this->enrol($second, $c['id']);
        $this->as($second)->postJson("/api/courses/{$c['id']}/reviews", ['rating' => 2])->assertCreated();

        $this->as($this->teacher)->getJson("/api/courses/{$c['id']}/reviews")->assertOk()
            ->assertJsonPath('count', 2)->assertJsonPath('average', 3.5);
        $this->as($this->student)->getJson('/api/courses?sort=rating')->assertJsonPath('data.0.rating', 3.5);
        $this->assertTrue(UserNotification::where('user_id', $this->teacher->id)->where('type', 'review')->exists());
    }

    public function test_discussion_replies_notify_and_respect_permissions(): void
    {
        [$c, [$lesson]] = $this->course();
        $this->as($this->student)->postJson("/api/lessons/{$lesson['id']}/comments", ['body' => 'Q?'])->assertForbidden();

        $this->enrol($this->student, $c['id']);
        $q = $this->as($this->student)->postJson("/api/lessons/{$lesson['id']}/comments", ['body' => 'What is x?'])->assertCreated()->json();
        $this->assertTrue(UserNotification::where('user_id', $this->teacher->id)->where('type', 'question')->exists());

        $this->as($this->teacher)->postJson("/api/lessons/{$lesson['id']}/comments", ['body' => 'A number.', 'parent_id' => $q['id']])
            ->assertCreated()->assertJsonPath('is_teacher', true);
        $this->assertTrue(UserNotification::where('user_id', $this->student->id)->where('type', 'reply')->exists());

        $this->as($this->student)->getJson("/api/lessons/{$lesson['id']}/comments")->assertJsonPath('data.0.replies.0.body', 'A number.');

        $stranger = $this->person('student');
        $this->enrol($stranger, $c['id']);
        $this->as($stranger)->deleteJson("/api/comments/{$q['id']}")->assertForbidden();
        $this->as($this->teacher)->deleteJson("/api/comments/{$q['id']}")->assertOk();
    }

    public function test_assignment_submit_completes_and_grade_notifies(): void
    {
        [$c, [$a]] = $this->course([['title' => 'Essay', 'type' => 'assignment', 'content' => 'Write 200 words', 'max_points' => 20]]);
        $this->enrol($this->student, $c['id']);

        $this->as($this->student)->postJson("/api/lessons/{$a['id']}/complete")->assertUnprocessable();
        $this->as($this->student)->postJson("/api/lessons/{$a['id']}/submission", [])->assertUnprocessable()->assertJsonValidationErrors('body');

        $sub = $this->as($this->student)->postJson("/api/lessons/{$a['id']}/submission", ['body' => 'My essay'])->assertCreated()
            ->assertJsonPath('progress.progress_percent', 100)->json('submission');

        $this->as($this->teacher)->getJson('/api/submissions?status=submitted')->assertOk()->assertJsonPath('data.0.user.id', $this->student->id);
        $this->as($this->teacher)->patchJson("/api/submissions/{$sub['id']}", ['grade' => 25])->assertUnprocessable();
        $this->as($this->teacher)->patchJson("/api/submissions/{$sub['id']}", ['grade' => 18, 'feedback' => 'Good'])->assertOk()->assertJsonPath('status', 'graded');

        $this->as($this->student)->getJson("/api/lessons/{$a['id']}/submission")->assertJsonPath('submission.grade', 18);
        $this->as($this->student)->postJson("/api/lessons/{$a['id']}/submission", ['body' => 'v2'])->assertUnprocessable();
        $this->assertTrue(UserNotification::where('user_id', $this->student->id)->where('type', 'graded')->exists());

        $this->as($this->student)->patchJson("/api/submissions/{$sub['id']}", ['grade' => 20])->assertForbidden();
    }

    public function test_coupons_discount_and_full_discount_enrols(): void
    {
        [$c] = $this->course(attrs: ['is_free' => false, 'price' => 100]);

        $this->as($this->admin)->postJson('/api/coupons', ['code' => 'half', 'type' => 'percent', 'value' => 50])->assertCreated()->assertJsonPath('code', 'HALF');
        $this->as($this->admin)->postJson('/api/coupons', ['code' => 'FREE', 'type' => 'percent', 'value' => 100, 'max_uses' => 1, 'course_id' => $c['id']])->assertCreated();
        $this->as($this->teacher)->postJson('/api/coupons', ['code' => 'X', 'type' => 'fixed', 'value' => 1])->assertForbidden();

        $this->as($this->student)->postJson("/api/courses/{$c['id']}/coupon-check", ['code' => 'nope'])->assertUnprocessable();
        $this->as($this->student)->postJson("/api/courses/{$c['id']}/coupon-check", ['code' => 'half'])->assertOk()->assertJsonPath('total', 50);

        $this->as($this->student)->postJson("/api/courses/{$c['id']}/enrol", ['coupon' => 'HALF', 'payment_method' => 'paypal', 'payment_reference' => 'PP1'])
            ->assertStatus(202);
        $order = $this->as($this->admin)->getJson('/api/orders?status=pending')->json('data.0');
        $this->assertSame('50.00', $order['total']);
        $this->as($this->admin)->postJson("/api/orders/{$order['id']}/approve")->assertOk();
        $this->as($this->admin)->getJson('/api/coupons')->assertJsonPath('data.1.used_count', 1);

        $second = $this->person('student');
        $this->as($second)->postJson("/api/courses/{$c['id']}/enrol", ['coupon' => 'free'])->assertCreated()->assertJsonPath('status', 'enrolled');
        $third = $this->person('student');
        $this->as($third)->postJson("/api/courses/{$c['id']}/enrol", ['coupon' => 'free'])->assertUnprocessable()->assertJsonValidationErrors('coupon');
    }

    public function test_categories_filter_the_catalog(): void
    {
        $cat = $this->as($this->admin)->postJson('/api/categories', ['name' => 'Math'])->assertCreated()->json();
        $this->as($this->teacher)->postJson('/api/categories', ['name' => 'X'])->assertForbidden();

        $this->course(attrs: ['category_id' => $cat['id']]);
        $this->course(attrs: ['title' => 'Art', 'is_free' => false, 'price' => 10]);

        $this->as($this->student)->getJson("/api/courses?category_id={$cat['id']}")->assertJsonCount(1, 'data')->assertJsonPath('data.0.title', 'Algebra');
        $this->as($this->student)->getJson('/api/courses?price=paid')->assertJsonCount(1, 'data')->assertJsonPath('data.0.title', 'Art');
        $this->as($this->student)->getJson('/api/categories')->assertJsonPath('data.0.courses_count', 1);
    }

    public function test_duplicate_copies_lessons_and_quiz(): void
    {
        [$c, [, $quizLesson]] = $this->course([['title' => 'Intro', 'type' => 'text'], ['title' => 'Check', 'type' => 'quiz']]);
        $this->as($this->teacher)->putJson("/api/quizzes/{$quizLesson['quiz']['id']}", ['questions' => [
            ['type' => 'single', 'question' => 'Q', 'options' => [['text' => 'a', 'is_correct' => true], ['text' => 'b', 'is_correct' => false]]],
        ]])->assertOk();

        $copy = $this->as($this->teacher)->postJson("/api/courses/{$c['id']}/duplicate")->assertCreated()->json();
        $outline = $this->as($this->teacher)->getJson("/api/courses/{$copy['id']}/curriculum")->assertOk();
        $outline->assertJsonPath('course.status', 'draft')->assertJsonPath('stats.lessons', 2)
            ->assertJsonPath('sections.0.lessons.1.quiz.questions_count', 1);
        $this->assertNotSame($quizLesson['quiz']['id'], $outline->json('sections.0.lessons.1.quiz.id'));
    }

    public function test_import_people_creates_skips_and_enrols(): void
    {
        [$c] = $this->course();
        $res = $this->as($this->admin)->postJson('/api/users/import', ['course_id' => $c['id'], 'rows' => [
            ['name' => 'Ava Lee', 'email' => 'ava@example.com'],
            ['name' => 'Ben Ray', 'email' => 'ben@example.com', 'role' => 'teacher', 'password' => 'longpassword'],
            ['name' => '', 'email' => 'x@example.com'],
            ['name' => 'Dup', 'email' => strtoupper($this->student->email)],
            ['name' => 'Bad', 'email' => 'not-an-email'],
        ]])->assertOk();

        $res->assertJsonCount(2, 'created')->assertJsonCount(3, 'skipped')->assertJsonPath('created.1.role', 'instructor');
        $ava = User::where('email', 'ava@example.com')->first();
        $this->assertTrue(Enrollment::where('user_id', $ava->id)->where('course_id', $c['id'])->exists());

        $this->app['auth']->forgetGuards();
        $this->flushHeaders();
        $this->withHeaders(['X-Tenant' => 'acme'])->postJson('/api/auth/login', ['email' => 'ava@example.com', 'password' => $res->json('created.0.password')])->assertOk();
    }

    public function test_exports_are_csv_and_admin_only(): void
    {
        $res = $this->as($this->admin)->get('/api/exports/people.csv')->assertOk();
        $this->assertStringContainsString('text/csv', $res->headers->get('Content-Type'));
        $this->assertStringContainsString($this->student->email, $res->streamedContent());

        $this->as($this->teacher)->get('/api/exports/people.csv', ['Accept' => 'application/json'])->assertForbidden();
    }

    public function test_search_respects_roles(): void
    {
        $this->course();
        $this->as($this->admin)->getJson('/api/search?q='.urlencode($this->student->email))->assertOk()->assertJsonPath('people.0.id', $this->student->id);
        $this->as($this->student)->getJson('/api/search?q=Alg')->assertOk()->assertJsonPath('courses.0.title', 'Algebra')->assertJsonCount(0, 'people');
    }

    public function test_owner_manages_plans_and_broadcasts(): void
    {
        $owner = User::factory()->superAdmin()->create();
        $asOwner = function () use ($owner) {
            $this->app['auth']->forgetGuards();
            $this->flushHeaders();

            return $this->withToken($owner->createToken('p')->plainTextToken);
        };

        $basic = Plan::where('slug', 'basic')->first();
        $asOwner()->patchJson("/api/platform/plans/{$basic->id}", ['price_monthly' => 39, 'max_students' => 500])->assertOk();
        $this->assertSame(500, $basic->fresh()->max_students);

        $free = Plan::where('slug', 'free')->first();
        $asOwner()->patchJson("/api/platform/plans/{$free->id}", ['price_monthly' => 5])->assertUnprocessable();
        $asOwner()->postJson('/api/platform/plans', ['name' => 'Enterprise', 'price_monthly' => 299])->assertOk()->assertJsonCount(4, 'data');

        $asOwner()->postJson('/api/platform/announcements', ['title' => 'New feature', 'body' => 'Assignments are live'])->assertCreated()->assertJsonPath('sent_to', 1);
        $this->as($this->admin)->getJson('/api/announcements')->assertJsonPath('data.0.platform', true);
        $this->as($this->student)->getJson('/api/announcements')->assertJsonCount(0, 'data');
        $this->assertTrue(UserNotification::where('user_id', $this->admin->id)->where('type', 'platform')->exists());

        $this->as($this->admin)->getJson('/api/platform/plans')->assertForbidden();
    }

    public function test_other_institutes_cannot_reach_engagement_data(): void
    {
        [$c, [$lesson]] = $this->course();
        $this->enrol($this->student, $c['id']);
        $comment = $this->as($this->student)->postJson("/api/lessons/{$lesson['id']}/comments", ['body' => 'Hi'])->json();

        Tenant::factory()->create(['slug' => 'rival']);
        $rival = $this->person('admin', 'rival');

        $this->as($rival, 'rival')->getJson("/api/lessons/{$lesson['id']}/comments")->assertNotFound();
        $this->as($rival, 'rival')->deleteJson("/api/comments/{$comment['id']}")->assertNotFound();
        $this->as($rival, 'rival')->getJson("/api/courses/{$c['id']}/reviews")->assertNotFound();
        $this->as($rival, 'rival')->postJson("/api/courses/{$c['id']}/duplicate")->assertNotFound();
        $this->as($rival, 'rival')->getJson('/api/announcements')->assertJsonCount(0, 'data');
        $this->assertSame(0, Lesson::withoutGlobalScopes()->where('tenant_id', Tenant::where('slug', 'rival')->value('id'))->count());
    }
}

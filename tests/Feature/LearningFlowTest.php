<?php

namespace Tests\Feature;

use App\Models\Certificate;
use App\Models\Course;
use App\Models\Enrollment;
use App\Models\Tenant;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Storage;
use Illuminate\Testing\TestResponse;
use Tests\TestCase;

class LearningFlowTest extends TestCase
{
    use RefreshDatabase;

    private Tenant $tenant;

    private User $admin;

    private User $teacher;

    private User $student;

    protected function setUp(): void
    {
        parent::setUp();
        $this->tenant = Tenant::factory()->create(['slug' => 'acme']);
        $this->admin = $this->person('admin');
        $this->teacher = $this->person('instructor');
        $this->student = $this->person('student');
    }

    private function person(string $role, string $tenant = 'acme'): User
    {
        return User::factory()->role($role)->create(['tenant_id' => Tenant::where('slug', $tenant)->value('id')]);
    }

    private function as(User $user, string $tenant = 'acme'): static
    {
        $this->app['auth']->forgetGuards();

        return $this->withHeaders([
            'X-Tenant' => $tenant,
            'Authorization' => 'Bearer '.$user->createToken('t')->plainTextToken,
        ]);
    }

    /** Builds a published course with 1 section, 2 lessons and a 2-question quiz. */
    private function buildCourse(array $course = []): array
    {
        $c = $this->as($this->teacher)->postJson('/api/courses', array_merge(['title' => 'Algebra', 'status' => 'published'], $course))
            ->assertCreated()->json();

        $section = $this->as($this->teacher)->postJson("/api/courses/{$c['id']}/sections", ['title' => 'Basics'])->assertCreated()->json();

        $video = $this->as($this->teacher)->postJson("/api/sections/{$section['id']}/lessons", [
            'title' => 'Welcome', 'type' => 'video', 'video_url' => 'https://www.youtube.com/watch?v=abc', 'is_preview' => true,
        ])->assertCreated()->json();

        $text = $this->as($this->teacher)->postJson("/api/sections/{$section['id']}/lessons", [
            'title' => 'Notes', 'type' => 'text', 'content' => 'x + y',
        ])->assertCreated()->json();

        $quizLesson = $this->as($this->teacher)->postJson("/api/sections/{$section['id']}/lessons", [
            'title' => 'Check', 'type' => 'quiz',
        ])->assertCreated()->json();

        $quiz = $this->as($this->teacher)->putJson("/api/quizzes/{$quizLesson['quiz']['id']}", [
            'pass_percentage' => 50,
            'max_attempts' => 2,
            'questions' => [
                ['type' => 'single', 'question' => '1 + 1?', 'options' => [
                    ['text' => '2', 'is_correct' => true], ['text' => '3', 'is_correct' => false],
                ]],
                ['type' => 'multiple', 'question' => 'Even numbers?', 'options' => [
                    ['text' => '2', 'is_correct' => true], ['text' => '4', 'is_correct' => true], ['text' => '5', 'is_correct' => false],
                ]],
            ],
        ])->assertOk()->json();

        return compact('c', 'section', 'video', 'text', 'quizLesson', 'quiz');
    }

    private function answers(array $quiz, bool $allCorrect): array
    {
        $out = [];
        foreach ($quiz['questions'] as $q) {
            $correct = collect($q['options'])->where('is_correct', true)->pluck('id')->all();
            $wrong = collect($q['options'])->where('is_correct', false)->pluck('id')->take(1)->all();
            $out[$q['id']] = $allCorrect ? $correct : $wrong;
        }

        return $out;
    }

    private function takeQuiz(int $quizId, array $answers): TestResponse
    {
        $start = $this->as($this->student)->postJson("/api/quizzes/{$quizId}/start")->assertOk()->json();
        $this->assertArrayNotHasKey('is_correct', $start['questions'][0]['options'][0], 'Students must not see answers.');

        return $this->as($this->student)->postJson("/api/quiz-attempts/{$start['attempt_id']}/submit", ['answers' => $answers]);
    }

    public function test_full_journey_from_builder_to_certificate(): void
    {
        $b = $this->buildCourse();
        $courseId = $b['c']['id'];

        // Before enrolling: outline visible, only the preview lesson is open.
        $outline = $this->as($this->student)->getJson("/api/courses/{$courseId}/curriculum")->assertOk();
        $lessons = $outline->json('sections.0.lessons');
        $this->assertCount(3, $lessons);
        $this->assertFalse($lessons[0]['locked']);
        $this->assertSame('https://www.youtube.com/watch?v=abc', $lessons[0]['video_url']);
        $this->assertTrue($lessons[1]['locked']);
        $this->assertArrayNotHasKey('content', $lessons[1]);

        $this->as($this->student)->postJson("/api/lessons/{$b['text']['id']}/complete")->assertForbidden();

        // Enrol (free) and work through it.
        $this->as($this->student)->postJson("/api/courses/{$courseId}/enrol")->assertCreated()->assertJsonPath('status', 'enrolled');
        $this->as($this->student)->postJson("/api/lessons/{$b['video']['id']}/complete")->assertOk()->assertJsonPath('progress_percent', 33);
        $this->as($this->student)->postJson("/api/lessons/{$b['text']['id']}/complete")->assertOk()->assertJsonPath('progress_percent', 66);

        // Quiz lessons are completed by passing, not by clicking.
        $this->as($this->student)->postJson("/api/lessons/{$b['quizLesson']['id']}/complete")->assertUnprocessable();

        $fail = $this->takeQuiz($b['quiz']['id'], $this->answers($b['quiz'], false))->assertOk();
        $fail->assertJsonPath('attempt.passed', false)->assertJsonPath('progress.progress_percent', 66);

        $pass = $this->takeQuiz($b['quiz']['id'], $this->answers($b['quiz'], true))->assertOk();
        $pass->assertJsonPath('attempt.passed', true)
            ->assertJsonPath('attempt.percentage', 100.0)
            ->assertJsonPath('progress.progress_percent', 100)
            ->assertJsonPath('progress.status', 'completed');

        $code = $pass->json('progress.certificate_code');
        $this->assertNotEmpty($code);

        // Max attempts (2) used up.
        $this->as($this->student)->postJson("/api/quizzes/{$b['quiz']['id']}/start")->assertUnprocessable();

        // Certificate lists and verifies publicly, without any tenant header.
        $this->as($this->student)->getJson('/api/my/certificates')->assertOk()->assertJsonPath('data.0.code', $code);
        $this->app['auth']->forgetGuards();
        $this->flushHeaders();
        $this->getJson("/api/certificates/{$code}")
            ->assertOk()
            ->assertJsonPath('student_name', $this->student->name)
            ->assertJsonPath('course_title', 'Algebra');

        $this->as($this->student)->getJson('/api/my/courses')
            ->assertOk()
            ->assertJsonPath('data.0.progress_percent', 100)
            ->assertJsonPath('data.0.certificate_code', $code);

        // Teacher sees the student's progress.
        $this->as($this->teacher)->getJson("/api/courses/{$courseId}/students")
            ->assertOk()
            ->assertJsonPath('data.0.user.id', $this->student->id)
            ->assertJsonPath('data.0.progress_percent', 100);
    }

    public function test_quiz_validation_requires_a_correct_answer(): void
    {
        $b = $this->buildCourse();

        $this->as($this->teacher)->putJson("/api/quizzes/{$b['quiz']['id']}", ['questions' => [
            ['type' => 'single', 'question' => 'Q', 'options' => [['text' => 'a', 'is_correct' => false], ['text' => 'b', 'is_correct' => false]]],
        ]])->assertUnprocessable()->assertJsonValidationErrors('questions.0.options');

        $this->as($this->teacher)->putJson("/api/quizzes/{$b['quiz']['id']}", ['questions' => [
            ['type' => 'single', 'question' => 'Q', 'options' => [['text' => 'a', 'is_correct' => true], ['text' => 'b', 'is_correct' => true]]],
        ]])->assertUnprocessable()->assertJsonValidationErrors('questions.0.options');
    }

    public function test_adding_a_lesson_reopens_a_completed_course(): void
    {
        $b = $this->buildCourse();
        $this->as($this->student)->postJson("/api/courses/{$b['c']['id']}/enrol")->assertCreated();
        $this->as($this->student)->postJson("/api/lessons/{$b['video']['id']}/complete");
        $this->as($this->student)->postJson("/api/lessons/{$b['text']['id']}/complete");
        $this->takeQuiz($b['quiz']['id'], $this->answers($b['quiz'], true))->assertJsonPath('progress.progress_percent', 100);

        $this->as($this->teacher)->postJson("/api/sections/{$b['section']['id']}/lessons", ['title' => 'Bonus', 'type' => 'text'])->assertCreated();

        $e = Enrollment::where('user_id', $this->student->id)->first();
        $this->assertSame(75, $e->progress_percent);
        $this->assertSame('active', $e->status);
        // The certificate already earned is kept.
        $this->assertSame(1, Certificate::count());
    }

    public function test_paid_course_goes_through_payment_approval(): void
    {
        $b = $this->buildCourse(['is_free' => false, 'price' => 5000, 'sale_price' => 3500]);
        $courseId = $b['c']['id'];

        $this->as($this->student)->postJson("/api/courses/{$courseId}/enrol")
            ->assertUnprocessable()->assertJsonValidationErrors(['payment_method', 'payment_reference']);

        $this->as($this->student)->postJson("/api/courses/{$courseId}/enrol", [
            'payment_method' => 'jazzcash', 'payment_reference' => 'TX123',
        ])->assertStatus(202)->assertJsonPath('status', 'pending');

        $this->as($this->student)->getJson("/api/courses/{$courseId}/curriculum")
            ->assertJsonPath('enrollment', null)
            ->assertJsonPath('pending_order.payment_reference', 'TX123');

        // Not enrolled yet, so locked lessons stay locked.
        $this->as($this->student)->postJson("/api/lessons/{$b['text']['id']}/complete")->assertForbidden();

        $orders = $this->as($this->admin)->getJson('/api/orders?status=pending')->assertOk();
        $orders->assertJsonPath('summary.pending', 1)->assertJsonPath('data.0.total', '3500.00');

        // Students and instructors cannot approve payments.
        $orderId = $orders->json('data.0.id');
        $this->as($this->student)->postJson("/api/orders/{$orderId}/approve")->assertForbidden();
        $this->as($this->teacher)->postJson("/api/orders/{$orderId}/approve")->assertForbidden();

        $this->as($this->admin)->postJson("/api/orders/{$orderId}/approve")->assertOk()->assertJsonPath('status', 'paid');
        $this->as($this->admin)->postJson("/api/orders/{$orderId}/approve")->assertUnprocessable();

        $this->as($this->student)->getJson("/api/courses/{$courseId}/curriculum")->assertJsonPath('enrollment.status', 'active');
        $this->as($this->student)->postJson("/api/lessons/{$b['text']['id']}/complete")->assertOk();

        $this->as($this->admin)->getJson('/api/dashboard')->assertJsonPath('revenue', 3500.0);
    }

    public function test_drip_lessons_open_later(): void
    {
        $b = $this->buildCourse();
        $this->as($this->teacher)->patchJson("/api/lessons/{$b['text']['id']}", ['drip_days' => 3])->assertOk();
        $this->as($this->student)->postJson("/api/courses/{$b['c']['id']}/enrol")->assertCreated();

        $lesson = $this->as($this->student)->getJson("/api/courses/{$b['c']['id']}/curriculum")->json('sections.0.lessons.1');
        $this->assertTrue($lesson['locked']);
        $this->assertStringStartsWith('drip:', $lesson['locked_reason']);
        $this->as($this->student)->postJson("/api/lessons/{$b['text']['id']}/complete")->assertForbidden();

        $this->travel(4)->days();
        $this->as($this->student)->postJson("/api/lessons/{$b['text']['id']}/complete")->assertOk();
    }

    public function test_builder_permissions_and_reorder(): void
    {
        $b = $this->buildCourse();
        $other = $this->person('instructor');

        $this->as($other)->postJson("/api/courses/{$b['c']['id']}/sections", ['title' => 'X'])->assertForbidden();
        $this->as($other)->patchJson("/api/lessons/{$b['text']['id']}", ['title' => 'X'])->assertForbidden();
        $this->as($this->student)->postJson("/api/courses/{$b['c']['id']}/sections", ['title' => 'X'])->assertForbidden();
        $this->as($this->student)->getJson("/api/quizzes/{$b['quiz']['id']}")->assertForbidden();

        // Dangerous URL schemes are refused.
        $this->as($this->teacher)->patchJson("/api/lessons/{$b['video']['id']}", ['video_url' => 'javascript:alert(1)'])
            ->assertUnprocessable()->assertJsonValidationErrors('video_url');

        $s2 = $this->as($this->teacher)->postJson("/api/courses/{$b['c']['id']}/sections", ['title' => 'Second'])->json();
        $this->as($this->teacher)->putJson("/api/courses/{$b['c']['id']}/order", ['sections' => [
            ['id' => $s2['id'], 'lessons' => [$b['text']['id']]],
            ['id' => $b['section']['id'], 'lessons' => [$b['quizLesson']['id'], $b['video']['id']]],
        ]])->assertOk();

        $outline = $this->as($this->teacher)->getJson("/api/courses/{$b['c']['id']}/curriculum")->json('sections');
        $this->assertSame('Second', $outline[0]['title']);
        $this->assertSame('Notes', $outline[0]['lessons'][0]['title']);
        $this->assertSame(['Check', 'Welcome'], array_column($outline[1]['lessons'], 'title'));

        // Lessons from another course cannot be moved in.
        $otherCourse = Course::factory()->create(['tenant_id' => $this->tenant->id, 'instructor_id' => $this->teacher->id]);
        $this->as($this->teacher)->putJson("/api/courses/{$otherCourse->id}/order", ['sections' => [
            ['id' => $b['section']['id'], 'lessons' => []],
        ]])->assertUnprocessable();
    }

    public function test_other_institutes_cannot_touch_the_course(): void
    {
        $b = $this->buildCourse();
        Tenant::factory()->create(['slug' => 'rival']);
        $rivalAdmin = $this->person('admin', 'rival');

        $this->as($rivalAdmin, 'rival')->getJson("/api/courses/{$b['c']['id']}/curriculum")->assertNotFound();
        $this->as($rivalAdmin, 'rival')->patchJson("/api/lessons/{$b['text']['id']}", ['title' => 'x'])->assertNotFound();
        $this->as($rivalAdmin, 'rival')->getJson("/api/quizzes/{$b['quiz']['id']}")->assertNotFound();
        $this->as($rivalAdmin, 'rival')->postJson("/api/courses/{$b['c']['id']}/students", ['user_ids' => [$this->student->id]])->assertNotFound();
    }

    public function test_admin_adds_students_and_removes_them(): void
    {
        $b = $this->buildCourse();
        $this->as($this->admin)->postJson("/api/courses/{$b['c']['id']}/students", ['user_ids' => [$this->student->id, $this->teacher->id]])
            ->assertOk()->assertJsonPath('added', 1);

        $this->as($this->admin)->deleteJson("/api/courses/{$b['c']['id']}/students/{$this->student->id}")->assertOk();
        $this->as($this->student)->postJson("/api/lessons/{$b['text']['id']}/complete")->assertForbidden();
    }

    public function test_uploads_are_stored_per_institute(): void
    {
        Storage::fake('public');

        $res = $this->as($this->teacher)->post('/api/uploads', [
            'kind' => 'image', 'file' => UploadedFile::fake()->image('Cover Photo.png', 800, 450),
        ], ['Accept' => 'application/json'])->assertCreated();

        $this->assertStringContainsString("tenants/{$this->tenant->id}/images/", $res->json('url'));

        $this->as($this->teacher)->post('/api/uploads', [
            'kind' => 'image', 'file' => UploadedFile::fake()->create('evil.php', 10, 'application/x-php'),
        ], ['Accept' => 'application/json'])->assertUnprocessable();

        $this->as($this->student)->post('/api/uploads', [
            'kind' => 'image', 'file' => UploadedFile::fake()->image('a.png'),
        ], ['Accept' => 'application/json'])->assertForbidden();
    }

    public function test_settings_and_profile(): void
    {
        $this->as($this->admin)->patchJson('/api/settings', [
            'name' => 'Acme Learning',
            'settings' => ['brand' => 'emerald', 'payments' => ['jazzcash' => '0300 0000000']],
        ])->assertOk()->assertJsonPath('name', 'Acme Learning')->assertJsonPath('settings.brand', 'emerald');

        $this->as($this->admin)->patchJson('/api/settings', ['settings' => ['welcome_message' => 'Hi']])
            ->assertJsonPath('settings.brand', 'emerald')
            ->assertJsonPath('settings.payments.jazzcash', '0300 0000000');

        $this->as($this->admin)->patchJson('/api/settings', ['settings' => ['brand' => 'neon']])->assertUnprocessable();
        $this->as($this->teacher)->patchJson('/api/settings', ['name' => 'X'])->assertForbidden();

        // Public sign-in info shows branding but not payment details.
        $this->app['auth']->forgetGuards();
        $this->flushHeaders();
        $this->withHeaders(['X-Tenant' => 'acme'])->getJson('/api/tenant')
            ->assertJsonPath('settings.brand', 'emerald')
            ->assertJsonMissingPath('settings.payments');

        $this->as($this->student)->patchJson('/api/auth/me', ['current_password' => 'wrong', 'password' => 'new-password', 'password_confirmation' => 'new-password'])
            ->assertUnprocessable()->assertJsonValidationErrors('current_password');
        $this->as($this->student)->patchJson('/api/auth/me', ['name' => 'New Name', 'current_password' => 'password', 'password' => 'new-password', 'password_confirmation' => 'new-password'])
            ->assertOk()->assertJsonPath('name', 'New Name');

        $this->app['auth']->forgetGuards();
        $this->flushHeaders();
        $this->withHeaders(['X-Tenant' => 'acme'])->postJson('/api/auth/login', ['email' => $this->student->email, 'password' => 'new-password'])->assertOk();
    }

    public function test_platform_stats_for_owner_only(): void
    {
        $owner = User::factory()->superAdmin()->create();

        $this->app['auth']->forgetGuards();
        $this->withToken($owner->createToken('p')->plainTextToken)->getJson('/api/platform/stats')
            ->assertOk()->assertJsonPath('tenants.total', 1)->assertJsonPath('students', 1);

        $this->app['auth']->forgetGuards();
        $this->flushHeaders();
        $this->withToken($this->admin->createToken('p')->plainTextToken)->getJson('/api/platform/stats')->assertForbidden();
    }
}

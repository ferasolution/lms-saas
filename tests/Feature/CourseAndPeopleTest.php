<?php

namespace Tests\Feature;

use App\Models\Course;
use App\Models\Tenant;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class CourseAndPeopleTest extends TestCase
{
    use RefreshDatabase;

    private Tenant $tenant;

    protected function setUp(): void
    {
        parent::setUp();
        $this->tenant = Tenant::factory()->create(['slug' => 'acme']);
    }

    private function as(User $user): static
    {
        // The auth guard caches the user between requests inside one test.
        $this->app['auth']->forgetGuards();

        return $this->withHeaders([
            'X-Tenant' => 'acme',
            'Authorization' => 'Bearer '.$user->createToken('t')->plainTextToken,
        ]);
    }

    private function make(string $role): User
    {
        return User::factory()->role($role)->create(['tenant_id' => $this->tenant->id]);
    }

    public function test_instructor_creates_a_draft_course_with_a_unique_slug(): void
    {
        $teacher = $this->make(User::ROLE_INSTRUCTOR);

        $first = $this->as($teacher)->postJson('/api/courses', ['title' => 'Intro to Algebra'])
            ->assertCreated()
            ->assertJsonPath('status', 'draft')
            ->assertJsonPath('slug', 'intro-to-algebra')
            ->assertJsonPath('instructor.id', $teacher->id);

        $this->as($teacher)->postJson('/api/courses', ['title' => 'Intro to Algebra'])
            ->assertCreated()
            ->assertJsonPath('slug', 'intro-to-algebra-2');

        $this->assertSame($this->tenant->id, Course::withoutGlobalScopes()->find($first->json('id'))->tenant_id);
    }

    public function test_publishing_sets_published_at(): void
    {
        $teacher = $this->make(User::ROLE_INSTRUCTOR);
        $course = Course::factory()->create(['tenant_id' => $this->tenant->id, 'instructor_id' => $teacher->id]);

        $this->as($teacher)->patchJson("/api/courses/{$course->id}", ['status' => 'published'])
            ->assertOk()
            ->assertJsonPath('status', 'published');

        $this->assertNotNull($course->fresh()->published_at);
    }

    public function test_instructor_cannot_edit_another_instructors_course(): void
    {
        $owner = $this->make(User::ROLE_INSTRUCTOR);
        $other = $this->make(User::ROLE_INSTRUCTOR);
        $course = Course::factory()->create(['tenant_id' => $this->tenant->id, 'instructor_id' => $owner->id]);

        $this->as($other)->patchJson("/api/courses/{$course->id}", ['title' => 'Mine now'])->assertForbidden();
    }

    public function test_students_only_see_published_courses_and_cannot_create(): void
    {
        $admin = $this->make(User::ROLE_ADMIN);
        Course::factory()->create(['tenant_id' => $this->tenant->id, 'instructor_id' => $admin->id, 'title' => 'Draft one']);
        $published = Course::factory()->published()->create(['tenant_id' => $this->tenant->id, 'instructor_id' => $admin->id, 'title' => 'Live one']);

        $student = $this->make(User::ROLE_STUDENT);

        $this->as($student)->getJson('/api/courses')
            ->assertOk()
            ->assertJsonCount(1, 'data')
            ->assertJsonPath('data.0.id', $published->id);

        $this->as($student)->postJson('/api/courses', ['title' => 'Nope'])->assertForbidden();
    }

    public function test_admin_adds_people_and_only_admins_can(): void
    {
        $admin = $this->make(User::ROLE_ADMIN);

        $this->as($admin)->postJson('/api/users', [
            'name' => 'Bilal', 'email' => 'bilal@example.com', 'role' => 'instructor', 'password' => 'temp-pass-1',
        ])->assertCreated()->assertJsonPath('role', 'instructor');

        // Platform-level roles cannot be handed out by an institute.
        $this->as($admin)->postJson('/api/users', [
            'name' => 'X', 'email' => 'x@example.com', 'role' => 'super_admin', 'password' => 'temp-pass-1',
        ])->assertUnprocessable()->assertJsonValidationErrors('role');

        $student = $this->make(User::ROLE_STUDENT);
        $this->as($student)->getJson('/api/users')->assertForbidden();
    }

    public function test_disabled_users_cannot_sign_in(): void
    {
        $user = $this->make(User::ROLE_STUDENT);
        $user->is_active = false;
        $user->save();

        $this->withHeaders(['X-Tenant' => 'acme'])
            ->postJson('/api/auth/login', ['email' => $user->email, 'password' => 'password'])
            ->assertUnprocessable();
    }

    public function test_super_admin_lists_all_institutes(): void
    {
        Tenant::factory()->count(2)->create();
        $owner = User::factory()->superAdmin()->create(['email' => 'owner@example.com']);

        $this->postJson('/api/platform/login', ['email' => 'owner@example.com', 'password' => 'password'])
            ->assertOk();

        $this->app['auth']->forgetGuards();
        $this->withToken($owner->createToken('p')->plainTextToken)
            ->getJson('/api/platform/tenants')
            ->assertOk()
            ->assertJsonCount(3, 'data');

        $admin = $this->make(User::ROLE_ADMIN);
        $this->app['auth']->forgetGuards();
        $this->withToken($admin->createToken('p')->plainTextToken)
            ->getJson('/api/platform/tenants')
            ->assertForbidden();
    }
}

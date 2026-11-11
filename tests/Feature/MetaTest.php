<?php

namespace Tests\Feature;

use App\Models\Course;
use App\Models\Tenant;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class MetaTest extends TestCase
{
    use RefreshDatabase;

    public function test_plans_are_public(): void
    {
        $this->seed();

        $this->getJson('/api/plans')
            ->assertOk()
            ->assertJsonCount(3, 'data')
            ->assertJsonPath('data.0.slug', 'free');
    }

    public function test_tenant_info_is_public_but_scoped(): void
    {
        Tenant::factory()->create(['slug' => 'acme', 'name' => 'Acme Academy', 'type' => 'academy']);

        $this->withHeaders(['X-Tenant' => 'acme'])->getJson('/api/tenant')
            ->assertOk()
            ->assertJson(['name' => 'Acme Academy', 'type' => 'academy'])
            ->assertJsonMissingPath('status');

        $this->withHeaders(['X-Tenant' => 'nope'])->getJson('/api/tenant')->assertNotFound();
    }

    public function test_dashboard_counts_are_per_institute_and_per_role(): void
    {
        $acme = Tenant::factory()->create(['slug' => 'acme']);
        $other = Tenant::factory()->create(['slug' => 'other']);

        $admin = User::factory()->role('admin')->create(['tenant_id' => $acme->id]);
        $teacher = User::factory()->role('instructor')->create(['tenant_id' => $acme->id]);
        User::factory()->count(3)->create(['tenant_id' => $acme->id]);
        User::factory()->count(5)->create(['tenant_id' => $other->id]);

        Course::factory()->published()->create(['tenant_id' => $acme->id, 'instructor_id' => $teacher->id]);
        Course::factory()->create(['tenant_id' => $acme->id, 'instructor_id' => $admin->id]);
        Course::factory()->count(4)->published()->create(['tenant_id' => $other->id]);

        $this->withHeaders(['X-Tenant' => 'acme', 'Authorization' => 'Bearer '.$admin->createToken('t')->plainTextToken])
            ->getJson('/api/dashboard')
            ->assertOk()
            ->assertJsonPath('courses.total', 2)
            ->assertJsonPath('courses.published', 1)
            ->assertJsonPath('courses.draft', 1)
            ->assertJsonPath('people.student', 3)
            ->assertJsonPath('people.instructor', 1)
            ->assertJsonCount(2, 'recent_courses');

        $this->app['auth']->forgetGuards();

        // Instructors only see their own courses and no people counts.
        $this->withHeaders(['X-Tenant' => 'acme', 'Authorization' => 'Bearer '.$teacher->createToken('t')->plainTextToken])
            ->getJson('/api/dashboard')
            ->assertOk()
            ->assertJsonPath('courses.total', 1)
            ->assertJsonMissingPath('people');
    }
}

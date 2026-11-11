<?php

namespace Tests\Feature;

use App\Models\Course;
use App\Models\Tenant;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class TenancyTest extends TestCase
{
    use RefreshDatabase;

    private function tenantWithAdmin(string $slug): array
    {
        $tenant = Tenant::factory()->create(['slug' => $slug]);
        $admin = User::factory()->role(User::ROLE_ADMIN)->create(['tenant_id' => $tenant->id]);

        return [$tenant, $admin, $admin->createToken('test')->plainTextToken];
    }

    private function asTenant(string $slug, ?string $token = null): static
    {
        // The auth guard caches the user between requests inside one test.
        $this->app['auth']->forgetGuards();
        $this->flushHeaders();

        $headers = ['X-Tenant' => $slug];
        if ($token) {
            $headers['Authorization'] = "Bearer {$token}";
        }

        return $this->withHeaders($headers);
    }

    public function test_an_institute_can_register_and_gets_an_admin_token(): void
    {
        $this->seed();

        $response = $this->postJson('/api/register-institute', [
            'institute_name' => 'Karachi Grammar Academy',
            'slug' => 'kga',
            'type' => 'academy',
            'name' => 'Ayesha Khan',
            'email' => 'Ayesha@Example.com',
            'password' => 'secret-pass',
            'password_confirmation' => 'secret-pass',
        ]);

        $response->assertCreated()
            ->assertJsonPath('tenant.slug', 'kga')
            ->assertJsonPath('tenant.status', 'trial')
            ->assertJsonPath('tenant.plan.slug', 'free')
            ->assertJsonPath('user.role', 'admin')
            ->assertJsonPath('user.email', 'ayesha@example.com');

        $token = $response->json('token');
        $this->asTenant('kga', $token)->getJson('/api/auth/me')
            ->assertOk()
            ->assertJsonPath('user.name', 'Ayesha Khan');
    }

    public function test_reserved_and_taken_slugs_are_rejected(): void
    {
        Tenant::factory()->create(['slug' => 'taken']);

        foreach (['admin', 'taken', 'Bad Slug'] as $slug) {
            $this->postJson('/api/register-institute', [
                'institute_name' => 'X', 'slug' => $slug, 'type' => 'school',
                'name' => 'X', 'email' => 'x@example.com',
                'password' => 'secret-pass', 'password_confirmation' => 'secret-pass',
            ])->assertUnprocessable()->assertJsonValidationErrors('slug');
        }
    }

    public function test_login_is_scoped_to_the_institute(): void
    {
        [$a] = $this->tenantWithAdmin('alpha');
        [$b] = $this->tenantWithAdmin('beta');

        $user = User::factory()->create(['tenant_id' => $a->id, 'email' => 'sara@example.com']);

        $this->asTenant('alpha')->postJson('/api/auth/login', ['email' => 'sara@example.com', 'password' => 'password'])
            ->assertOk()->assertJsonPath('user.id', $user->id);

        // Same credentials do not work at a different institute.
        $this->asTenant('beta')->postJson('/api/auth/login', ['email' => 'sara@example.com', 'password' => 'password'])
            ->assertUnprocessable();
    }

    public function test_same_email_can_exist_in_two_institutes(): void
    {
        [$a] = $this->tenantWithAdmin('alpha');
        [$b] = $this->tenantWithAdmin('beta');

        User::factory()->create(['tenant_id' => $a->id, 'email' => 'same@example.com']);
        User::factory()->create(['tenant_id' => $b->id, 'email' => 'same@example.com']);

        $this->assertSame(2, User::where('email', 'same@example.com')->count());
    }

    public function test_a_token_from_one_institute_does_not_work_at_another(): void
    {
        [, , $tokenA] = $this->tenantWithAdmin('alpha');
        $this->tenantWithAdmin('beta');

        $this->asTenant('beta', $tokenA)->getJson('/api/auth/me')->assertUnauthorized();
    }

    public function test_courses_are_isolated_between_institutes(): void
    {
        [$a, $adminA, $tokenA] = $this->tenantWithAdmin('alpha');
        [$b, $adminB, $tokenB] = $this->tenantWithAdmin('beta');

        $courseA = Course::factory()->create(['tenant_id' => $a->id, 'instructor_id' => $adminA->id, 'title' => 'Alpha Physics']);
        Course::factory()->create(['tenant_id' => $b->id, 'instructor_id' => $adminB->id, 'title' => 'Beta Chemistry']);

        $this->asTenant('beta', $tokenB)->getJson('/api/courses')
            ->assertOk()
            ->assertJsonCount(1, 'data')
            ->assertJsonPath('data.0.title', 'Beta Chemistry');

        // Route-model binding is tenant-scoped, so another institute's course is simply not found.
        $this->asTenant('beta', $tokenB)->getJson("/api/courses/{$courseA->id}")->assertNotFound();
        $this->asTenant('beta', $tokenB)->patchJson("/api/courses/{$courseA->id}", ['title' => 'Hacked'])->assertNotFound();
        $this->asTenant('beta', $tokenB)->deleteJson("/api/courses/{$courseA->id}")->assertNotFound();

        $this->assertSame('Alpha Physics', Course::withoutGlobalScopes()->find($courseA->id)->title);
    }

    public function test_unknown_and_suspended_institutes_are_blocked(): void
    {
        $this->asTenant('nobody')->postJson('/api/auth/login', ['email' => 'a@b.com', 'password' => 'x'])
            ->assertNotFound();

        Tenant::factory()->suspended()->create(['slug' => 'frozen']);
        $this->asTenant('frozen')->postJson('/api/auth/login', ['email' => 'a@b.com', 'password' => 'x'])
            ->assertForbidden();
    }
}

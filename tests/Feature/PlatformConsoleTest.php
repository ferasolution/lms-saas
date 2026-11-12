<?php

namespace Tests\Feature;

use App\Models\ActivityLog;
use App\Models\Course;
use App\Models\Order;
use App\Models\Plan;
use App\Models\Tenant;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class PlatformConsoleTest extends TestCase
{
    use RefreshDatabase;

    private User $owner;

    private Tenant $tenant;

    private User $admin;

    protected function setUp(): void
    {
        parent::setUp();
        $this->seed();
        $this->owner = User::factory()->superAdmin()->create(['email' => 'owner@example.com']);
        $this->tenant = Tenant::factory()->create(['slug' => 'acme', 'name' => 'Acme Academy', 'trial_ends_at' => now()->addDays(10)]);
        $this->admin = User::factory()->role('admin')->create(['tenant_id' => $this->tenant->id]);
    }

    private function asOwner(): static
    {
        $this->app['auth']->forgetGuards();
        $this->flushHeaders();

        return $this->withToken($this->owner->createToken('p')->plainTextToken);
    }

    private function asAdmin(?User $user = null): static
    {
        $this->app['auth']->forgetGuards();
        $this->flushHeaders();

        return $this->withHeaders(['X-Tenant' => 'acme', 'Authorization' => 'Bearer '.($user ?? $this->admin)->createToken('t')->plainTextToken]);
    }

    public function test_owner_sees_everything_and_tenants_see_nothing(): void
    {
        User::factory()->count(3)->create(['tenant_id' => $this->tenant->id]);
        $other = Tenant::factory()->create(['slug' => 'other']);
        User::factory()->count(2)->create(['tenant_id' => $other->id]);

        $this->asOwner()->getJson('/api/platform/overview')->assertOk()
            ->assertJsonPath('tenants.total', 2)
            ->assertJsonPath('people.students', 5)
            ->assertJsonCount(30, 'signups');

        $this->asOwner()->getJson('/api/platform/users?search=')->assertOk()->assertJsonPath('meta.total', 6);
        $this->asOwner()->getJson("/api/platform/users?tenant_id={$other->id}")->assertJsonPath('meta.total', 2);
        $this->asOwner()->getJson("/api/platform/tenants/{$this->tenant->id}")->assertOk()
            ->assertJsonPath('tenant.name', 'Acme Academy')
            ->assertJsonPath('effective.source', 'trial')
            ->assertJsonPath('usage.students', 3)
            ->assertJsonPath('admins.0.id', $this->admin->id);
        $this->asOwner()->getJson('/api/platform/health')->assertOk()->assertJsonPath('checks.database.ok', true);

        foreach (['overview', 'tenants', 'users', 'payments', 'subscriptions', 'activity', 'health', 'settings'] as $path) {
            $this->asAdmin()->getJson("/api/platform/{$path}")->assertForbidden();
        }
    }

    public function test_trial_gets_top_plan_then_falls_back_to_free_limits(): void
    {
        // During the trial: Pro, unlimited.
        $this->asAdmin()->getJson('/api/billing')->assertOk()
            ->assertJsonPath('current.source', 'trial')
            ->assertJsonPath('current.plan.slug', 'pro');

        // After the trial: Free plan, 3 courses max.
        $this->tenant->update(['trial_ends_at' => now()->subDay()]);
        $this->asAdmin()->getJson('/api/billing')->assertJsonPath('current.source', 'free')->assertJsonPath('current.plan.slug', 'free');

        Course::factory()->count(3)->create(['tenant_id' => $this->tenant->id, 'instructor_id' => $this->admin->id]);
        $this->asAdmin()->postJson('/api/courses', ['title' => 'Fourth'])
            ->assertUnprocessable()
            ->assertJsonValidationErrors('title');

        // Nothing already there is locked.
        $this->asAdmin()->getJson('/api/courses')->assertOk()->assertJsonCount(3, 'data');
    }

    public function test_student_limit_on_free_plan(): void
    {
        $this->tenant->update(['trial_ends_at' => now()->subDay()]);
        User::factory()->count(25)->create(['tenant_id' => $this->tenant->id]);

        $this->asAdmin()->postJson('/api/users', ['name' => 'X', 'email' => 'x@example.com', 'role' => 'student', 'password' => 'password1'])
            ->assertUnprocessable()->assertJsonValidationErrors('role');

        // Teachers are not limited.
        $this->asAdmin()->postJson('/api/users', ['name' => 'T', 'email' => 't@example.com', 'role' => 'instructor', 'password' => 'password1'])
            ->assertCreated();
    }

    public function test_subscription_payment_approval_upgrades_the_plan(): void
    {
        $this->tenant->update(['trial_ends_at' => now()->subDay()]);
        $basic = Plan::where('slug', 'basic')->first();

        $this->asOwner()->putJson('/api/platform/settings', ['payments' => ['jazzcash' => '0300 1111111 (Fera Solution)']])->assertOk();
        $this->asAdmin()->getJson('/api/billing')->assertJsonPath('pay_to.jazzcash', '0300 1111111 (Fera Solution)');

        $this->asAdmin()->postJson('/api/billing/subscribe', [
            'plan_id' => $basic->id, 'months' => 3, 'payment_method' => 'jazzcash', 'payment_reference' => 'TX-99',
        ])->assertCreated();

        // Only one pending at a time.
        $this->asAdmin()->postJson('/api/billing/subscribe', [
            'plan_id' => $basic->id, 'months' => 1, 'payment_method' => 'jazzcash', 'payment_reference' => 'TX-100',
        ])->assertUnprocessable();

        $subs = $this->asOwner()->getJson('/api/platform/subscriptions?status=pending')->assertOk()
            ->assertJsonPath('summary.pending', 1)
            ->assertJsonPath('data.0.tenant.name', 'Acme Academy')
            ->assertJsonPath('data.0.amount', '87.00');

        $this->asOwner()->postJson('/api/platform/subscriptions/'.$subs->json('data.0.id').'/approve')->assertOk()->assertJsonPath('status', 'active');

        $this->tenant->refresh();
        $this->assertSame('active', $this->tenant->status);
        $this->assertSame($basic->id, $this->tenant->plan_id);
        $this->assertTrue($this->tenant->plan_ends_at->between(now()->addMonths(3)->subDay(), now()->addMonths(3)->addDay()));

        $this->asAdmin()->getJson('/api/billing')->assertJsonPath('current.source', 'paid')->assertJsonPath('current.plan.slug', 'basic');
        $this->asOwner()->getJson('/api/platform/overview')->assertJsonPath('revenue.subscriptions_total', 87)->assertJsonPath('tenants.paying', 1);
    }

    public function test_owner_changes_plan_and_suspends(): void
    {
        $pro = Plan::where('slug', 'pro')->first();

        $this->asOwner()->patchJson("/api/platform/tenants/{$this->tenant->id}", [
            'plan_id' => $pro->id, 'plan_ends_at' => now()->addYear()->toDateString(), 'status' => 'active',
        ])->assertOk()->assertJsonPath('effective.source', 'paid');

        $this->asOwner()->patchJson("/api/platform/tenants/{$this->tenant->id}", ['status' => 'suspended'])->assertOk();
        $this->app['auth']->forgetGuards();
        $this->flushHeaders();
        $this->withHeaders(['X-Tenant' => 'acme'])->postJson('/api/auth/login', ['email' => $this->admin->email, 'password' => 'password'])->assertForbidden();

        $this->assertTrue(ActivityLog::where('action', 'tenant.updated')->exists());
    }

    public function test_support_sign_in_is_short_lived_and_logged(): void
    {
        $res = $this->asOwner()->postJson("/api/platform/tenants/{$this->tenant->id}/impersonate")->assertOk()
            ->assertJsonPath('slug', 'acme')
            ->assertJsonPath('admin.id', $this->admin->id);

        $this->app['auth']->forgetGuards();
        $this->flushHeaders();
        $this->withHeaders(['X-Tenant' => 'acme', 'Authorization' => 'Bearer '.$res->json('token')])
            ->getJson('/api/auth/me')->assertOk()->assertJsonPath('user.id', $this->admin->id);

        $this->assertTrue(ActivityLog::where('action', 'support.impersonate')->where('tenant_id', $this->tenant->id)->exists());

        $this->travel(3)->hours();
        $this->app['auth']->forgetGuards();
        $this->flushHeaders();
        $this->withHeaders(['X-Tenant' => 'acme', 'Authorization' => 'Bearer '.$res->json('token')])
            ->getJson('/api/auth/me')->assertUnauthorized();
    }

    public function test_all_student_payments_are_listed_with_their_institute(): void
    {
        $student = User::factory()->create(['tenant_id' => $this->tenant->id, 'name' => 'Zainab']);
        $course = Course::factory()->published()->create(['tenant_id' => $this->tenant->id, 'instructor_id' => $this->admin->id]);
        $order = new Order(['user_id' => $student->id, 'course_id' => $course->id, 'amount' => 500, 'total' => 500, 'currency' => 'PKR', 'status' => 'pending', 'payment_reference' => 'REF-1']);
        $order->tenant_id = $this->tenant->id;
        $order->save();

        $this->asOwner()->getJson('/api/platform/payments?search=Zainab')->assertOk()
            ->assertJsonPath('data.0.tenant.slug', 'acme')
            ->assertJsonPath('data.0.payment_reference', 'REF-1')
            ->assertJsonPath('summary.pending', 1);
    }

    public function test_activity_records_logins_and_signups(): void
    {
        $this->app['auth']->forgetGuards();
        $this->flushHeaders();
        $this->withHeaders(['X-Tenant' => 'acme'])->postJson('/api/auth/login', ['email' => $this->admin->email, 'password' => 'password'])->assertOk();
        $this->assertNotNull($this->admin->fresh()->last_login_at);

        $this->postJson('/api/register-institute', [
            'institute_name' => 'New School', 'slug' => 'new-school', 'type' => 'school',
            'name' => 'Head', 'email' => 'head@example.com', 'password' => 'password1', 'password_confirmation' => 'password1',
        ])->assertCreated();

        $this->asOwner()->getJson('/api/platform/activity')->assertOk()
            ->assertJsonPath('data.0.action', 'tenant.registered')
            ->assertJsonPath('data.1.action', 'auth.login');
    }
}

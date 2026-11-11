<?php

namespace Tests\Feature;

use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class PlatformSetupTest extends TestCase
{
    use RefreshDatabase;

    private string $key;

    protected function setUp(): void
    {
        parent::setUp();
        $this->key = str_repeat('k', 40);
        config(['app.deploy_token' => $this->key]);
    }

    private function payload(array $overrides = []): array
    {
        return array_merge([
            'token' => $this->key,
            'name' => 'Owner',
            'email' => 'owner@example.com',
            'password' => 'long-password',
            'password_confirmation' => 'long-password',
        ], $overrides);
    }

    public function test_first_super_admin_can_be_created_once(): void
    {
        $this->getJson('/api/platform/setup')->assertJson(['available' => true]);

        $this->postJson('/api/platform/setup', $this->payload())
            ->assertCreated()
            ->assertJsonPath('user.role', 'super_admin');

        $this->assertTrue(User::where('email', 'owner@example.com')->first()->isSuperAdmin());

        // Closed for good once a super admin exists.
        $this->getJson('/api/platform/setup')->assertJson(['available' => false]);
        $this->postJson('/api/platform/setup', $this->payload(['email' => 'second@example.com']))->assertNotFound();
    }

    public function test_setup_needs_the_right_key(): void
    {
        $this->postJson('/api/platform/setup', $this->payload(['token' => 'wrong']))
            ->assertUnprocessable()
            ->assertJsonValidationErrors('token');

        $this->assertSame(0, User::count());
    }

    public function test_setup_is_hidden_without_a_deploy_token(): void
    {
        config(['app.deploy_token' => null]);

        $this->postJson('/api/platform/setup', $this->payload())->assertNotFound();
    }
}

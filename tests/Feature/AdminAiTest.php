<?php

namespace Tests\Feature;

use App\Models\PlatformSetting;
use App\Models\Tenant;
use App\Models\User;
use App\Models\UserNotification;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Crypt;
use Illuminate\Support\Facades\Http;
use Tests\TestCase;

class AdminAiTest extends TestCase
{
    use RefreshDatabase;

    private User $admin;

    private User $teacher;

    protected function setUp(): void
    {
        parent::setUp();
        $this->seed();
        $t = Tenant::factory()->create(['slug' => 'acme', 'trial_ends_at' => now()->addDays(10)]);
        $this->admin = User::factory()->role('admin')->create(['tenant_id' => $t->id]);
        $this->teacher = User::factory()->role('instructor')->create(['tenant_id' => $t->id]);
    }

    private function as(User $user): static
    {
        $this->app['auth']->forgetGuards();
        $this->flushHeaders();

        return $this->withHeaders(['X-Tenant' => 'acme', 'Authorization' => 'Bearer '.$user->createToken('t')->plainTextToken]);
    }

    public function test_switching_a_module_off_blocks_it(): void
    {
        $this->as($this->admin)->getJson('/api/school/fees/setup')->assertOk();
        $this->as($this->admin)->putJson('/api/school/modules', ['modules' => ['fees' => false, 'nonsense' => false]])->assertOk()->assertJsonMissingPath('modules.nonsense');
        $this->as($this->admin)->getJson('/api/school/fees/setup')->assertForbidden();
        $this->as($this->admin)->getJson('/api/school/exams')->assertOk();
        $this->assertFalse($this->as($this->admin)->getJson('/api/auth/me')->json('tenant.settings.modules.fees'));
        $this->as($this->teacher)->putJson('/api/school/modules', ['modules' => ['fees' => true]])->assertForbidden();
    }

    public function test_remote_mode_notifies_everyone_and_shows_in_settings(): void
    {
        $this->as($this->admin)->postJson('/api/school/remote-mode', ['active' => true, 'message' => 'Snow day — classes online.'])->assertOk();
        $this->assertSame(1, UserNotification::where('user_id', $this->teacher->id)->where('type', 'remote_mode')->count());
        $this->assertTrue($this->as($this->teacher)->getJson('/api/auth/me')->json('tenant.settings.remote_mode.active'));
        $this->as($this->admin)->postJson('/api/school/remote-mode', ['active' => false])->assertOk();

        $audit = $this->as($this->admin)->getJson('/api/school/audit?action=school.')->assertOk()->json('data');
        $this->assertCount(2, $audit);
        $this->as($this->teacher)->getJson('/api/school/audit')->assertForbidden();
    }

    public function test_ai_needs_a_key_then_returns_a_draft(): void
    {
        $this->assertFalse($this->as($this->teacher)->getJson('/api/school/ai')->json('enabled'));
        $this->as($this->teacher)->postJson('/api/school/ai', ['tool' => 'quiz', 'topic' => 'Fractions'])->assertStatus(422);

        PlatformSetting::put('ai', ['api_key' => Crypt::encryptString('sk-test'), 'model' => 'claude-haiku-5-5']);
        Http::fake(['api.anthropic.com/*' => Http::response(['content' => [['type' => 'text', 'text' => '## Fractions quiz']], 'usage' => ['input_tokens' => 10]])]);

        $this->assertTrue($this->as($this->teacher)->getJson('/api/school/ai')->json('enabled'));
        $this->as($this->teacher)->postJson('/api/school/ai', ['tool' => 'quiz', 'topic' => 'Fractions', 'grade' => 'Grade 4', 'count' => 5])
            ->assertOk()->assertJson(['text' => '## Fractions quiz']);
        Http::assertSent(fn ($r) => $r->hasHeader('x-api-key', 'sk-test') && $r['model'] === 'claude-haiku-5-5' && str_contains($r['messages'][0]['content'], 'Fractions'));

        // Students only get the tutor.
        $student = User::factory()->role('student')->create(['tenant_id' => $this->teacher->tenant_id]);
        $this->as($student)->postJson('/api/school/ai', ['tool' => 'quiz', 'topic' => 'x'])->assertStatus(422);
        $this->as($student)->postJson('/api/school/ai', ['tool' => 'tutor', 'topic' => 'Photosynthesis'])->assertOk();

        // Turning the module off stops it.
        $this->as($this->admin)->putJson('/api/school/modules', ['modules' => ['ai' => false]]);
        $this->as($this->teacher)->postJson('/api/school/ai', ['tool' => 'quiz', 'topic' => 'Fractions'])->assertForbidden();
    }

    public function test_owner_sets_the_ai_key_in_the_console_without_exposing_it(): void
    {
        $owner = User::factory()->superAdmin()->create();
        $token = $owner->createToken('t')->plainTextToken;

        $this->withHeaders(['Authorization' => "Bearer {$token}"])->putJson('/api/platform/settings', ['ai' => ['api_key' => 'sk-live-123', 'model' => 'claude-sonnet-5-5']])
            ->assertOk()->assertJsonPath('ai.has_key', true)->assertJsonPath('ai.model', 'claude-sonnet-5-5')->assertJsonMissingPath('ai.api_key');
        $this->assertSame('sk-live-123', Crypt::decryptString(PlatformSetting::get('ai')['api_key']));
    }
}

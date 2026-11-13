<?php

namespace Tests\Feature;

use App\Models\Tenant;
use App\Models\User;
use App\Models\UserNotification;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class LiveSessionTest extends TestCase
{
    use RefreshDatabase;

    private User $admin;

    private User $teacher;

    private User $otherTeacher;

    private User $student;

    private User $parent;

    private User $outsider;

    private int $section;

    private int $otherSection;

    protected function setUp(): void
    {
        parent::setUp();
        $this->seed();
        $t = Tenant::factory()->create(['slug' => 'acme', 'trial_ends_at' => now()->addDays(10)]);
        $this->admin = User::factory()->role('admin')->create(['tenant_id' => $t->id]);
        $this->teacher = User::factory()->role('instructor')->create(['tenant_id' => $t->id]);
        $this->otherTeacher = User::factory()->role('instructor')->create(['tenant_id' => $t->id]);

        $this->as($this->admin)->postJson('/api/school/classes', ['name' => 'Grade 5', 'sections' => ['A', 'B']]);
        $sections = $this->as($this->admin)->getJson('/api/school/structure')->json('classes.0.sections');
        [$this->section, $this->otherSection] = [$sections[0]['id'], $sections[1]['id']];
        $this->as($this->admin)->patchJson("/api/school/sections/{$this->section}", ['class_teacher_id' => $this->teacher->id]);
        $id = $this->as($this->admin)->postJson('/api/school/students', ['name' => 'Ava Chen', 'class_section_id' => $this->section,
            'guardians' => [['name' => 'Lily Chen', 'email' => 'lily@example.com']]])->json('id');
        $this->student = User::find($id);
        $this->parent = User::where('email', 'lily@example.com')->first();
        $oid = $this->as($this->admin)->postJson('/api/school/students', ['name' => 'Noah Park', 'class_section_id' => $this->otherSection])->json('id');
        $this->outsider = User::find($oid);
    }

    private function as(User $user): static
    {
        $this->app['auth']->forgetGuards();
        $this->flushHeaders();

        return $this->withHeaders(['X-Tenant' => 'acme', 'Authorization' => 'Bearer '.$user->createToken('t')->plainTextToken]);
    }

    private function classPayload(array $over = []): array
    {
        return $over + [
            'kind' => 'class', 'title' => 'Fractions recap', 'starts_at' => now()->addMinutes(10)->toIso8601String(), 'duration_minutes' => 40,
            'meeting_url' => 'https://zoom.us/j/123456789', 'passcode' => 'abc', 'audience' => 'sections', 'section_ids' => [$this->section],
        ];
    }

    public function test_teacher_schedules_a_class_for_their_section_and_the_class_is_invited(): void
    {
        $this->as($this->teacher)->postJson('/api/school/live', $this->classPayload(['section_ids' => [$this->otherSection]]))->assertForbidden();
        $this->as($this->teacher)->postJson('/api/school/live', $this->classPayload(['meeting_url' => 'http://zoom.us/j/1']))->assertStatus(422);
        $id = $this->as($this->teacher)->postJson('/api/school/live', $this->classPayload())->assertCreated()->json('id');

        $this->assertSame(1, UserNotification::where('user_id', $this->student->id)->where('type', 'live')->count());
        $this->assertSame(1, UserNotification::where('user_id', $this->parent->id)->where('type', 'live')->count());
        $this->assertSame(0, UserNotification::where('user_id', $this->outsider->id)->count());

        $row = $this->as($this->student)->getJson('/api/school/live')->assertOk()->json('data.0');
        $this->assertSame('Zoom', $row['provider']);
        $this->assertNull($row['meeting_url'], 'Students get the link only through Join.');
        $this->assertTrue($row['join_open']);
        $this->assertCount(0, $this->as($this->outsider)->getJson('/api/school/live')->json('data'));
        $this->as($this->outsider)->postJson("/api/school/live/{$id}/join")->assertNotFound();

        $this->assertSame('https://zoom.us/j/123456789', $this->as($this->teacher)->getJson('/api/school/live')->json('data.0.meeting_url'));
        $this->assertCount(1, $this->as($this->student)->getJson('/api/school/live/upcoming')->json('data'));
    }

    public function test_join_records_attendance_and_host_sees_who_joined(): void
    {
        $id = $this->as($this->teacher)->postJson('/api/school/live', $this->classPayload())->json('id');
        $this->as($this->student)->postJson("/api/school/live/{$id}/join")->assertOk()->assertJson(['meeting_url' => 'https://zoom.us/j/123456789', 'passcode' => 'abc']);
        $this->as($this->student)->postJson("/api/school/live/{$id}/join")->assertOk();
        $this->assertTrue($this->as($this->student)->getJson('/api/school/live')->json('data.0.attended'));

        $att = $this->as($this->teacher)->getJson("/api/school/live/{$id}/attendance")->assertOk()->json();
        $this->assertSame(['invited' => 1, 'joined' => 1, 'registered' => 0], $att['summary']);
        $this->assertSame(2, $att['people'][0]['joins']);
        $csv = $this->as($this->teacher)->get("/api/school/live/{$id}/attendance.csv")->assertOk()->streamedContent();
        $this->assertStringContainsString('Ava Chen', $csv);

        $this->as($this->otherTeacher)->getJson("/api/school/live/{$id}/attendance")->assertForbidden();
        $this->as($this->student)->getJson("/api/school/live/{$id}/attendance")->assertForbidden();
    }

    public function test_join_window_cancel_and_recording(): void
    {
        $id = $this->as($this->teacher)->postJson('/api/school/live', $this->classPayload(['starts_at' => now()->addDays(2)->toIso8601String()]))->json('id');
        $this->as($this->student)->postJson("/api/school/live/{$id}/join")->assertStatus(422);
        $this->as($this->teacher)->postJson("/api/school/live/{$id}/join")->assertOk(); // hosts can open it any time

        $this->as($this->teacher)->patchJson("/api/school/live/{$id}", ['recording_url' => 'https://drive.google.com/file/d/xyz'])->assertOk();
        $this->assertSame(1, UserNotification::where('user_id', $this->student->id)->where('title', 'like', 'Recording ready%')->count());

        $this->as($this->teacher)->patchJson("/api/school/live/{$id}", ['status' => 'cancelled'])->assertOk();
        $this->assertSame(1, UserNotification::where('user_id', $this->parent->id)->where('title', 'like', 'Cancelled%')->count());
        $this->as($this->student)->postJson("/api/school/live/{$id}/join")->assertStatus(422);
        $this->as($this->otherTeacher)->patchJson("/api/school/live/{$id}", ['title' => 'x'])->assertForbidden();
    }

    public function test_staff_training_is_office_only_and_hidden_from_families(): void
    {
        $this->as($this->teacher)->postJson('/api/school/live', ['kind' => 'training', 'title' => 'Safeguarding', 'starts_at' => now()->addDay()->toIso8601String(),
            'duration_minutes' => 60, 'meeting_url' => 'https://meet.google.com/abc-defg-hij', 'audience' => 'staff'])->assertForbidden();
        $this->as($this->admin)->postJson('/api/school/live', ['kind' => 'training', 'title' => 'Safeguarding', 'starts_at' => now()->addDay()->toIso8601String(),
            'duration_minutes' => 60, 'meeting_url' => 'https://meet.google.com/abc-defg-hij', 'audience' => 'everyone'])->assertCreated();

        $this->assertSame('Google Meet', $this->as($this->otherTeacher)->getJson('/api/school/live')->json('data.0.provider'));
        $this->assertSame('staff', $this->as($this->otherTeacher)->getJson('/api/school/live')->json('data.0.audience'));
        $this->assertCount(0, $this->as($this->parent)->getJson('/api/school/live')->json('data'));
        $this->assertSame(1, UserNotification::where('user_id', $this->otherTeacher->id)->where('type', 'live')->count());
        $this->assertSame(0, UserNotification::where('user_id', $this->student->id)->where('type', 'live')->count());
    }

    public function test_public_webinar_registration_and_guest_join(): void
    {
        $s = $this->as($this->admin)->postJson('/api/school/live', ['kind' => 'webinar', 'title' => 'Open house', 'starts_at' => now()->addMinutes(5)->toIso8601String(),
            'duration_minutes' => 60, 'meeting_url' => 'https://zoom.us/j/999', 'audience' => 'everyone', 'is_public' => true, 'capacity' => 1])->assertCreated()->json();

        $this->app['auth']->forgetGuards();
        $this->flushHeaders();
        $info = $this->withHeaders(['X-Tenant' => 'acme'])->getJson("/api/webinars/{$s['slug']}")->assertOk()->json();
        $this->assertSame('Open house', $info['session']['title']);
        $this->assertArrayNotHasKey('meeting_url', $info['session']);

        $token = $this->withHeaders(['X-Tenant' => 'acme'])->postJson("/api/webinars/{$s['slug']}/register", ['name' => 'Sam Rivera', 'email' => 'Sam@Example.com'])->assertCreated()->json('token');
        $this->withHeaders(['X-Tenant' => 'acme'])->postJson("/api/webinars/{$s['slug']}/register", ['name' => 'Sam Rivera', 'email' => 'sam@example.com'])->assertOk()->assertJson(['token' => $token]);
        $this->withHeaders(['X-Tenant' => 'acme'])->postJson("/api/webinars/{$s['slug']}/register", ['name' => 'Jo', 'email' => 'jo@example.com'])->assertStatus(422);
        $this->withHeaders(['X-Tenant' => 'acme'])->postJson("/api/webinars/{$s['slug']}/register", ['name' => 'Bot', 'email' => 'b@example.com', 'website' => 'x'])->assertStatus(422);

        $this->withHeaders(['X-Tenant' => 'acme'])->getJson("/api/webinars/{$s['slug']}/join?t=nope")->assertForbidden();
        $this->withHeaders(['X-Tenant' => 'acme'])->getJson("/api/webinars/{$s['slug']}/join?t={$token}")->assertOk()->assertJson(['meeting_url' => 'https://zoom.us/j/999']);

        $att = $this->as($this->admin)->getJson("/api/school/live/{$s['id']}/attendance")->json();
        $this->assertSame(1, $att['summary']['registered']);
        $this->assertNotNull($att['registrations'][0]['joined_at']);

        // A class is never public, and switching the module off hides the page.
        $c = $this->as($this->teacher)->postJson('/api/school/live', $this->classPayload(['is_public' => true]))->json('id');
        $row = collect($this->as($this->admin)->getJson('/api/school/live')->json('data'))->firstWhere('id', $c);
        $this->assertFalse($row['is_public']);
        $this->assertNull($row['slug']);
        $this->as($this->admin)->putJson('/api/school/modules', ['modules' => ['live' => false]]);
        $this->app['auth']->forgetGuards();
        $this->flushHeaders();
        $this->withHeaders(['X-Tenant' => 'acme'])->getJson("/api/webinars/{$s['slug']}")->assertForbidden();
    }

    public function test_reminder_reaches_the_audience(): void
    {
        $id = $this->as($this->teacher)->postJson('/api/school/live', $this->classPayload(['notify' => false]))->json('id');
        $this->assertSame(0, UserNotification::where('user_id', $this->student->id)->where('type', 'live')->count());
        $this->as($this->teacher)->postJson("/api/school/live/{$id}/remind")->assertOk()->assertJson(['sent' => 2]);
        $this->assertSame(1, UserNotification::where('user_id', $this->student->id)->where('title', 'like', 'Starting soon%')->count());
    }
}

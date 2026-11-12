<?php

namespace Tests\Feature;

use App\Models\Tenant;
use App\Models\User;
use App\Models\UserNotification;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class OperationsTest extends TestCase
{
    use RefreshDatabase;

    private User $admin;

    private User $teacher;

    private User $student;

    private User $parent;

    private int $section;

    protected function setUp(): void
    {
        parent::setUp();
        $this->seed();
        $t = Tenant::factory()->create(['slug' => 'acme', 'trial_ends_at' => now()->addDays(10)]);
        Tenant::factory()->create(['slug' => 'other', 'trial_ends_at' => now()->addDays(10)]);
        $this->admin = User::factory()->role('admin')->create(['tenant_id' => $t->id]);
        $this->teacher = User::factory()->role('instructor')->create(['tenant_id' => $t->id]);

        $this->as($this->admin)->postJson('/api/school/classes', ['name' => 'Grade 3', 'sections' => ['A']]);
        $this->section = $this->as($this->admin)->getJson('/api/school/structure')->json('classes.0.sections.0.id');
        $this->as($this->admin)->patchJson("/api/school/sections/{$this->section}", ['class_teacher_id' => $this->teacher->id]);
        $id = $this->as($this->admin)->postJson('/api/school/students', ['name' => 'Mia Lopez', 'class_section_id' => $this->section,
            'guardians' => [['name' => 'Rosa Lopez', 'email' => 'rosa@example.com']]])->json('id');
        $this->student = User::find($id);
        $this->parent = User::where('email', 'rosa@example.com')->first();
    }

    private function as(User $user, string $slug = 'acme'): static
    {
        $this->app['auth']->forgetGuards();
        $this->flushHeaders();

        return $this->withHeaders(['X-Tenant' => $slug, 'Authorization' => 'Bearer '.$user->createToken('t')->plainTextToken]);
    }

    public function test_library_issue_return_and_availability(): void
    {
        $book = $this->as($this->admin)->postJson('/api/school/library/books', ['title' => 'Charlotte’s Web', 'author' => 'E. B. White', 'copies' => 1])->assertCreated()->json('id');
        $loan = $this->as($this->admin)->postJson('/api/school/library/loans', ['library_book_id' => $book, 'user_id' => $this->student->id])->assertCreated()->json();
        $this->as($this->admin)->postJson('/api/school/library/loans', ['library_book_id' => $book, 'user_id' => $this->teacher->id])->assertStatus(422);
        $this->assertSame(0, $this->as($this->student)->getJson('/api/school/library/books')->json('data.0.available'));
        $this->assertCount(1, $this->as($this->parent)->getJson('/api/school/library/mine')->json('data'));

        $this->as($this->admin)->postJson("/api/school/library/loans/{$loan['id']}/return")->assertOk();
        $this->assertSame(1, $this->as($this->student)->getJson('/api/school/library/books')->json('data.0.available'));
        $this->as($this->student)->postJson('/api/school/library/books', ['title' => 'x'])->assertForbidden();
    }

    public function test_transport_inventory_and_visitors(): void
    {
        $route = $this->as($this->admin)->postJson('/api/school/transport/routes', ['name' => 'North loop', 'vehicle' => 'Bus 4', 'capacity' => 1,
            'stops' => [['name' => 'Oak Ave', 'pickup' => '07:10']]])->assertCreated()->json('id');
        $this->as($this->admin)->postJson("/api/school/transport/routes/{$route}/students", ['student_id' => $this->student->id, 'stop' => 'Oak Ave'])->assertOk();
        $this->assertSame('North loop', $this->as($this->parent)->getJson('/api/school/transport/mine')->json('data.0.route.name'));

        $item = $this->as($this->admin)->postJson('/api/school/inventory', ['name' => 'Whiteboard markers', 'unit' => 'box', 'quantity' => 5, 'min_quantity' => 3])->assertCreated()->json('id');
        $this->as($this->admin)->postJson("/api/school/inventory/{$item}/move", ['kind' => 'out', 'quantity' => 9])->assertStatus(422);
        $this->as($this->admin)->postJson("/api/school/inventory/{$item}/move", ['kind' => 'out', 'quantity' => 3])->assertOk()->assertJson(['quantity' => 2, 'low' => true]);
        $this->assertSame(1, $this->as($this->admin)->getJson('/api/school/inventory')->json('low'));
        $this->assertCount(2, $this->as($this->admin)->getJson("/api/school/inventory/{$item}/movements")->json('data'));

        $v = $this->as($this->admin)->postJson('/api/school/visitors', ['name' => 'Tom Reed', 'purpose' => 'Plumbing repair', 'host' => 'Office'])->assertCreated()->json('id');
        $this->assertSame(1, $this->as($this->admin)->getJson('/api/school/visitors')->json('inside'));
        $this->as($this->admin)->postJson("/api/school/visitors/{$v}/out")->assertOk();
        $this->as($this->teacher)->getJson('/api/school/visitors')->assertForbidden();
    }

    public function test_messages_between_parent_and_teacher(): void
    {
        $contacts = collect($this->as($this->parent)->getJson('/api/school/messages/contacts')->assertOk()->json('data'));
        $this->assertTrue($contacts->contains('id', $this->teacher->id));

        $other = User::factory()->role('parent')->create(['tenant_id' => $this->parent->tenant_id]);
        $this->as($this->parent)->postJson('/api/school/messages', ['to' => $other->id, 'body' => 'hi'])->assertStatus(422);

        $c = $this->as($this->parent)->postJson('/api/school/messages', ['to' => $this->teacher->id, 'subject' => 'Reading at home', 'body' => 'How can we help Mia read more?'])->assertCreated()->json('id');
        $this->assertSame(1, UserNotification::where('user_id', $this->teacher->id)->where('type', 'message')->count());
        $this->assertTrue($this->as($this->teacher)->getJson('/api/school/messages')->json('data.0.unread'));
        $this->as($this->teacher)->postJson("/api/school/messages/{$c}", ['body' => '20 minutes a day of picture books works wonders.'])->assertCreated();
        $this->assertCount(2, $this->as($this->parent)->getJson("/api/school/messages/{$c}")->json('messages'));
        $this->as($other)->getJson("/api/school/messages/{$c}")->assertNotFound();
    }

    public function test_helpdesk_ticket_lifecycle(): void
    {
        $t = $this->as($this->parent)->postJson('/api/school/helpdesk', ['subject' => 'Portal login for grandma', 'category' => 'technical', 'body' => 'Can she get access?'])->assertCreated()->json('id');
        $this->assertSame(1, UserNotification::where('user_id', $this->admin->id)->where('type', 'ticket')->count());
        $this->as($this->admin)->postJson("/api/school/helpdesk/{$t}/replies", ['body' => 'Yes — we’ll add her as a guardian.'])->assertCreated();
        $this->assertSame('in_progress', $this->as($this->parent)->getJson("/api/school/helpdesk/{$t}")->json('status'));
        $this->as($this->admin)->patchJson("/api/school/helpdesk/{$t}", ['status' => 'resolved'])->assertOk();
        $this->as($this->teacher)->getJson("/api/school/helpdesk/{$t}")->assertNotFound();
        $this->as($this->parent)->patchJson("/api/school/helpdesk/{$t}", ['status' => 'closed'])->assertForbidden();
    }

    public function test_parent_teacher_meeting_booking(): void
    {
        $e = $this->as($this->admin)->postJson('/api/school/meetings', ['title' => 'Fall PTM', 'date' => now()->addDays(3)->toDateString(), 'starts_at' => '15:00', 'ends_at' => '16:00',
            'slot_minutes' => 15, 'mode' => 'online', 'teacher_ids' => [$this->teacher->id]])->assertCreated()->json('id');
        $this->assertSame(1, UserNotification::where('user_id', $this->parent->id)->where('type', 'ptm')->count());

        $list = $this->as($this->parent)->getJson('/api/school/meetings')->assertOk()->json('data.0');
        $this->assertCount(4, $list['teachers'][0]['slots']);

        $this->as($this->parent)->postJson("/api/school/meetings/{$e}/book", ['teacher_id' => $this->teacher->id, 'slot' => '15:15'])->assertCreated();
        $this->as($this->parent)->postJson("/api/school/meetings/{$e}/book", ['teacher_id' => $this->teacher->id, 'slot' => '15:30'])->assertStatus(422);
        $other = User::factory()->role('parent')->create(['tenant_id' => $this->parent->tenant_id]);
        $this->as($other)->postJson("/api/school/meetings/{$e}/book", ['teacher_id' => $this->teacher->id, 'slot' => '15:15'])->assertStatus(422);

        $booking = $this->as($this->teacher)->getJson('/api/school/meetings')->json('data.0.bookings.0');
        $this->assertStringStartsWith('https://meet.jit.si/', $booking['meeting_url']);
        $this->as($this->teacher)->patchJson("/api/school/meeting-bookings/{$booking['id']}", ['status' => 'done', 'notes' => 'Reading improving.'])->assertOk();
        $this->as($this->parent)->patchJson("/api/school/meeting-bookings/{$booking['id']}", ['notes' => 'x'])->assertStatus(422);
    }

    public function test_events_with_parent_consent(): void
    {
        $e = $this->as($this->teacher)->postJson('/api/school/events', ['title' => 'Zoo trip', 'kind' => 'trip', 'date' => now()->addDays(7)->toDateString(),
            'section_ids' => [$this->section], 'needs_consent' => true])->assertCreated()->json('id');
        $this->assertSame(1, UserNotification::where('user_id', $this->parent->id)->where('type', 'event')->count());

        $mine = $this->as($this->parent)->getJson('/api/school/events')->assertOk()->json('data.0');
        $this->assertNull($mine['children'][0]['response']);
        $this->as($this->parent)->postJson("/api/school/events/{$e}/respond", ['student_id' => $this->student->id, 'response' => 'yes'])->assertOk();
        $this->assertSame(1, $this->as($this->teacher)->getJson('/api/school/events')->json('data.0.responses.yes'));
        $this->assertSame('yes', $this->as($this->teacher)->getJson("/api/school/events/{$e}/responses")->json('data.0.response'));

        $outsider = User::factory()->role('admin')->create(['tenant_id' => Tenant::where('slug', 'other')->value('id')]);
        $this->as($outsider, 'other')->getJson('/api/school/events')->assertOk()->assertJsonCount(0, 'data');
    }
}

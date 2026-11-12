<?php

namespace Tests\Feature;

use App\Models\FeeInvoice;
use App\Models\Tenant;
use App\Models\User;
use App\Models\UserNotification;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class FeesTest extends TestCase
{
    use RefreshDatabase;

    private User $admin;

    protected function setUp(): void
    {
        parent::setUp();
        $this->seed();
        Tenant::factory()->create(['slug' => 'acme', 'trial_ends_at' => now()->addDays(10), 'settings' => ['currency' => 'USD']]);
        Tenant::factory()->create(['slug' => 'other', 'trial_ends_at' => now()->addDays(10)]);
        $this->admin = User::factory()->role('admin')->create(['tenant_id' => Tenant::where('slug', 'acme')->value('id')]);
    }

    private function as(User $user, string $slug = 'acme'): static
    {
        $this->app['auth']->forgetGuards();
        $this->flushHeaders();

        return $this->withHeaders(['X-Tenant' => $slug, 'Authorization' => 'Bearer '.$user->createToken('t')->plainTextToken]);
    }

    /** Grade 5 (section A) with tuition 200/month and a one-time admission fee 50; two students, one with a 50% sibling discount. */
    private function school(): array
    {
        $this->as($this->admin)->postJson('/api/school/classes', ['name' => 'Grade 5', 'sections' => ['A']])->assertCreated();
        $class = $this->as($this->admin)->getJson('/api/school/structure')->json('classes.0');
        $section = $class['sections'][0]['id'];

        $tuition = $this->as($this->admin)->postJson('/api/school/fees/heads', ['name' => 'Tuition', 'frequency' => 'monthly'])->assertCreated()->json('id');
        $admission = $this->as($this->admin)->postJson('/api/school/fees/heads', ['name' => 'Admission', 'frequency' => 'once'])->assertCreated()->json('id');
        $this->as($this->admin)->putJson("/api/school/fees/plans/{$class['id']}", ['plans' => [
            ['fee_head_id' => $tuition, 'amount' => 200], ['fee_head_id' => $admission, 'amount' => 50],
        ]])->assertOk();

        $a = $this->as($this->admin)->postJson('/api/school/students', ['name' => 'Lily Carter', 'class_section_id' => $section,
            'guardians' => [['name' => 'Anna Carter', 'email' => 'anna@example.com']]])->assertCreated()->json('id');
        $b = $this->as($this->admin)->postJson('/api/school/students', ['name' => 'Max Carter', 'class_section_id' => $section,
            'guardians' => [['name' => 'Anna Carter', 'email' => 'anna@example.com']]])->assertCreated()->json('id');
        $this->as($this->admin)->postJson('/api/school/fees/discounts', ['student_id' => $b, 'fee_head_id' => $tuition, 'name' => 'Sibling', 'type' => 'percent', 'value' => 50])->assertCreated();

        return [$section, $tuition, $admission, User::find($a), User::find($b), User::where('email', 'anna@example.com')->first()];
    }

    public function test_generating_monthly_invoices_applies_plans_and_discounts_once_per_period(): void
    {
        [$section, $tuition, , $lily, $max, $parent] = $this->school();

        $res = $this->as($this->admin)->postJson('/api/school/fees/generate', [
            'period' => 'November 2026', 'due_on' => now()->addDays(10)->toDateString(), 'head_ids' => [$tuition],
        ])->assertCreated()->json();
        $this->assertSame(2, $res['created']);
        $this->assertEquals(300, $res['total']); // 200 + (200 − 50%)

        $this->assertEquals(200, FeeInvoice::where('student_id', $lily->id)->value('total'));
        $this->assertEquals(100, FeeInvoice::where('student_id', $max->id)->value('total'));
        $this->assertMatchesRegularExpression('/^INV-\d{4}-0000[12]$/', FeeInvoice::first()->number);
        $this->assertSame(2, UserNotification::where('user_id', $parent->id)->where('type', 'fee_invoice')->count());

        // Running it again for the same period skips everyone.
        $again = $this->as($this->admin)->postJson('/api/school/fees/generate', ['period' => 'November 2026', 'due_on' => now()->addDays(10)->toDateString()])->assertCreated()->json();
        $this->assertSame(0, $again['created']);
        $this->assertSame(2, $again['skipped']['already_billed']);
    }

    public function test_partial_and_full_payments_issue_receipts_and_update_status(): void
    {
        [, $tuition, , $lily, , $parent] = $this->school();
        $this->as($this->admin)->postJson('/api/school/fees/generate', ['period' => 'Nov', 'due_on' => now()->addDays(5)->toDateString(), 'head_ids' => [$tuition]]);
        $inv = FeeInvoice::where('student_id', $lily->id)->first();

        $this->as($this->admin)->postJson("/api/school/fees/invoices/{$inv->id}/payments", ['amount' => 500, 'method' => 'cash'])->assertStatus(422);
        $p1 = $this->as($this->admin)->postJson("/api/school/fees/invoices/{$inv->id}/payments", ['amount' => 120, 'method' => 'cash'])->assertCreated()->json();
        $this->assertStringStartsWith('RCT-', $p1['receipt_no']);
        $this->assertSame('partial', $inv->fresh()->status);
        $this->assertEquals(80, $inv->fresh()->balance());

        $this->as($this->admin)->postJson("/api/school/fees/invoices/{$inv->id}/payments", ['amount' => 80, 'method' => 'bank', 'reference' => 'TX-1'])->assertCreated();
        $this->assertSame('paid', $inv->fresh()->status);
        $this->assertSame(2, UserNotification::where('user_id', $parent->id)->where('type', 'fee_paid')->count());

        // Paid invoices can't be cancelled.
        $this->as($this->admin)->patchJson("/api/school/fees/invoices/{$inv->id}", ['status' => 'cancelled'])->assertStatus(422);
    }

    public function test_parent_reports_a_payment_and_the_office_confirms_it(): void
    {
        [, $tuition, , $lily, $max, $parent] = $this->school();
        $this->as($this->admin)->postJson('/api/school/fees/generate', ['period' => 'Nov', 'due_on' => now()->addDays(5)->toDateString(), 'head_ids' => [$tuition]]);
        $inv = FeeInvoice::where('student_id', $lily->id)->first();

        $mine = $this->as($parent)->getJson('/api/school/fees/mine')->assertOk()->json();
        $this->assertCount(2, $mine['data']);
        $this->assertEquals(300, $mine['outstanding']);

        $pay = $this->as($parent)->postJson("/api/school/fees/invoices/{$inv->id}/report-payment", ['amount' => 200, 'method' => 'bank', 'reference' => 'WIRE-7781'])->assertCreated()->json();
        $this->assertSame('pending', $pay['status']);
        $this->as($parent)->postJson("/api/school/fees/invoices/{$inv->id}/report-payment", ['amount' => 200, 'method' => 'bank', 'reference' => 'again'])->assertStatus(422);
        $this->assertSame('unpaid', $inv->fresh()->status);
        $this->assertSame(1, UserNotification::where('user_id', $this->admin->id)->where('type', 'fee_reported')->count());

        $this->as($this->admin)->postJson("/api/school/fees/payments/{$pay['id']}/review", ['status' => 'confirmed'])->assertOk()->assertJsonPath('status', 'confirmed');
        $this->assertSame('paid', $inv->fresh()->status);

        // Another family can't see or pay this invoice; students see only their own.
        $stranger = User::factory()->role('parent')->create(['tenant_id' => $parent->tenant_id]);
        $this->as($stranger)->getJson("/api/school/fees/invoices/{$inv->id}")->assertNotFound();
        $this->as($max)->getJson('/api/school/fees/mine')->assertOk()->assertJsonCount(1, 'data');
    }

    public function test_reports_reminders_and_isolation(): void
    {
        [, $tuition, , $lily, , $parent] = $this->school();
        $this->as($this->admin)->postJson('/api/school/fees/generate', ['period' => 'Oct', 'issued_on' => now()->subDays(20)->toDateString(), 'due_on' => now()->subDays(5)->toDateString(), 'head_ids' => [$tuition]]);

        $sum = $this->as($this->admin)->getJson('/api/school/fees/summary')->assertOk()->json();
        $this->assertEquals(300, $sum['overdue']);
        $this->assertCount(2, $sum['defaulters']);
        $this->assertSame(1, $this->as($this->admin)->getJson('/api/school/fees/invoices?status=overdue&student_id='.$lily->id)->json('meta.total'));

        $this->as($this->admin)->postJson('/api/school/fees/reminders')->assertOk()->assertJson(['sent' => 2]);
        $this->as($this->admin)->postJson('/api/school/fees/reminders')->assertOk()->assertJson(['sent' => 0]);
        $this->assertSame(2, UserNotification::where('user_id', $parent->id)->where('type', 'fee_overdue')->count());

        $this->as($this->admin)->get('/api/school/fees/exports/invoices.csv')->assertOk();

        $outsider = User::factory()->role('admin')->create(['tenant_id' => Tenant::where('slug', 'other')->value('id')]);
        $inv = FeeInvoice::first();
        $this->as($outsider, 'other')->getJson('/api/school/fees/invoices')->assertOk()->assertJsonCount(0, 'data');
        $this->as($outsider, 'other')->postJson("/api/school/fees/invoices/{$inv->id}/payments", ['amount' => 1, 'method' => 'cash'])->assertNotFound();

        // Teachers don't handle money.
        $teacher = User::factory()->role('instructor')->create(['tenant_id' => $parent->tenant_id]);
        $this->as($teacher)->getJson('/api/school/fees/invoices')->assertForbidden();
    }
}

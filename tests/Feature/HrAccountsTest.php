<?php

namespace Tests\Feature;

use App\Models\Employee;
use App\Models\Payslip;
use App\Models\Tenant;
use App\Models\User;
use App\Models\UserNotification;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class HrAccountsTest extends TestCase
{
    use RefreshDatabase;

    private User $admin;

    private User $teacher;

    protected function setUp(): void
    {
        parent::setUp();
        $this->seed();
        $t = Tenant::factory()->create(['slug' => 'acme', 'trial_ends_at' => now()->addDays(10), 'settings' => ['currency' => 'USD']]);
        Tenant::factory()->create(['slug' => 'other', 'trial_ends_at' => now()->addDays(10)]);
        $this->admin = User::factory()->role('admin')->create(['tenant_id' => $t->id]);
        $this->teacher = User::factory()->role('instructor')->create(['tenant_id' => $t->id, 'name' => 'Jacob Miller']);
    }

    private function as(User $user, string $slug = 'acme'): static
    {
        $this->app['auth']->forgetGuards();
        $this->flushHeaders();

        return $this->withHeaders(['X-Tenant' => $slug, 'Authorization' => 'Bearer '.$user->createToken('t')->plainTextToken]);
    }

    public function test_employees_from_staff_accounts_and_manual_records(): void
    {
        $this->as($this->admin)->postJson('/api/school/hr/employees/import-accounts')->assertOk()->assertJson(['added' => 2]);
        $this->as($this->admin)->postJson('/api/school/hr/employees/import-accounts')->assertOk()->assertJson(['added' => 0]);

        $driver = $this->as($this->admin)->postJson('/api/school/hr/employees', ['name' => 'Carlos Ruiz', 'designation' => 'Bus driver', 'department' => 'Transport', 'base_salary' => 1800])
            ->assertCreated()->json();
        $this->assertSame('EMP-0003', $driver['employee_no']);
        $list = $this->as($this->admin)->getJson('/api/school/hr/employees')->assertOk()->json();
        $this->assertCount(3, $list['data']);
        $this->assertSame(0, $list['unlinked_staff_accounts']);

        $this->as($this->teacher)->getJson('/api/school/hr/employees')->assertForbidden();
    }

    public function test_payroll_deducts_unpaid_days_and_publishes_payslips(): void
    {
        $this->as($this->admin)->postJson('/api/school/hr/employees/import-accounts');
        $emp = Employee::where('user_id', $this->teacher->id)->first();
        $this->as($this->admin)->patchJson("/api/school/hr/employees/{$emp->id}", [
            'base_salary' => 3000, 'allowances' => [['name' => 'Housing', 'amount' => 500]], 'deductions' => [['name' => 'Tax', 'amount' => 300]],
        ])->assertOk();

        $period = now()->format('Y-m');
        $day = now()->startOfMonth()->toDateString();
        $this->as($this->admin)->postJson('/api/school/hr/attendance', ['date' => $day, 'records' => [['employee_id' => $emp->id, 'status' => 'absent']]])->assertOk();

        $run = $this->as($this->admin)->postJson('/api/school/hr/payroll', ['period' => $period])->assertCreated()->json();
        $this->as($this->admin)->postJson('/api/school/hr/payroll', ['period' => $period])->assertStatus(422);

        $slip = Payslip::where('employee_id', $emp->id)->first();
        $this->assertEquals(1, $slip->unpaid_days);
        $this->assertEquals(100, $slip->unpaid_deduction); // 3000 / 30
        $this->assertEquals(3500, $slip->gross);
        $this->assertEquals(3100, $slip->net); // 3500 − 300 − 100

        $this->as($this->admin)->patchJson("/api/school/hr/payslips/{$slip->id}", ['bonus' => 250])->assertOk()->assertJsonPath('net', 3350);

        // Draft payslips are hidden from the employee.
        $this->as($this->teacher)->getJson("/api/school/hr/payslips/{$slip->id}")->assertNotFound();
        $this->as($this->admin)->postJson("/api/school/hr/payroll/{$run['id']}/status", ['status' => 'paid'])->assertStatus(422);
        $this->as($this->admin)->postJson("/api/school/hr/payroll/{$run['id']}/status", ['status' => 'finalized'])->assertOk();
        $this->as($this->admin)->patchJson("/api/school/hr/payslips/{$slip->id}", ['bonus' => 1])->assertStatus(422);
        $this->as($this->admin)->postJson("/api/school/hr/payroll/{$run['id']}/status", ['status' => 'paid'])->assertOk();

        $this->assertSame(1, UserNotification::where('user_id', $this->teacher->id)->where('type', 'payslip')->count());
        $this->as($this->teacher)->getJson("/api/school/hr/payslips/{$slip->id}")->assertOk()->assertJsonPath('net', 3350);
        $this->assertCount(1, $this->as($this->teacher)->getJson('/api/school/hr/me')->json('payslips'));
        $this->as($this->admin)->get("/api/school/hr/payroll/{$run['id']}/export.csv")->assertOk();
    }

    public function test_staff_leave_requests_and_balances(): void
    {
        $this->as($this->admin)->postJson('/api/school/hr/employees/import-accounts');

        $id = $this->as($this->teacher)->postJson('/api/school/hr/me/leave', ['type' => 'annual', 'from_date' => now()->addDays(3)->toDateString(), 'to_date' => now()->addDays(5)->toDateString(), 'reason' => 'Family'])
            ->assertCreated()->json('id');
        $this->assertSame(1, UserNotification::where('user_id', $this->admin->id)->where('type', 'staff_leave')->count());

        $this->as($this->admin)->postJson("/api/school/hr/leaves/{$id}/review", ['status' => 'approved'])->assertOk();
        $me = $this->as($this->teacher)->getJson('/api/school/hr/me')->assertOk()->json();
        $this->assertSame(11, $me['leave_balance']['annual']); // 14 − 3
        $this->assertSame('approved', $me['leaves'][0]['status']);

        $sheet = $this->as($this->admin)->getJson('/api/school/hr/attendance?date='.now()->addDays(4)->toDateString())->json('employees');
        $this->assertSame('leave', collect($sheet)->firstWhere('name', 'Jacob Miller')['status']);
    }

    public function test_accounts_income_statement_combines_fees_payroll_and_entries(): void
    {
        $this->as($this->admin)->postJson('/api/school/accounts/entries', ['type' => 'expense', 'category' => 'Rent', 'date' => now()->toDateString(), 'amount' => 2000, 'party' => 'Market St Properties'])->assertCreated();
        $this->as($this->admin)->postJson('/api/school/accounts/entries', ['type' => 'income', 'category' => 'Donations', 'date' => now()->toDateString(), 'amount' => 500])->assertCreated();
        $this->as($this->admin)->postJson('/api/school/accounts/entries', ['type' => 'income', 'category' => 'Donations', 'date' => now()->toDateString(), 'amount' => -5])->assertStatus(422);

        $sum = $this->as($this->admin)->getJson('/api/school/accounts/summary')->assertOk()->json();
        $this->assertEquals(500, $sum['income']['total']);
        $this->assertEquals(2000, $sum['expense']['total']);
        $this->assertEquals(-1500, $sum['net']);
        $this->assertCount(12, $sum['months']);

        $this->as($this->admin)->get('/api/school/accounts/export.csv')->assertOk();
        $outsider = User::factory()->role('admin')->create(['tenant_id' => Tenant::where('slug', 'other')->value('id')]);
        $this->as($outsider, 'other')->getJson('/api/school/accounts/entries')->assertOk()->assertJsonCount(0, 'data');
    }
}

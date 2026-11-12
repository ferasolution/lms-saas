<?php

namespace App\Http\Controllers\Api\School;

use App\Http\Controllers\Controller;
use App\Models\ActivityLog;
use App\Models\Employee;
use App\Models\PayrollRun;
use App\Models\Payslip;
use App\Models\StaffAttendance;
use App\Models\StaffLeave;
use App\Models\User;
use App\Services\Fees;
use App\Services\Notifier;
use App\Services\School;
use App\Support\Csv;
use Carbon\CarbonImmutable;
use Carbon\CarbonPeriod;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\Rule;
use Symfony\Component\HttpFoundation\StreamedResponse;

/**
 * HR: employee records, staff attendance, leave and monthly payroll with payslips.
 */
class HrController extends Controller
{
    public const LEAVE_TYPES = ['annual', 'sick', 'casual', 'unpaid', 'other'];

    public function __construct(protected School $school, protected Fees $fees) {}

    // ── Employees ────────────────────────────────────────────────────

    public function employees(Request $request): JsonResponse
    {
        $rows = Employee::query()
            ->where('status', $request->input('status', 'active'))
            ->when($request->filled('department'), fn ($q) => $q->where('department', $request->string('department')))
            ->when($request->filled('search'), function ($q) use ($request) {
                $term = '%'.$request->string('search').'%';
                $q->where(fn ($q) => $q->where('name', 'like', $term)->orWhere('employee_no', 'like', $term)->orWhere('designation', 'like', $term));
            })
            ->orderBy('name')->get();

        $linkable = User::whereIn('role', [User::ROLE_ADMIN, User::ROLE_MANAGER, User::ROLE_INSTRUCTOR])
            ->whereNotIn('id', Employee::whereNotNull('user_id')->pluck('user_id'))->count();

        return response()->json([
            'data' => $rows->map(fn ($e) => $this->employeeRow($e)),
            'departments' => Employee::whereNotNull('department')->distinct()->orderBy('department')->pluck('department'),
            'unlinked_staff_accounts' => $linkable,
            'currency' => $this->fees->currency(),
        ]);
    }

    public function storeEmployee(Request $request): JsonResponse
    {
        $data = $request->validate($this->employeeRules($request));
        $e = new Employee($data);
        $e->employee_no = $data['employee_no'] ?? $this->nextNo();
        $e->save();
        ActivityLog::record('hr.employee_added', "Added employee {$e->name}");

        return response()->json($this->employeeRow($e), 201);
    }

    public function updateEmployee(Request $request, Employee $employee): JsonResponse
    {
        $data = $request->validate($this->employeeRules($request, $employee) + ['status' => ['sometimes', Rule::in(['active', 'left'])]]);
        $employee->fill($data);
        if (($data['status'] ?? null) === 'left' && ! $employee->left_on) {
            $employee->left_on = now()->toDateString();
        }
        $employee->save();
        ActivityLog::record('hr.employee_updated', "Updated {$employee->name}", ['fields' => array_keys($data)]);

        return response()->json($this->employeeRow($employee));
    }

    /** Create employee records for staff accounts that don't have one yet. */
    public function importAccounts(): JsonResponse
    {
        $users = User::whereIn('role', [User::ROLE_ADMIN, User::ROLE_MANAGER, User::ROLE_INSTRUCTOR])
            ->whereNotIn('id', Employee::whereNotNull('user_id')->pluck('user_id'))->get();
        foreach ($users as $u) {
            $e = new Employee(['user_id' => $u->id, 'name' => $u->name, 'email' => $u->email, 'phone' => $u->phone,
                'designation' => $u->role === User::ROLE_INSTRUCTOR ? 'Teacher' : ($u->role === User::ROLE_ADMIN ? 'Administrator' : 'Manager'),
                'department' => $u->role === User::ROLE_INSTRUCTOR ? 'Teaching' : 'Administration', 'joined_on' => $u->created_at?->toDateString()]);
            $e->employee_no = $this->nextNo();
            $e->save();
        }

        return response()->json(['added' => $users->count()]);
    }

    public function export(): StreamedResponse
    {
        return Csv::download('employees.csv', ['Employee no', 'Name', 'Email', 'Phone', 'Designation', 'Department', 'Type', 'Joined', 'Status', 'Base salary'],
            Employee::orderBy('name')->get()->map(fn ($e) => [$e->employee_no, $e->name, $e->email, $e->phone, $e->designation, $e->department, $e->employment_type, $e->joined_on?->toDateString(), $e->status, $e->base_salary]));
    }

    // ── Staff attendance ─────────────────────────────────────────────

    public function attendance(Request $request): JsonResponse
    {
        $date = $request->date('date')?->toDateString() ?? now()->toDateString();
        $records = StaffAttendance::whereDate('date', $date)->get()->keyBy('employee_id');
        $onLeave = StaffLeave::where('status', 'approved')->whereDate('from_date', '<=', $date)->whereDate('to_date', '>=', $date)->pluck('employee_id')->flip();

        return response()->json([
            'date' => $date,
            'employees' => Employee::where('status', 'active')->orderBy('name')->get()->map(fn ($e) => [
                'id' => $e->id, 'name' => $e->name, 'designation' => $e->designation,
                'status' => $records[$e->id]->status ?? (isset($onLeave[$e->id]) ? 'leave' : null),
                'check_in' => isset($records[$e->id]) && $records[$e->id]->check_in ? substr($records[$e->id]->check_in, 0, 5) : null,
                'check_out' => isset($records[$e->id]) && $records[$e->id]->check_out ? substr($records[$e->id]->check_out, 0, 5) : null,
            ]),
        ]);
    }

    public function saveAttendance(Request $request): JsonResponse
    {
        $data = $request->validate([
            'date' => ['required', 'date', 'before_or_equal:today'],
            'records' => ['required', 'array', 'max:1000'],
            'records.*.employee_id' => ['required', 'integer', Rule::exists('employees', 'id')->where('tenant_id', $request->user()->tenant_id)],
            'records.*.status' => ['required', Rule::in(['present', 'absent', 'late', 'half_day', 'leave'])],
            'records.*.check_in' => ['nullable', 'date_format:H:i'],
            'records.*.check_out' => ['nullable', 'date_format:H:i'],
        ]);
        $date = CarbonImmutable::parse($data['date'])->toDateString();
        DB::transaction(function () use ($data, $date, $request) {
            foreach ($data['records'] as $r) {
                $row = StaffAttendance::where('employee_id', $r['employee_id'])->whereDate('date', $date)->first()
                    ?? new StaffAttendance(['employee_id' => $r['employee_id'], 'date' => $date]);
                $row->fill(['status' => $r['status'], 'check_in' => $r['check_in'] ?? null, 'check_out' => $r['check_out'] ?? null]);
                $row->marked_by = $request->user()->id;
                $row->save();
            }
        });

        return response()->json(['saved' => count($data['records'])]);
    }

    // ── Leave ────────────────────────────────────────────────────────

    public function leaves(Request $request): JsonResponse
    {
        $rows = StaffLeave::with('employee')->when($request->filled('status'), fn ($q) => $q->where('status', $request->string('status')))
            ->latest('id')->limit(300)->get();

        return response()->json(['data' => $rows->map(fn ($l) => $this->leaveRow($l))]);
    }

    public function storeLeave(Request $request): JsonResponse
    {
        $data = $request->validate($this->leaveRules() + ['employee_id' => ['required', 'integer', Rule::exists('employees', 'id')->where('tenant_id', $request->user()->tenant_id)]]);

        return response()->json($this->leaveRow($this->createLeave($data, 'approved', $request->user())), 201);
    }

    public function reviewLeave(Request $request, StaffLeave $leave): JsonResponse
    {
        abort_if($leave->status !== 'pending', 422, 'This request was already decided.');
        $data = $request->validate(['status' => ['required', Rule::in(['approved', 'rejected'])]]);
        DB::transaction(function () use ($leave, $data, $request) {
            $leave->forceFill(['status' => $data['status'], 'reviewed_by' => $request->user()->id, 'reviewed_at' => now()])->save();
            if ($data['status'] === 'approved') {
                $this->markLeave($leave, $request->user());
            }
        });
        $employee = Employee::find($leave->employee_id);
        if ($employee?->user_id) {
            $this->school->notify($employee->user_id, 'staff_leave_'.$data['status'], 'Leave '.($data['status'] === 'approved' ? 'approved' : 'not approved'),
                $leave->from_date->format('M j').' – '.$leave->to_date->format('M j'), '/my-hr');
        }

        return response()->json($this->leaveRow($leave->load('employee')));
    }

    // ── Self-service ─────────────────────────────────────────────────

    public function me(Request $request): JsonResponse
    {
        $e = Employee::where('user_id', $request->user()->id)->first();
        if (! $e) {
            return response()->json(['employee' => null]);
        }
        $usedAnnual = StaffLeave::where('employee_id', $e->id)->where('status', 'approved')->where('type', 'annual')
            ->whereYear('from_date', now()->year)->sum('days');

        return response()->json([
            'employee' => $this->employeeRow($e, false),
            'leave_balance' => ['annual' => max(0, $e->annual_leave_days - (int) $usedAnnual), 'allowance' => $e->annual_leave_days],
            'leaves' => StaffLeave::with('employee')->where('employee_id', $e->id)->latest('id')->limit(50)->get()->map(fn ($l) => $this->leaveRow($l)),
            'payslips' => Payslip::with('run')->where('employee_id', $e->id)
                ->whereHas('run', fn ($q) => $q->whereIn('status', ['finalized', 'paid']))->latest('id')->limit(24)->get()
                ->map(fn ($p) => ['id' => $p->id, 'period' => $p->run?->period, 'net' => $p->net, 'status' => $p->run?->status, 'currency' => $p->run?->currency]),
        ]);
    }

    public function requestLeave(Request $request): JsonResponse
    {
        $e = Employee::where('user_id', $request->user()->id)->first();
        abort_if(! $e, 422, 'Your account isn’t linked to an employee record yet. Ask the school office.');
        $leave = $this->createLeave($request->validate($this->leaveRules()) + ['employee_id' => $e->id], 'pending', $request->user());
        $this->school->notify(app(Notifier::class)->roleIds($request->user()->tenant_id, School::OFFICE), 'staff_leave',
            "Leave request: {$e->name}", "{$leave->days} days · {$leave->type}", '/hr?tab=leave');

        return response()->json($this->leaveRow($leave), 201);
    }

    // ── Payroll ──────────────────────────────────────────────────────

    public function payrollRuns(): JsonResponse
    {
        return response()->json(['data' => PayrollRun::withCount('payslips')->orderByDesc('period')->get()->map(fn ($r) => $this->runRow($r)), 'currency' => $this->fees->currency()]);
    }

    /** Draft payroll for a month: a payslip for every active employee. */
    public function createRun(Request $request): JsonResponse
    {
        $data = $request->validate([
            'period' => ['required', 'date_format:Y-m', Rule::unique('payroll_runs')->where('tenant_id', $request->user()->tenant_id)],
        ], ['period.unique' => 'Payroll for this month already exists.']);

        $run = DB::transaction(function () use ($data, $request) {
            $run = PayrollRun::create(['period' => $data['period'], 'currency' => $this->fees->currency(), 'created_by' => $request->user()->id]);
            foreach (Employee::where('status', 'active')->get() as $e) {
                $slip = new Payslip(['payroll_run_id' => $run->id, 'employee_id' => $e->id]);
                $this->compute($slip, $e, $data['period']);
                $slip->save();
            }
            $this->totals($run);

            return $run;
        });

        return response()->json($this->runRow($run->loadCount('payslips')), 201);
    }

    public function showRun(PayrollRun $run): JsonResponse
    {
        return response()->json($this->runRow($run->loadCount('payslips')) + [
            'payslips' => Payslip::with('employee')->where('payroll_run_id', $run->id)->get()->sortBy('employee.name')->values()->map(fn ($p) => $this->slipRow($p)),
        ]);
    }

    public function updateSlip(Request $request, Payslip $payslip): JsonResponse
    {
        $run = PayrollRun::findOrFail($payslip->payroll_run_id);
        abort_if($run->status !== 'draft', 422, 'This payroll is finalised.');
        $data = $request->validate([
            'bonus' => ['nullable', 'numeric', 'min:0', 'max:9999999'],
            'unpaid_days' => ['nullable', 'numeric', 'min:0', 'max:31'],
            'note' => ['nullable', 'string', 'max:300'],
        ]);
        $employee = Employee::findOrFail($payslip->employee_id);
        $payslip->fill(['note' => $data['note'] ?? $payslip->note, 'bonus' => $data['bonus'] ?? $payslip->bonus]);
        $this->compute($payslip, $employee, $run->period, array_key_exists('unpaid_days', $data) ? (float) $data['unpaid_days'] : $payslip->unpaid_days);
        $payslip->save();
        $this->totals($run);

        return response()->json($this->slipRow($payslip->load('employee')));
    }

    /** Recalculate every draft payslip (after salary changes or attendance updates). */
    public function recalculate(PayrollRun $run): JsonResponse
    {
        abort_if($run->status !== 'draft', 422, 'This payroll is finalised.');
        DB::transaction(function () use ($run) {
            $existing = Payslip::where('payroll_run_id', $run->id)->get()->keyBy('employee_id');
            foreach (Employee::where('status', 'active')->get() as $e) {
                $slip = $existing[$e->id] ?? new Payslip(['payroll_run_id' => $run->id, 'employee_id' => $e->id]);
                $this->compute($slip, $e, $run->period);
                $slip->save();
            }
            $this->totals($run);
        });

        return $this->showRun($run);
    }

    public function advanceRun(Request $request, PayrollRun $run): JsonResponse
    {
        $data = $request->validate(['status' => ['required', Rule::in(['draft', 'finalized', 'paid'])], 'paid_on' => ['nullable', 'date']]);
        $order = ['draft' => 0, 'finalized' => 1, 'paid' => 2];
        abort_if($run->status === 'paid', 422, 'This payroll is already paid.');
        abort_if($data['status'] === 'paid' && $run->status !== 'finalized', 422, 'Finalise the payroll before marking it paid.');
        abort_if($order[$data['status']] < $order[$run->status] && $data['status'] !== 'draft', 422, 'Not allowed.');

        $run->status = $data['status'];
        if ($data['status'] === 'paid') {
            $run->paid_on = $data['paid_on'] ?? now()->toDateString();
            $users = Employee::whereIn('id', Payslip::where('payroll_run_id', $run->id)->pluck('employee_id'))->whereNotNull('user_id')->pluck('user_id')->all();
            $this->school->notify($users, 'payslip', 'Your payslip for '.CarbonImmutable::createFromFormat('Y-m', $run->period)->format('F Y').' is ready', null, '/my-hr');
        }
        $run->save();
        ActivityLog::record('hr.payroll', "Payroll {$run->period} → {$run->status}");

        return response()->json($this->runRow($run->loadCount('payslips')));
    }

    public function destroyRun(PayrollRun $run): JsonResponse
    {
        abort_if($run->status !== 'draft', 422, 'Only draft payrolls can be deleted.');
        $run->delete();

        return response()->json(['ok' => true]);
    }

    public function exportRun(PayrollRun $run): StreamedResponse
    {
        $slips = Payslip::with('employee')->where('payroll_run_id', $run->id)->get()->sortBy('employee.name');

        return Csv::download("payroll-{$run->period}.csv", ['Employee no', 'Name', 'Bank', 'Account', 'Basic', 'Allowances', 'Bonus', 'Gross', 'Deductions', 'Net'],
            $slips->map(fn ($p) => [$p->employee?->employee_no, $p->employee?->name, $p->employee?->bank_name, $p->employee?->bank_account, $p->basic,
                array_sum(array_column($p->allowances ?? [], 'amount')), $p->bonus, $p->gross, $p->total_deductions, $p->net]));
    }

    /** One payslip: office, or the employee themself once finalised. */
    public function payslip(Request $request, Payslip $payslip): JsonResponse
    {
        $payslip->load(['employee', 'run']);
        $own = $payslip->employee?->user_id === $request->user()->id;
        abort_if(! $own && ! $this->school->isOffice($request->user()), 404);
        abort_if($own && ! $this->school->isOffice($request->user()) && $payslip->run->status === 'draft', 404);
        $t = $this->school->tenant();

        return response()->json($this->slipRow($payslip) + [
            'period' => $payslip->run->period, 'run_status' => $payslip->run->status, 'paid_on' => $payslip->run->paid_on?->toDateString(), 'currency' => $payslip->run->currency,
            'institute' => ['name' => $t->name, 'logo' => data_get($t->settings, 'logo_url'), 'address' => data_get($t->settings, 'address')],
        ]);
    }

    // ── helpers ──────────────────────────────────────────────────────

    protected function compute(Payslip $slip, Employee $e, string $period, ?float $unpaidOverride = null): void
    {
        $start = CarbonImmutable::createFromFormat('Y-m-d', $period.'-01')->startOfDay();
        $end = $start->endOfMonth();

        if ($unpaidOverride === null) {
            $absent = StaffAttendance::where('employee_id', $e->id)->whereBetween('date', [$start, $end])->where('status', 'absent')->count();
            $half = StaffAttendance::where('employee_id', $e->id)->whereBetween('date', [$start, $end])->where('status', 'half_day')->count();
            $unpaidLeave = StaffLeave::where('employee_id', $e->id)->where('status', 'approved')->where('type', 'unpaid')
                ->whereDate('from_date', '<=', $end)->whereDate('to_date', '>=', $start)->get()
                ->sum(fn ($l) => CarbonImmutable::parse(max($l->from_date->toDateString(), $start->toDateString()))->diffInDays(CarbonImmutable::parse(min($l->to_date->toDateString(), $end->toDateString()))) + 1);
            $unpaid = $absent + $half * 0.5 + $unpaidLeave;
        } else {
            $unpaid = $unpaidOverride;
        }

        $allowances = array_values(array_filter($e->allowances ?? [], fn ($a) => ($a['amount'] ?? 0) > 0));
        $deductions = array_values(array_filter($e->deductions ?? [], fn ($a) => ($a['amount'] ?? 0) > 0));
        $basic = round($e->base_salary, 2);
        $unpaidDeduction = round(min($basic, $basic / 30 * $unpaid), 2);
        $gross = round($basic + array_sum(array_column($allowances, 'amount')) + (float) $slip->bonus, 2);
        $totalDeductions = round(array_sum(array_column($deductions, 'amount')) + $unpaidDeduction, 2);

        $slip->fill([
            'basic' => $basic, 'allowances' => $allowances, 'deductions' => $deductions,
            'unpaid_days' => $unpaid, 'unpaid_deduction' => $unpaidDeduction,
            'gross' => $gross, 'total_deductions' => $totalDeductions, 'net' => max(0, round($gross - $totalDeductions, 2)),
        ]);
    }

    protected function totals(PayrollRun $run): void
    {
        $slips = Payslip::where('payroll_run_id', $run->id);
        $run->forceFill(['gross' => (clone $slips)->sum('gross'), 'deductions' => (clone $slips)->sum('total_deductions'), 'net' => (clone $slips)->sum('net')])->save();
    }

    protected function createLeave(array $data, string $status, User $by): StaffLeave
    {
        $days = CarbonImmutable::parse($data['from_date'])->diffInDays(CarbonImmutable::parse($data['to_date'])) + 1;
        $leave = new StaffLeave($data + ['days' => $days]);
        $leave->status = $status;
        if ($status === 'approved') {
            $leave->reviewed_by = $by->id;
            $leave->reviewed_at = now();
        }
        DB::transaction(function () use ($leave, $status, $by) {
            $leave->save();
            if ($status === 'approved') {
                $this->markLeave($leave, $by);
            }
        });

        return $leave->load('employee');
    }

    protected function markLeave(StaffLeave $leave, User $by): void
    {
        foreach (CarbonPeriod::create($leave->from_date, $leave->to_date) as $day) {
            if ($day->isAfter(now()->addDays(120))) {
                break;
            }
            $row = StaffAttendance::where('employee_id', $leave->employee_id)->whereDate('date', $day->toDateString())->first()
                ?? new StaffAttendance(['employee_id' => $leave->employee_id, 'date' => $day->toDateString()]);
            if ($row->exists && in_array($row->status, ['present', 'late'], true)) {
                continue;
            }
            // Unpaid leave counts against pay through the leave record itself, not as an absence.
            $row->status = 'leave';
            $row->note = ucfirst($leave->type).' leave';
            $row->marked_by = $by->id;
            $row->save();
        }
    }

    protected function leaveRules(): array
    {
        return [
            'type' => ['required', Rule::in(self::LEAVE_TYPES)],
            'from_date' => ['required', 'date'],
            'to_date' => ['required', 'date', 'after_or_equal:from_date', 'before:'.now()->addYear()->toDateString()],
            'reason' => ['nullable', 'string', 'max:1000'],
        ];
    }

    protected function employeeRules(Request $request, ?Employee $e = null): array
    {
        $tenantId = $request->user()->tenant_id;
        $req = $e ? 'sometimes' : 'required';

        return [
            'name' => [$req, 'string', 'max:120'],
            'user_id' => ['nullable', 'integer', Rule::exists('users', 'id')->where('tenant_id', $tenantId), Rule::unique('employees', 'user_id')->ignore($e?->id)],
            'employee_no' => ['nullable', 'string', 'max:30', Rule::unique('employees')->where('tenant_id', $tenantId)->ignore($e?->id)],
            'email' => ['nullable', 'email', 'max:160'],
            'phone' => ['nullable', 'string', 'max:40'],
            'designation' => ['nullable', 'string', 'max:80'],
            'department' => ['nullable', 'string', 'max:80'],
            'employment_type' => ['sometimes', Rule::in(['full_time', 'part_time', 'contract', 'visiting'])],
            'joined_on' => ['nullable', 'date'],
            'base_salary' => ['sometimes', 'numeric', 'min:0', 'max:99999999'],
            'allowances' => ['nullable', 'array', 'max:15'],
            'allowances.*.name' => ['required', 'string', 'max:60'],
            'allowances.*.amount' => ['required', 'numeric', 'min:0'],
            'deductions' => ['nullable', 'array', 'max:15'],
            'deductions.*.name' => ['required', 'string', 'max:60'],
            'deductions.*.amount' => ['required', 'numeric', 'min:0'],
            'annual_leave_days' => ['sometimes', 'integer', 'min:0', 'max:60'],
            'bank_name' => ['nullable', 'string', 'max:80'],
            'bank_account' => ['nullable', 'string', 'max:60'],
            'qualifications' => ['nullable', 'string', 'max:3000'],
            'notes' => ['nullable', 'string', 'max:3000'],
        ];
    }

    protected function nextNo(): string
    {
        $last = Employee::where('employee_no', 'like', 'EMP-%')->orderByDesc(DB::raw('LENGTH(employee_no)'))->orderByDesc('employee_no')->value('employee_no');
        $n = $last ? ((int) substr($last, 4)) + 1 : 1;

        return 'EMP-'.str_pad((string) $n, 4, '0', STR_PAD_LEFT);
    }

    protected function employeeRow(Employee $e, bool $full = true): array
    {
        return [
            'id' => $e->id, 'user_id' => $e->user_id, 'employee_no' => $e->employee_no, 'name' => $e->name, 'email' => $e->email, 'phone' => $e->phone,
            'designation' => $e->designation, 'department' => $e->department, 'employment_type' => $e->employment_type,
            'joined_on' => $e->joined_on?->toDateString(), 'left_on' => $e->left_on?->toDateString(), 'status' => $e->status,
            'base_salary' => $e->base_salary, 'allowances' => $e->allowances ?? [], 'deductions' => $e->deductions ?? [],
            'annual_leave_days' => $e->annual_leave_days,
            'bank_name' => $full ? $e->bank_name : null, 'bank_account' => $full ? $e->bank_account : null,
            'qualifications' => $e->qualifications, 'notes' => $full ? $e->notes : null,
        ];
    }

    protected function leaveRow(StaffLeave $l): array
    {
        return [
            'id' => $l->id, 'employee' => $l->employee?->only('id', 'name', 'designation'), 'type' => $l->type,
            'from_date' => $l->from_date->toDateString(), 'to_date' => $l->to_date->toDateString(), 'days' => $l->days,
            'reason' => $l->reason, 'status' => $l->status, 'created_at' => $l->created_at?->toIso8601String(),
        ];
    }

    protected function runRow(PayrollRun $r): array
    {
        return ['id' => $r->id, 'period' => $r->period, 'status' => $r->status, 'gross' => $r->gross, 'deductions' => $r->deductions, 'net' => $r->net,
            'currency' => $r->currency, 'paid_on' => $r->paid_on?->toDateString(), 'payslips_count' => $r->payslips_count ?? null];
    }

    protected function slipRow(Payslip $p): array
    {
        return [
            'id' => $p->id, 'employee' => $p->employee ? ['id' => $p->employee->id, 'name' => $p->employee->name, 'employee_no' => $p->employee->employee_no, 'designation' => $p->employee->designation, 'department' => $p->employee->department] : null,
            'basic' => $p->basic, 'allowances' => $p->allowances ?? [], 'deductions' => $p->deductions ?? [], 'bonus' => $p->bonus,
            'unpaid_days' => $p->unpaid_days, 'unpaid_deduction' => $p->unpaid_deduction,
            'gross' => $p->gross, 'total_deductions' => $p->total_deductions, 'net' => $p->net, 'note' => $p->note,
        ];
    }
}

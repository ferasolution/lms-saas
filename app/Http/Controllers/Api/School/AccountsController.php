<?php

namespace App\Http\Controllers\Api\School;

use App\Http\Controllers\Controller;
use App\Models\ActivityLog;
use App\Models\FeePayment;
use App\Models\LedgerEntry;
use App\Models\PayrollRun;
use App\Services\Fees;
use App\Support\Csv;
use Carbon\CarbonImmutable;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;
use Symfony\Component\HttpFoundation\StreamedResponse;

/**
 * Accounts: manual income and expense entries, combined with fee collections
 * and paid payroll into an income statement and monthly cash view.
 */
class AccountsController extends Controller
{
    public const INCOME = ['Donations', 'Grants', 'Events', 'Canteen', 'Uniform & books', 'Transport', 'Rent received', 'Other income'];

    public const EXPENSE = ['Rent', 'Utilities', 'Maintenance', 'Supplies', 'Equipment', 'Transport', 'Marketing', 'Software', 'Professional fees', 'Taxes', 'Other expense'];

    public function __construct(protected Fees $fees) {}

    public function summary(Request $request): JsonResponse
    {
        $from = ($request->date('from') ?? now()->startOfYear())->toDateString();
        $to = ($request->date('to') ?? now()->endOfMonth())->toDateString();

        $fees = (float) FeePayment::where('status', 'confirmed')->whereBetween('paid_on', [$from, $to])->sum('amount');
        $payroll = PayrollRun::where('status', 'paid')->whereBetween('paid_on', [$from, $to])->sum('net');
        $income = LedgerEntry::where('type', 'income')->whereBetween('date', [$from, $to])->selectRaw('category, SUM(amount) as total')->groupBy('category')->pluck('total', 'category');
        $expense = LedgerEntry::where('type', 'expense')->whereBetween('date', [$from, $to])->selectRaw('category, SUM(amount) as total')->groupBy('category')->pluck('total', 'category');

        $incomeLines = collect(['Student fees' => $fees])->merge($income)->map(fn ($v) => round((float) $v, 2))->filter(fn ($v) => $v > 0)->sortDesc();
        $expenseLines = collect(['Salaries' => (float) $payroll])->merge($expense)->map(fn ($v) => round((float) $v, 2))->filter(fn ($v) => $v > 0)->sortDesc();

        // Last 12 months, income vs expense.
        $months = [];
        $cursor = CarbonImmutable::parse($to)->startOfMonth()->subMonths(11);
        for ($i = 0; $i < 12; $i++, $cursor = $cursor->addMonth()) {
            [$a, $b] = [$cursor->toDateString(), $cursor->endOfMonth()->toDateString()];
            $in = (float) FeePayment::where('status', 'confirmed')->whereBetween('paid_on', [$a, $b])->sum('amount') + (float) LedgerEntry::where('type', 'income')->whereBetween('date', [$a, $b])->sum('amount');
            $out = (float) PayrollRun::where('status', 'paid')->whereBetween('paid_on', [$a, $b])->sum('net') + (float) LedgerEntry::where('type', 'expense')->whereBetween('date', [$a, $b])->sum('amount');
            $months[] = ['month' => $cursor->format('Y-m'), 'income' => round($in, 2), 'expense' => round($out, 2)];
        }

        return response()->json([
            'currency' => $this->fees->currency(),
            'range' => ['from' => $from, 'to' => $to],
            'income' => ['total' => round($incomeLines->sum(), 2), 'lines' => $incomeLines],
            'expense' => ['total' => round($expenseLines->sum(), 2), 'lines' => $expenseLines],
            'net' => round($incomeLines->sum() - $expenseLines->sum(), 2),
            'months' => $months,
            'categories' => ['income' => self::INCOME, 'expense' => self::EXPENSE],
        ]);
    }

    public function index(Request $request): JsonResponse
    {
        $rows = LedgerEntry::query()
            ->when($request->filled('type'), fn ($q) => $q->where('type', $request->string('type')))
            ->when($request->filled('category'), fn ($q) => $q->where('category', $request->string('category')))
            ->when($request->filled('from'), fn ($q) => $q->whereDate('date', '>=', $request->date('from')))
            ->when($request->filled('to'), fn ($q) => $q->whereDate('date', '<=', $request->date('to')))
            ->orderByDesc('date')->orderByDesc('id')->limit(500)->get();

        return response()->json(['data' => $rows->map(fn ($e) => $this->row($e)), 'currency' => $this->fees->currency()]);
    }

    public function store(Request $request): JsonResponse
    {
        $e = new LedgerEntry($request->validate($this->rules()));
        $e->created_by = $request->user()->id;
        $e->save();
        ActivityLog::record('accounts.entry', ucfirst($e->type)." {$this->fees->money($e->amount)} · {$e->category}");

        return response()->json($this->row($e), 201);
    }

    public function update(Request $request, LedgerEntry $entry): JsonResponse
    {
        $entry->update($request->validate($this->rules(true)));
        ActivityLog::record('accounts.entry_updated', "Edited {$entry->type} entry #{$entry->id}");

        return response()->json($this->row($entry));
    }

    public function destroy(LedgerEntry $entry): JsonResponse
    {
        ActivityLog::record('accounts.entry_deleted', "Deleted {$entry->type} {$this->fees->money($entry->amount)} · {$entry->category}");
        $entry->delete();

        return response()->json(['ok' => true]);
    }

    public function export(Request $request): StreamedResponse
    {
        $from = ($request->date('from') ?? now()->startOfYear())->toDateString();
        $to = ($request->date('to') ?? now()->endOfMonth())->toDateString();
        $rows = collect();
        foreach (FeePayment::with(['student', 'invoice'])->where('status', 'confirmed')->whereBetween('paid_on', [$from, $to])->get() as $p) {
            $rows->push([$p->paid_on->toDateString(), 'income', 'Student fees', $p->amount, $p->method, $p->student?->name, $p->receipt_no, $p->invoice?->number]);
        }
        foreach (PayrollRun::where('status', 'paid')->whereBetween('paid_on', [$from, $to])->get() as $r) {
            $rows->push([$r->paid_on->toDateString(), 'expense', 'Salaries', $r->net, 'bank', 'Staff', null, "Payroll {$r->period}"]);
        }
        foreach (LedgerEntry::whereBetween('date', [$from, $to])->get() as $e) {
            $rows->push([$e->date->toDateString(), $e->type, $e->category, $e->amount, $e->method, $e->party, $e->reference, $e->description]);
        }

        return Csv::download("accounts-{$from}-to-{$to}.csv", ['Date', 'Type', 'Category', 'Amount', 'Method', 'Party', 'Reference', 'Description'], $rows->sortBy(0)->values());
    }

    protected function rules(bool $partial = false): array
    {
        $req = $partial ? 'sometimes' : 'required';

        return [
            'type' => [$req, Rule::in(['income', 'expense'])],
            'category' => [$req, 'string', 'max:60'],
            'date' => [$req, 'date'],
            'amount' => [$req, 'numeric', 'min:0.01', 'max:999999999'],
            'method' => ['nullable', Rule::in(Fees::METHODS)],
            'party' => ['nullable', 'string', 'max:120'],
            'reference' => ['nullable', 'string', 'max:120'],
            'description' => ['nullable', 'string', 'max:500'],
            'attachment' => ['nullable', 'string', 'max:500', 'starts_with:/storage/,https://'],
        ];
    }

    protected function row(LedgerEntry $e): array
    {
        return ['id' => $e->id, 'type' => $e->type, 'category' => $e->category, 'date' => $e->date->toDateString(), 'amount' => $e->amount,
            'method' => $e->method, 'party' => $e->party, 'reference' => $e->reference, 'description' => $e->description, 'attachment' => $e->attachment];
    }
}

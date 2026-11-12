<?php

namespace App\Http\Controllers\Api\School;

use App\Http\Controllers\Controller;
use App\Models\ActivityLog;
use App\Models\FeeDiscount;
use App\Models\FeeHead;
use App\Models\FeeInvoice;
use App\Models\FeePayment;
use App\Models\FeePlan;
use App\Models\SchoolClass;
use App\Models\StudentProfile;
use App\Models\User;
use App\Services\Fees;
use App\Services\Notifier;
use App\Services\School;
use App\Support\Csv;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\Rule;
use Symfony\Component\HttpFoundation\StreamedResponse;

/**
 * Student fees: setup, invoices, payments and receipts, collection reports,
 * and the parent side (see invoices, report a payment).
 */
class FeeController extends Controller
{
    public function __construct(protected Fees $fees, protected School $school) {}

    // ── Setup ────────────────────────────────────────────────────────

    public function setup(): JsonResponse
    {
        $plans = FeePlan::get()->groupBy('school_class_id');

        return response()->json([
            'currency' => $this->fees->currency(),
            'heads' => FeeHead::orderBy('name')->get(['id', 'name', 'frequency', 'is_active']),
            'classes' => SchoolClass::orderBy('sort')->orderBy('name')->get(['id', 'name'])->map(fn ($c) => [
                'id' => $c->id, 'name' => $c->name,
                'plans' => ($plans[$c->id] ?? collect())->map(fn ($p) => ['fee_head_id' => $p->fee_head_id, 'amount' => $p->amount])->values(),
            ]),
            'methods' => Fees::METHODS,
        ]);
    }

    public function storeHead(Request $request): JsonResponse
    {
        $data = $request->validate([
            'name' => ['required', 'string', 'max:80', Rule::unique('fee_heads')->where('tenant_id', $request->user()->tenant_id)],
            'frequency' => ['required', Rule::in(['monthly', 'termly', 'annual', 'once'])],
        ]);

        return response()->json(FeeHead::create($data), 201);
    }

    public function updateHead(Request $request, FeeHead $head): JsonResponse
    {
        $data = $request->validate([
            'name' => ['sometimes', 'string', 'max:80', Rule::unique('fee_heads')->where('tenant_id', $request->user()->tenant_id)->ignore($head->id)],
            'frequency' => ['sometimes', Rule::in(['monthly', 'termly', 'annual', 'once'])],
            'is_active' => ['sometimes', 'boolean'],
        ]);
        $head->update($data);

        return response()->json($head->fresh());
    }

    public function destroyHead(FeeHead $head): JsonResponse
    {
        abort_if(DB::table('fee_invoice_items')->where('fee_head_id', $head->id)->exists(), 422,
            'This fee is on existing invoices. Turn it off instead of deleting it.');
        $head->delete();

        return response()->json(['ok' => true]);
    }

    /** Replace the fee amounts for a class. */
    public function savePlan(Request $request, SchoolClass $class): JsonResponse
    {
        $data = $request->validate([
            'plans' => ['present', 'array', 'max:40'],
            'plans.*.fee_head_id' => ['required', 'integer', 'distinct', Rule::exists('fee_heads', 'id')->where('tenant_id', $request->user()->tenant_id)],
            'plans.*.amount' => ['required', 'numeric', 'min:0', 'max:9999999'],
        ]);
        DB::transaction(function () use ($class, $data) {
            FeePlan::where('school_class_id', $class->id)->delete();
            foreach ($data['plans'] as $row) {
                FeePlan::create(['school_class_id' => $class->id, 'fee_head_id' => $row['fee_head_id'], 'amount' => $row['amount']]);
            }
        });

        return response()->json(['ok' => true]);
    }

    public function discounts(Request $request): JsonResponse
    {
        $rows = FeeDiscount::with(['head'])
            ->when($request->filled('student_id'), fn ($q) => $q->where('student_id', $request->integer('student_id')))
            ->latest('id')->limit(300)->get();
        $names = User::whereIn('id', $rows->pluck('student_id'))->pluck('name', 'id');

        return response()->json(['data' => $rows->map(fn ($d) => [
            'id' => $d->id, 'student' => ['id' => $d->student_id, 'name' => $names[$d->student_id] ?? null],
            'name' => $d->name, 'type' => $d->type, 'value' => $d->value, 'head' => $d->head?->only('id', 'name'),
        ])]);
    }

    public function storeDiscount(Request $request): JsonResponse
    {
        $tenantId = $request->user()->tenant_id;
        $data = $request->validate([
            'student_id' => ['required', 'integer', Rule::exists('student_profiles', 'user_id')->where('tenant_id', $tenantId)],
            'fee_head_id' => ['nullable', 'integer', Rule::exists('fee_heads', 'id')->where('tenant_id', $tenantId)],
            'name' => ['required', 'string', 'max:80'],
            'type' => ['required', Rule::in(['percent', 'fixed'])],
            'value' => ['required', 'numeric', 'min:0.01', $request->input('type') === 'percent' ? 'max:100' : 'max:9999999'],
        ]);

        return response()->json(FeeDiscount::create($data), 201);
    }

    public function destroyDiscount(FeeDiscount $discount): JsonResponse
    {
        $discount->delete();

        return response()->json(['ok' => true]);
    }

    // ── Invoices ─────────────────────────────────────────────────────

    public function generate(Request $request): JsonResponse
    {
        $tenantId = $request->user()->tenant_id;
        $data = $request->validate([
            'period' => ['required', 'string', 'max:60'],
            'issued_on' => ['nullable', 'date'],
            'due_on' => ['required', 'date'],
            'section_ids' => ['nullable', 'array'],
            'section_ids.*' => ['integer', Rule::exists('class_sections', 'id')->where('tenant_id', $tenantId)],
            'head_ids' => ['nullable', 'array'],
            'head_ids.*' => ['integer', Rule::exists('fee_heads', 'id')->where('tenant_id', $tenantId)],
        ]);

        return response()->json($this->fees->generate(
            $data['section_ids'] ?? [], $data['head_ids'] ?? [], $data['period'],
            $data['issued_on'] ?? now()->toDateString(), $data['due_on'], $request->user()->id,
        ), 201);
    }

    /** One-off invoice for a single student. */
    public function store(Request $request): JsonResponse
    {
        $tenantId = $request->user()->tenant_id;
        $data = $request->validate([
            'student_id' => ['required', 'integer', Rule::exists('student_profiles', 'user_id')->where('tenant_id', $tenantId)],
            'period' => ['required', 'string', 'max:60'],
            'due_on' => ['required', 'date'],
            'note' => ['nullable', 'string', 'max:500'],
            'items' => ['required', 'array', 'min:1', 'max:30'],
            'items.*.description' => ['required', 'string', 'max:160'],
            'items.*.amount' => ['required', 'numeric', 'min:0', 'max:9999999'],
            'items.*.discount' => ['nullable', 'numeric', 'min:0'],
            'items.*.fee_head_id' => ['nullable', 'integer', Rule::exists('fee_heads', 'id')->where('tenant_id', $tenantId)],
        ]);
        $profile = StudentProfile::where('user_id', $data['student_id'])->first();
        $lines = array_map(fn ($i) => [
            'fee_head_id' => $i['fee_head_id'] ?? null, 'description' => $i['description'],
            'amount' => round($i['amount'], 2), 'discount' => round(min($i['discount'] ?? 0, $i['amount']), 2),
        ], $data['items']);

        $invoice = DB::transaction(fn () => $this->fees->createInvoice($data['student_id'], $profile?->class_section_id, $data['period'],
            now()->toDateString(), $data['due_on'], $lines, $data['note'] ?? null, $request->user()->id));
        $this->school->notify($this->school->guardianIds([$invoice->student_id]), 'fee_invoice', "Fee invoice: {$invoice->period}",
            $this->fees->money($invoice->total).' due '.$invoice->due_on->format('M j'), '/fees');

        return response()->json($this->invoiceRow($invoice->load(['student', 'section.schoolClass'])), 201);
    }

    public function index(Request $request): JsonResponse
    {
        $today = now()->toDateString();
        $q = FeeInvoice::with(['student', 'section.schoolClass'])
            ->when($request->filled('status'), function ($q) use ($request, $today) {
                match ($request->input('status')) {
                    'overdue' => $q->whereIn('status', ['unpaid', 'partial'])->whereDate('due_on', '<', $today),
                    'open' => $q->whereIn('status', ['unpaid', 'partial']),
                    default => $q->where('status', $request->input('status')),
                };
            })
            ->when($request->filled('section_id'), fn ($q) => $q->where('class_section_id', $request->integer('section_id')))
            ->when($request->filled('student_id'), fn ($q) => $q->where('student_id', $request->integer('student_id')))
            ->when($request->filled('period'), fn ($q) => $q->where('period', $request->string('period')))
            ->when($request->filled('search'), function ($q) use ($request) {
                $term = '%'.$request->string('search').'%';
                $q->where(fn ($q) => $q->where('number', 'like', $term)->orWhereIn('student_id', User::where('name', 'like', $term)->pluck('id')));
            })
            ->orderByDesc('issued_on')->orderByDesc('id');

        $page = $q->paginate(min($request->integer('per_page', 50) ?: 50, 200));

        return response()->json([
            'data' => $page->getCollection()->map(fn ($i) => $this->invoiceRow($i)),
            'meta' => ['total' => $page->total(), 'current_page' => $page->currentPage(), 'last_page' => $page->lastPage()],
            'periods' => FeeInvoice::select('period')->distinct()->orderByDesc('period')->limit(24)->pluck('period'),
        ]);
    }

    public function show(Request $request, FeeInvoice $invoice): JsonResponse
    {
        $this->authorizeInvoice($request->user(), $invoice);
        $invoice->load(['student', 'section.schoolClass', 'items', 'payments.receiver', 'payments.submitter']);
        $profile = StudentProfile::where('user_id', $invoice->student_id)->first();
        $t = $this->school->tenant();

        return response()->json($this->invoiceRow($invoice) + [
            'admission_no' => $profile?->admission_no,
            'items' => $invoice->items->map(fn ($i) => ['description' => $i->description, 'amount' => $i->amount, 'discount' => $i->discount]),
            'payments' => $invoice->payments->sortByDesc('id')->values()->map(fn ($p) => $this->paymentRow($p)),
            'institute' => ['name' => $t->name, 'logo' => data_get($t->settings, 'logo_url'), 'address' => data_get($t->settings, 'address')],
            'pay_to' => data_get($t->settings, 'payments', []),
        ]);
    }

    public function update(Request $request, FeeInvoice $invoice): JsonResponse
    {
        $data = $request->validate([
            'due_on' => ['sometimes', 'date'],
            'late_fee' => ['sometimes', 'numeric', 'min:0', 'max:9999999'],
            'note' => ['nullable', 'string', 'max:500'],
            'status' => ['sometimes', Rule::in(['cancelled'])],
        ]);
        abort_if(isset($data['status']) && $invoice->paid > 0, 422, 'This invoice has payments. Refund or remove them before cancelling.');

        if (array_key_exists('late_fee', $data)) {
            $this->fees->totalWith($invoice, (float) $data['late_fee']);
        }
        $invoice->fill(array_intersect_key($data, array_flip(['due_on', 'note'])));
        if (isset($data['status'])) {
            $invoice->status = 'cancelled';
        }
        $invoice->save();
        $this->fees->refresh($invoice);
        ActivityLog::record('fees.invoice_updated', "Invoice {$invoice->number} updated", array_keys($data));

        return response()->json($this->invoiceRow($invoice->load(['student', 'section.schoolClass'])));
    }

    // ── Payments ─────────────────────────────────────────────────────

    /** The office records money received (cash, bank, card…). */
    public function recordPayment(Request $request, FeeInvoice $invoice): JsonResponse
    {
        abort_if($invoice->status === 'cancelled', 422, 'This invoice is cancelled.');
        $data = $request->validate([
            'amount' => ['required', 'numeric', 'min:0.01', 'max:'.max(0.01, $invoice->balance())],
            'method' => ['required', Rule::in(Fees::METHODS)],
            'reference' => ['nullable', 'string', 'max:120'],
            'paid_on' => ['nullable', 'date', 'before_or_equal:today'],
            'note' => ['nullable', 'string', 'max:500'],
        ], ['amount.max' => 'That is more than the balance due.']);

        $payment = DB::transaction(function () use ($invoice, $data, $request) {
            $p = new FeePayment($data + ['fee_invoice_id' => $invoice->id, 'student_id' => $invoice->student_id, 'paid_on' => $data['paid_on'] ?? now()->toDateString()]);
            $p->status = 'confirmed';
            $p->received_by = $request->user()->id;
            $p->receipt_no = $this->fees->nextNumber('RCT');
            $p->save();
            $this->fees->refresh($invoice);

            return $p;
        });

        $this->notifyReceived($invoice, $payment);
        ActivityLog::record('fees.payment', "Received {$this->fees->money($payment->amount)} for {$invoice->number}");

        return response()->json($this->paymentRow($payment->load('receiver')), 201);
    }

    public function payments(Request $request): JsonResponse
    {
        $rows = FeePayment::with(['invoice', 'student', 'receiver', 'submitter'])
            ->when($request->filled('status'), fn ($q) => $q->where('status', $request->string('status')))
            ->when($request->filled('from'), fn ($q) => $q->whereDate('paid_on', '>=', $request->date('from')))
            ->when($request->filled('to'), fn ($q) => $q->whereDate('paid_on', '<=', $request->date('to')))
            ->latest('id')->limit(300)->get();

        return response()->json(['data' => $rows->map(fn ($p) => $this->paymentRow($p) + [
            'invoice' => ['id' => $p->fee_invoice_id, 'number' => $p->invoice?->number, 'period' => $p->invoice?->period, 'balance' => $p->invoice?->balance()],
            'student' => $p->student?->only('id', 'name'),
        ])]);
    }

    /** Confirm or reject a payment a parent reported. */
    public function reviewPayment(Request $request, FeePayment $payment): JsonResponse
    {
        abort_if($payment->status !== 'pending', 422, 'This payment was already reviewed.');
        $data = $request->validate(['status' => ['required', Rule::in(['confirmed', 'rejected'])], 'note' => ['nullable', 'string', 'max:500']]);
        $invoice = FeeInvoice::findOrFail($payment->fee_invoice_id);

        DB::transaction(function () use ($payment, $data, $request, $invoice) {
            $payment->status = $data['status'];
            $payment->received_by = $request->user()->id;
            if (! empty($data['note'])) {
                $payment->note = $data['note'];
            }
            if ($data['status'] === 'confirmed') {
                $payment->receipt_no = $this->fees->nextNumber('RCT');
            }
            $payment->save();
            $this->fees->refresh($invoice);
        });

        if ($data['status'] === 'confirmed') {
            $this->notifyReceived($invoice, $payment);
        } else {
            $this->school->notify(array_filter([$payment->submitted_by]), 'fee_payment_rejected', "We couldn’t find your payment for {$invoice->number}",
                $data['note'] ?? 'Please check the reference and try again, or contact the school office.', '/fees');
        }

        return response()->json($this->paymentRow($payment->load('receiver')));
    }

    /** Reminders to parents of overdue invoices (at most once every 3 days per invoice). */
    public function remind(): JsonResponse
    {
        $due = FeeInvoice::with('student')->whereIn('status', ['unpaid', 'partial'])->whereDate('due_on', '<', now()->toDateString())
            ->where(fn ($q) => $q->whereNull('reminded_at')->orWhere('reminded_at', '<', now()->subDays(3)))->get();
        foreach ($due as $inv) {
            $this->school->notify($this->school->guardianIds([$inv->student_id]), 'fee_overdue', "Fee overdue: {$inv->student?->name}",
                $this->fees->money($inv->balance())." for {$inv->period} was due {$inv->due_on->format('M j')}", '/fees');
            $inv->forceFill(['reminded_at' => now()])->save();
        }

        return response()->json(['sent' => $due->count()]);
    }

    // ── Reports ──────────────────────────────────────────────────────

    public function summary(Request $request): JsonResponse
    {
        $from = $request->date('from') ?? now()->startOfMonth();
        $to = $request->date('to') ?? now()->endOfMonth();
        $today = now()->toDateString();

        $collected = FeePayment::where('status', 'confirmed')->whereBetween('paid_on', [$from->toDateString(), $to->toDateString()]);
        $open = FeeInvoice::whereIn('status', ['unpaid', 'partial']);

        $defaulters = FeeInvoice::with(['student', 'section.schoolClass'])->whereIn('status', ['unpaid', 'partial'])->whereDate('due_on', '<', $today)
            ->get()->groupBy('student_id')->map(fn ($invs) => [
                'student' => $invs->first()->student?->only('id', 'name'),
                'section' => $invs->first()->section?->label(),
                'invoices' => $invs->count(),
                'balance' => round($invs->sum(fn ($i) => $i->balance()), 2),
                'oldest_due' => $invs->min('due_on')?->toDateString(),
            ])->sortByDesc('balance')->values();

        $byDay = (clone $collected)->selectRaw('paid_on as day, SUM(amount) as total')->groupBy('paid_on')->orderBy('paid_on')->get()
            ->map(fn ($r) => ['day' => substr((string) $r->day, 0, 10), 'total' => round((float) $r->total, 2)]);

        return response()->json([
            'currency' => $this->fees->currency(),
            'range' => ['from' => $from->toDateString(), 'to' => $to->toDateString()],
            'billed' => round((float) FeeInvoice::where('status', '!=', 'cancelled')->whereBetween('issued_on', [$from->toDateString(), $to->toDateString()])->sum('total'), 2),
            'collected' => round((float) (clone $collected)->sum('amount'), 2),
            'outstanding' => round((float) (clone $open)->sum(DB::raw('total - paid')), 2),
            'overdue' => round((float) (clone $open)->whereDate('due_on', '<', $today)->sum(DB::raw('total - paid')), 2),
            'pending_reports' => FeePayment::where('status', 'pending')->count(),
            'by_method' => (clone $collected)->selectRaw('method, SUM(amount) as total')->groupBy('method')->pluck('total', 'method')->map(fn ($v) => round((float) $v, 2)),
            'by_day' => $byDay,
            'defaulters' => $defaulters->take(100),
        ]);
    }

    public function exportInvoices(Request $request): StreamedResponse
    {
        $rows = FeeInvoice::with(['student', 'section.schoolClass'])
            ->when($request->filled('period'), fn ($q) => $q->where('period', $request->string('period')))
            ->orderBy('number')->get();

        return Csv::download('fee-invoices.csv',
            ['Invoice', 'Student', 'Class', 'Period', 'Issued', 'Due', 'Subtotal', 'Discount', 'Late fee', 'Total', 'Paid', 'Balance', 'Status', 'Currency'],
            $rows->map(fn ($i) => [$i->number, $i->student?->name, $i->section?->label(), $i->period, $i->issued_on->toDateString(), $i->due_on->toDateString(),
                $i->subtotal, $i->discount, $i->late_fee, $i->total, $i->paid, $i->balance(), $i->isOverdue() ? 'overdue' : $i->status, $i->currency]));
    }

    public function exportPayments(Request $request): StreamedResponse
    {
        $rows = FeePayment::with(['invoice', 'student', 'receiver'])->where('status', 'confirmed')
            ->when($request->filled('from'), fn ($q) => $q->whereDate('paid_on', '>=', $request->date('from')))
            ->when($request->filled('to'), fn ($q) => $q->whereDate('paid_on', '<=', $request->date('to')))
            ->orderBy('paid_on')->get();

        return Csv::download('fee-collections.csv', ['Receipt', 'Date', 'Student', 'Invoice', 'Amount', 'Method', 'Reference', 'Received by'],
            $rows->map(fn ($p) => [$p->receipt_no, $p->paid_on->toDateString(), $p->student?->name, $p->invoice?->number, $p->amount, $p->method, $p->reference, $p->receiver?->name]));
    }

    // ── Families ─────────────────────────────────────────────────────

    public function family(Request $request): JsonResponse
    {
        $ids = $this->school->familyStudentIds($request->user());
        $invoices = FeeInvoice::with(['student', 'section.schoolClass', 'payments'])->whereIn('student_id', $ids ?: [0])
            ->where('status', '!=', 'cancelled')->orderByDesc('issued_on')->orderByDesc('id')->limit(100)->get();

        return response()->json([
            'currency' => $this->fees->currency(),
            'outstanding' => round($invoices->whereIn('status', ['unpaid', 'partial'])->sum(fn ($i) => $i->balance()), 2),
            'pay_to' => data_get($this->school->tenant()->settings, 'payments', []),
            'data' => $invoices->map(fn ($i) => $this->invoiceRow($i) + [
                'payments' => $i->payments->sortByDesc('id')->values()->map(fn ($p) => $this->paymentRow($p)),
            ]),
        ]);
    }

    /** A parent tells the school they paid (bank transfer, card…). The office confirms it. */
    public function reportPayment(Request $request, FeeInvoice $invoice): JsonResponse
    {
        $this->authorizeInvoice($request->user(), $invoice);
        abort_if(! in_array($invoice->status, ['unpaid', 'partial'], true), 422, 'Nothing is due on this invoice.');
        abort_if(FeePayment::where('fee_invoice_id', $invoice->id)->where('status', 'pending')->exists(), 422,
            'A payment for this invoice is already waiting for the school to confirm.');
        $data = $request->validate([
            'amount' => ['required', 'numeric', 'min:0.01', 'max:'.max(0.01, $invoice->balance())],
            'method' => ['required', Rule::in(array_diff(Fees::METHODS, ['cash']))],
            'reference' => ['required', 'string', 'max:120'],
            'paid_on' => ['nullable', 'date', 'before_or_equal:today'],
            'note' => ['nullable', 'string', 'max:500'],
        ]);

        $p = new FeePayment($data + ['fee_invoice_id' => $invoice->id, 'student_id' => $invoice->student_id, 'paid_on' => $data['paid_on'] ?? now()->toDateString()]);
        $p->status = 'pending';
        $p->submitted_by = $request->user()->id;
        $p->save();

        $this->school->notify(app(Notifier::class)->roleIds($request->user()->tenant_id, School::OFFICE), 'fee_reported',
            "Fee payment to confirm: {$this->fees->money($p->amount)}", "{$invoice->number} · ref {$p->reference}", '/fees?tab=payments');

        return response()->json($this->paymentRow($p), 201);
    }

    // ── helpers ──────────────────────────────────────────────────────

    protected function authorizeInvoice(User $user, FeeInvoice $invoice): void
    {
        if ($this->school->isOffice($user)) {
            return;
        }
        abort_if(! in_array($invoice->student_id, $this->school->familyStudentIds($user), true), 404);
    }

    protected function notifyReceived(FeeInvoice $invoice, FeePayment $payment): void
    {
        $this->school->notify(array_unique(array_merge($this->school->guardianIds([$invoice->student_id]), array_filter([$payment->submitted_by]))),
            'fee_paid', "Payment received: {$this->fees->money($payment->amount)}",
            "Receipt {$payment->receipt_no} · {$invoice->number}".($invoice->balance() > 0 ? ' · balance '.$this->fees->money($invoice->balance()) : ' · paid in full'), '/fees');
    }

    protected function invoiceRow(FeeInvoice $i): array
    {
        return [
            'id' => $i->id,
            'number' => $i->number,
            'student' => $i->relationLoaded('student') ? $i->student?->only('id', 'name') : ['id' => $i->student_id],
            'section' => $i->relationLoaded('section') && $i->section ? $i->section->label() : null,
            'period' => $i->period,
            'issued_on' => $i->issued_on?->toDateString(),
            'due_on' => $i->due_on?->toDateString(),
            'subtotal' => $i->subtotal,
            'discount' => $i->discount,
            'late_fee' => $i->late_fee,
            'total' => $i->total,
            'paid' => $i->paid,
            'balance' => $i->balance(),
            'currency' => $i->currency,
            'status' => $i->status,
            'overdue' => $i->isOverdue(),
            'note' => $i->note,
        ];
    }

    protected function paymentRow(FeePayment $p): array
    {
        return [
            'id' => $p->id,
            'amount' => $p->amount,
            'method' => $p->method,
            'reference' => $p->reference,
            'paid_on' => $p->paid_on?->toDateString(),
            'status' => $p->status,
            'receipt_no' => $p->receipt_no,
            'note' => $p->note,
            'received_by' => $p->relationLoaded('receiver') ? $p->receiver?->only('id', 'name') : null,
            'submitted_by' => $p->relationLoaded('submitter') ? $p->submitter?->only('id', 'name') : null,
            'created_at' => $p->created_at?->toIso8601String(),
        ];
    }
}

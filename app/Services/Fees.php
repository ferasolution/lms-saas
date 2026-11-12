<?php

namespace App\Services;

use App\Models\ActivityLog;
use App\Models\FeeDiscount;
use App\Models\FeeInvoice;
use App\Models\FeePayment;
use App\Models\FeePlan;
use App\Models\StudentProfile;
use App\Tenancy\TenantManager;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\DB;

/**
 * Fee arithmetic in one place: building invoices from class plans and
 * discounts, numbering, and keeping paid/status in step with payments.
 */
class Fees
{
    public const METHODS = ['cash', 'bank', 'card', 'paypal', 'wise', 'cheque', 'other'];

    public function __construct(protected TenantManager $tenants, protected School $school) {}

    public function currency(): string
    {
        return data_get($this->tenants->current()->settings, 'currency', 'USD');
    }

    /** Next number like INV-2026-00042 / RCT-2026-00007, unique per institute. */
    public function nextNumber(string $prefix): string
    {
        $base = $prefix.'-'.now()->format('Y').'-';
        [$model, $col] = $prefix === 'INV' ? [FeeInvoice::class, 'number'] : [FeePayment::class, 'receipt_no'];
        $last = $model::where($col, 'like', $base.'%')->orderByDesc($col)->value($col);
        $n = $last ? ((int) substr($last, strlen($base))) + 1 : 1;

        return $base.str_pad((string) $n, 5, '0', STR_PAD_LEFT);
    }

    /**
     * Invoice lines for one student from their class plan, with discounts applied.
     *
     * @return array<int, array{fee_head_id:int, description:string, amount:float, discount:float}>
     */
    public function linesFor(StudentProfile $profile, Collection $plansByClass, array $headIds, Collection $discounts): array
    {
        $classId = $profile->section?->school_class_id;
        if (! $classId) {
            return [];
        }

        $lines = [];
        foreach ($plansByClass[$classId] ?? [] as $plan) {
            if ($headIds && ! in_array($plan->fee_head_id, $headIds, true)) {
                continue;
            }
            $discount = 0.0;
            foreach ($discounts[$profile->user_id] ?? [] as $d) {
                if ($d->fee_head_id === null || $d->fee_head_id === $plan->fee_head_id) {
                    $discount += $d->type === 'percent' ? $plan->amount * min(100, $d->value) / 100 : $d->value;
                }
            }
            $lines[] = [
                'fee_head_id' => $plan->fee_head_id,
                'description' => $plan->head?->name ?? 'Fee',
                'amount' => round($plan->amount, 2),
                'discount' => round(min($discount, $plan->amount), 2),
            ];
        }

        return $lines;
    }

    /** Create one invoice with its lines. */
    public function createInvoice(int $studentId, ?int $sectionId, string $period, string $issuedOn, string $dueOn, array $lines, ?string $note = null, ?int $by = null): FeeInvoice
    {
        $subtotal = round(array_sum(array_column($lines, 'amount')), 2);
        $discount = round(array_sum(array_column($lines, 'discount')), 2);

        $invoice = new FeeInvoice([
            'student_id' => $studentId,
            'class_section_id' => $sectionId,
            'period' => $period,
            'issued_on' => $issuedOn,
            'due_on' => $dueOn,
            'subtotal' => $subtotal,
            'discount' => $discount,
            'total' => max(0, round($subtotal - $discount, 2)),
            'currency' => $this->currency(),
            'note' => $note,
            'created_by' => $by,
        ]);
        $invoice->number = $this->nextNumber('INV');
        $invoice->status = $invoice->total <= 0 ? 'paid' : 'unpaid';
        $invoice->save();
        $invoice->items()->createMany($lines);

        return $invoice;
    }

    /** Generate invoices for many students; skips anyone already billed for the period. */
    public function generate(array $sectionIds, array $headIds, string $period, string $issuedOn, string $dueOn, ?int $by): array
    {
        $profiles = StudentProfile::with('section')->where('status', 'active')
            ->when($sectionIds, fn ($q) => $q->whereIn('class_section_id', $sectionIds), fn ($q) => $q->whereNotNull('class_section_id'))
            ->get();
        $plans = FeePlan::with('head')->whereHas('head', fn ($q) => $q->where('is_active', true))->get()->groupBy('school_class_id');
        $discounts = FeeDiscount::whereIn('student_id', $profiles->pluck('user_id'))->get()->groupBy('student_id');
        $already = FeeInvoice::where('period', $period)->where('status', '!=', 'cancelled')
            ->whereIn('student_id', $profiles->pluck('user_id'))->pluck('student_id')->flip();

        $created = [];
        $skipped = ['already_billed' => 0, 'no_fees' => 0];
        DB::transaction(function () use ($profiles, $plans, $discounts, $already, $headIds, $period, $issuedOn, $dueOn, $by, &$created, &$skipped) {
            foreach ($profiles as $p) {
                if (isset($already[$p->user_id])) {
                    $skipped['already_billed']++;
                    continue;
                }
                $lines = $this->linesFor($p, $plans, $headIds, $discounts);
                if (! $lines) {
                    $skipped['no_fees']++;
                    continue;
                }
                $created[] = $this->createInvoice($p->user_id, $p->class_section_id, $period, $issuedOn, $dueOn, $lines, null, $by);
            }
        });

        // Parents hear about their invoice.
        foreach ($created as $inv) {
            $this->school->notify($this->school->guardianIds([$inv->student_id]), 'fee_invoice',
                "Fee invoice for {$period}", $this->money($inv->total).' due '.$inv->due_on->format('M j'), '/fees');
        }

        ActivityLog::record('fees.generated', count($created)." invoices for {$period}");

        return ['created' => count($created), 'skipped' => $skipped, 'total' => round(array_sum(array_map(fn ($i) => $i->total, $created)), 2)];
    }

    /** Recompute paid/status from confirmed payments. */
    public function refresh(FeeInvoice $invoice): FeeInvoice
    {
        $paid = (float) FeePayment::where('fee_invoice_id', $invoice->id)->where('status', 'confirmed')->sum('amount');
        $invoice->paid = round($paid, 2);
        if ($invoice->status !== 'cancelled') {
            $invoice->status = $invoice->paid >= $invoice->total - 0.004 ? 'paid' : ($invoice->paid > 0 ? 'partial' : 'unpaid');
        }
        $invoice->save();

        return $invoice;
    }

    public function totalWith(FeeInvoice $invoice, float $lateFee): void
    {
        $invoice->late_fee = round($lateFee, 2);
        $invoice->total = max(0, round($invoice->subtotal - $invoice->discount + $invoice->late_fee, 2));
    }

    public function money(float $amount): string
    {
        return $this->currency().' '.number_format($amount, 2);
    }
}

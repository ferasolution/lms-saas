<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\ActivityLog;
use App\Models\Plan;
use App\Models\PlatformSetting;
use App\Models\Subscription;
use App\Services\Billing;
use App\Tenancy\TenantManager;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

/**
 * An institute's own plan: what it's on, how much it uses, and paying the
 * platform for an upgrade (approved by the platform owner).
 */
class BillingController extends Controller
{
    public function __construct(protected Billing $billing, protected TenantManager $tenants) {}

    public function show(): JsonResponse
    {
        $tenant = $this->tenants->current();
        $effective = $this->billing->effective($tenant);

        return response()->json([
            'current' => [
                'plan' => $effective['plan']?->only('id', 'name', 'slug', 'price_monthly', 'currency', 'max_students', 'max_courses', 'storage_mb'),
                'source' => $effective['source'],
                'ends_at' => $effective['ends_at'],
            ],
            'usage' => $this->billing->usage($tenant),
            'plans' => Plan::where('is_active', true)->orderBy('price_monthly')
                ->get(['id', 'name', 'slug', 'price_monthly', 'currency', 'max_students', 'max_courses', 'storage_mb']),
            'pay_to' => PlatformSetting::get('payments', (object) []),
            'history' => Subscription::with('plan')->latest()->limit(20)->get()->map(fn ($s) => [
                'id' => $s->id,
                'plan' => $s->plan?->only('name', 'slug'),
                'months' => $s->months,
                'amount' => $s->amount,
                'currency' => $s->currency,
                'status' => $s->status,
                'payment_method' => $s->gateway,
                'payment_reference' => $s->payment_reference,
                'note' => $s->note,
                'created_at' => $s->created_at,
                'ends_at' => $s->ends_at,
            ]),
        ]);
    }

    public function subscribe(Request $request): JsonResponse
    {
        $data = $request->validate([
            'plan_id' => ['required', Rule::exists('plans', 'id')->where('is_active', true)],
            'months' => ['required', 'integer', Rule::in([1, 3, 6, 12])],
            'payment_method' => ['required', Rule::in(['jazzcash', 'easypaisa', 'bank'])],
            'payment_reference' => ['required', 'string', 'max:120'],
            'note' => ['nullable', 'string', 'max:500'],
        ], [
            'payment_reference.required' => 'Enter the transaction ID so we can find your payment.',
        ]);

        $plan = Plan::findOrFail($data['plan_id']);
        abort_if((float) $plan->price_monthly <= 0, 422, 'The Free plan does not need a payment.');
        abort_if(Subscription::where('status', 'pending')->exists(), 422, 'You already have a payment waiting for approval.');

        $sub = new Subscription([
            'plan_id' => $plan->id,
            'months' => $data['months'],
            'status' => 'pending',
            'amount' => round((float) $plan->price_monthly * $data['months'], 2),
            'currency' => $plan->currency,
            'gateway' => $data['payment_method'],
            'payment_reference' => $data['payment_reference'],
            'note' => $data['note'] ?? null,
        ]);
        $sub->requested_by = $request->user()->id;
        $sub->save();

        $method = ['jazzcash' => 'JazzCash', 'easypaisa' => 'Easypaisa', 'bank' => 'bank transfer'][$data['payment_method']];
        $months = (int) $data['months'] === 1 ? '1 month' : "{$data['months']} months";
        ActivityLog::record('subscription.requested', "Requested {$plan->name} for {$months}, paid by {$method}", ['subscription_id' => $sub->id]);

        return response()->json(['id' => $sub->id, 'status' => 'pending'], 201);
    }
}

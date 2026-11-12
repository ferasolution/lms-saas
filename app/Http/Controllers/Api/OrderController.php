<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\ActivityLog;
use App\Models\Order;
use App\Services\Learning;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\Rule;

/**
 * Payment requests from students for paid courses. An admin checks the
 * transaction in their bank, PayPal or Wise account, then approves it.
 */
class OrderController extends Controller
{
    public function __construct(protected Learning $learning) {}

    public function index(Request $request): JsonResponse
    {
        $status = $request->validate(['status' => ['nullable', Rule::in(['pending', 'paid', 'failed'])]])['status'] ?? null;

        $orders = Order::with(['user', 'course' => fn ($q) => $q->withTrashed(), 'reviewer', 'coupon'])
            ->when($status, fn ($q) => $q->where('status', $status))
            ->latest()
            ->paginate(50);

        $summary = Order::query()
            ->selectRaw('status, count(*) as total, sum(total) as amount')
            ->groupBy('status')
            ->get()
            ->keyBy('status');

        return response()->json([
            'data' => collect($orders->items())->map(fn (Order $o) => $this->payload($o)),
            'meta' => ['total' => $orders->total()],
            'summary' => [
                'pending' => (int) ($summary['pending']->total ?? 0),
                'paid' => (int) ($summary['paid']->total ?? 0),
                'revenue' => (float) ($summary['paid']->amount ?? 0),
            ],
        ]);
    }

    public function approve(Request $request, Order $order): JsonResponse
    {
        abort_unless($order->status === 'pending', 422, 'Only pending payments can be approved.');

        DB::transaction(function () use ($request, $order) {
            $order->status = 'paid';
            $order->paid_at = now();
            $order->reviewed_by = $request->user()->id;
            $order->reviewed_at = now();
            $order->save();

            $order->load(['user', 'course']);
            $this->learning->enrol($order->user, $order->course);
            if ($order->coupon_id) {
                \App\Models\Coupon::whereKey($order->coupon_id)->increment('used_count');
            }
        });

        app(\App\Services\Notifier::class)->send($order->user_id, 'payment_approved', "You’re in: {$order->course?->title}",
            'Your payment was confirmed. Start learning any time.', "/courses/{$order->course_id}");

        ActivityLog::record('order.approved', "Approved {$order->currency} {$order->total} from {$order->user?->name} for “{$order->course?->title}”", ['order_id' => $order->id]);

        return response()->json($this->payload($order->load(['user', 'course', 'reviewer', 'coupon'])));
    }

    public function reject(Request $request, Order $order): JsonResponse
    {
        abort_unless($order->status === 'pending', 422, 'Only pending payments can be rejected.');
        $data = $request->validate(['note' => ['nullable', 'string', 'max:500']]);

        app(\App\Services\Notifier::class)->send($order->user_id, 'payment_rejected', 'We couldn’t confirm your payment',
            ($data['note'] ?? null) ?: 'Please check the transaction ID and send it again from the course page.', "/courses/{$order->course_id}");
        $order->status = 'failed';
        $order->note = $data['note'] ?? $order->note;
        $order->reviewed_by = $request->user()->id;
        $order->reviewed_at = now();
        $order->save();

        return response()->json($this->payload($order->load(['user', 'course', 'reviewer', 'coupon'])));
    }

    protected function payload(Order $o): array
    {
        return [
            'id' => $o->id,
            'status' => $o->status,
            'total' => $o->total,
            'discount' => (float) $o->discount,
            'coupon' => $o->coupon?->code,
            'currency' => $o->currency,
            'payment_method' => $o->gateway,
            'payment_reference' => $o->payment_reference,
            'note' => $o->note,
            'created_at' => $o->created_at,
            'reviewed_at' => $o->reviewed_at,
            'user' => $o->user?->only('id', 'name', 'email', 'phone'),
            'course' => $o->course?->only('id', 'title'),
            'reviewer' => $o->reviewer?->only('id', 'name'),
        ];
    }
}

<?php

namespace App\Services;

use App\Models\Course;
use App\Models\Plan;
use App\Models\Tenant;
use App\Models\User;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\File;
use Illuminate\Support\Facades\Storage;
use Illuminate\Validation\ValidationException;

/**
 * Plans and limits.
 *
 * - New institutes get the top plan free during the trial.
 * - A paid plan runs until plan_ends_at.
 * - Otherwise the institute is on the Free plan. Nothing is ever locked or
 *   deleted when time runs out; only adding beyond the limits is refused.
 */
class Billing
{
    /** @return array{plan: ?Plan, source: string, ends_at: ?\Carbon\CarbonInterface} */
    public function effective(Tenant $tenant): array
    {
        if ($tenant->status === Tenant::STATUS_TRIAL && $tenant->trial_ends_at?->isFuture()) {
            $top = Plan::where('is_active', true)->orderByDesc('price_monthly')->first();

            return ['plan' => $top, 'source' => 'trial', 'ends_at' => $tenant->trial_ends_at];
        }

        if ($tenant->plan_id && $tenant->plan_ends_at?->isFuture()) {
            $plan = Plan::find($tenant->plan_id);
            if ($plan && (float) $plan->price_monthly > 0) {
                return ['plan' => $plan, 'source' => 'paid', 'ends_at' => $tenant->plan_ends_at];
            }
        }

        return ['plan' => Plan::where('slug', 'free')->first(), 'source' => 'free', 'ends_at' => null];
    }

    public function usage(Tenant $tenant): array
    {
        return [
            'students' => User::withoutGlobalScope('tenant')->where('tenant_id', $tenant->id)->where('role', User::ROLE_STUDENT)->count(),
            'courses' => Course::withoutGlobalScope('tenant')->where('tenant_id', $tenant->id)->count(),
            'storage_mb' => $this->storageMb($tenant),
        ];
    }

    /** Refuse to add a student or course beyond the current plan. */
    public function ensureCanAdd(Tenant $tenant, string $what): void
    {
        $plan = $this->effective($tenant)['plan'];
        $limit = $what === 'students' ? $plan?->max_students : $plan?->max_courses;

        if ($limit === null) {
            return;
        }

        $used = $this->usage($tenant)[$what];
        if ($used >= $limit) {
            throw ValidationException::withMessages([
                $what === 'students' ? 'role' : 'title' => sprintf(
                    'Your %s plan allows %d %s. Upgrade on the Billing page to add more.',
                    $plan->name, $limit, $what,
                ),
            ]);
        }
    }

    public function storageMb(Tenant $tenant): float
    {
        return Cache::remember("tenant:{$tenant->id}:storage", 600, function () use ($tenant) {
            $dir = Storage::disk('public')->path("tenants/{$tenant->id}");
            if (! is_dir($dir)) {
                return 0.0;
            }
            $bytes = 0;
            foreach (File::allFiles($dir) as $file) {
                $bytes += $file->getSize();
            }

            return round($bytes / 1048576, 1);
        });
    }

    /** Extend the institute's paid plan after a payment is approved. */
    public function activate(Tenant $tenant, Plan $plan, int $months): void
    {
        $from = $tenant->plan_id === $plan->id && $tenant->plan_ends_at?->isFuture()
            ? $tenant->plan_ends_at->copy()
            : now();

        $tenant->plan_id = $plan->id;
        $tenant->plan_ends_at = $from->addMonths($months);
        if ($tenant->status !== Tenant::STATUS_SUSPENDED) {
            $tenant->status = Tenant::STATUS_ACTIVE;
        }
        $tenant->save();
    }
}

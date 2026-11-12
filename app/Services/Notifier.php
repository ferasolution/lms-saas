<?php

namespace App\Services;

use App\Models\User;
use App\Models\UserNotification;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\DB;
use Throwable;

/**
 * In-app notifications (the bell). Failures never break the action that
 * triggered them.
 */
class Notifier
{
    /**
     * @param  iterable<User>|User|int|array<int>  $to
     */
    public function send($to, string $type, string $title, ?string $body = null, ?string $url = null, ?int $tenantId = null): void
    {
        try {
            $ids = $this->ids($to);
            if (! $ids) {
                return;
            }

            $tenants = $tenantId !== null
                ? array_fill_keys($ids, $tenantId)
                : User::withoutGlobalScope('tenant')->whereIn('id', $ids)->pluck('tenant_id', 'id')->all();

            $now = now();
            $rows = array_map(fn ($id) => [
                'tenant_id' => $tenants[$id] ?? null,
                'user_id' => $id,
                'type' => $type,
                'title' => mb_substr($title, 0, 200),
                'body' => $body !== null ? mb_substr($body, 0, 500) : null,
                'url' => $url,
                'created_at' => $now,
            ], $ids);

            foreach (array_chunk($rows, 500) as $chunk) {
                DB::table('user_notifications')->insert($chunk);
            }
        } catch (Throwable $e) {
            report($e);
        }
    }

    /** People in an institute with one of the given roles. */
    public function roleIds(int $tenantId, array $roles): array
    {
        return User::withoutGlobalScope('tenant')
            ->where('tenant_id', $tenantId)->whereIn('role', $roles)->where('is_active', true)
            ->pluck('id')->all();
    }

    protected function ids($to): array
    {
        if ($to instanceof User) {
            return [$to->id];
        }
        if (is_int($to)) {
            return [$to];
        }
        if ($to instanceof Collection) {
            $to = $to->all();
        }

        return array_values(array_unique(array_filter(array_map(
            fn ($x) => $x instanceof User ? $x->id : (int) $x,
            (array) $to,
        ))));
    }
}

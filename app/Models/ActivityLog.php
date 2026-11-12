<?php

namespace App\Models;

use App\Tenancy\TenantManager;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Throwable;

/**
 * What happened on the platform, for the owner's activity feed.
 * Deliberately not tenant-scoped: only the platform owner reads it.
 */
class ActivityLog extends Model
{
    public const UPDATED_AT = null;

    protected $fillable = ['tenant_id', 'user_id', 'action', 'description', 'meta', 'ip'];

    protected function casts(): array
    {
        return ['meta' => 'array', 'created_at' => 'datetime'];
    }

    public function tenant(): BelongsTo
    {
        return $this->belongsTo(Tenant::class)->withTrashed();
    }

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class)->withoutGlobalScope('tenant');
    }

    /** Never lets logging break the action being logged. */
    public static function record(string $action, string $description, array $meta = [], ?int $tenantId = null, ?User $user = null): void
    {
        try {
            static::create([
                'tenant_id' => $tenantId ?? app(TenantManager::class)->id(),
                'user_id' => $user?->id ?? auth()->id(),
                'action' => $action,
                'description' => mb_substr($description, 0, 500),
                'meta' => $meta ?: null,
                'ip' => request()?->ip(),
            ]);
        } catch (Throwable $e) {
            report($e);
        }
    }
}

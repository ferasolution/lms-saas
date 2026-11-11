<?php

namespace App\Models\Concerns;

use App\Models\Tenant;
use App\Tenancy\TenantManager;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * Scopes every query to the current tenant and stamps tenant_id on create.
 * When no tenant is set (platform admin, console), queries are not scoped.
 */
trait BelongsToTenant
{
    public static function bootBelongsToTenant(): void
    {
        static::addGlobalScope('tenant', function (Builder $query) {
            $tenantId = app(TenantManager::class)->id();

            if ($tenantId !== null) {
                $query->where($query->getModel()->qualifyColumn('tenant_id'), $tenantId);
            }
        });

        static::creating(function (Model $model) {
            $tenantId = app(TenantManager::class)->id();

            if ($tenantId !== null && empty($model->tenant_id)) {
                $model->tenant_id = $tenantId;
            }
        });
    }

    public function tenant(): BelongsTo
    {
        return $this->belongsTo(Tenant::class);
    }
}

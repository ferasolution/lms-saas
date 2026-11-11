<?php

namespace App\Tenancy;

use App\Models\Tenant;

/**
 * Holds the tenant for the current request. Bound as a singleton and set by
 * the ResolveTenant middleware; everything tenant-scoped reads from here.
 */
class TenantManager
{
    protected ?Tenant $tenant = null;

    public function set(?Tenant $tenant): void
    {
        $this->tenant = $tenant;
    }

    public function forget(): void
    {
        $this->tenant = null;
    }

    public function current(): ?Tenant
    {
        return $this->tenant;
    }

    public function id(): ?int
    {
        return $this->tenant?->id;
    }

    public function check(): bool
    {
        return $this->tenant !== null;
    }

    /**
     * Run a callback as a given tenant, restoring the previous one afterwards.
     * Useful for queued jobs, seeders and console commands.
     */
    public function runAs(Tenant $tenant, callable $callback): mixed
    {
        $previous = $this->tenant;
        $this->tenant = $tenant;

        try {
            return $callback($tenant);
        } finally {
            $this->tenant = $previous;
        }
    }
}

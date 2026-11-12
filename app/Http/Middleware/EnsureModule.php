<?php

namespace App\Http\Middleware;

use App\Tenancy\TenantManager;
use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

/**
 * Blocks a module an institute has switched off (Settings → Modules).
 * Modules are on unless explicitly set to false.
 */
class EnsureModule
{
    public function __construct(protected TenantManager $tenants) {}

    public function handle(Request $request, Closure $next, string $module): Response
    {
        $tenant = $this->tenants->current();
        if ($tenant && data_get($tenant->settings, "modules.{$module}") === false) {
            return response()->json(['message' => 'This feature is turned off for your institute.'], 403);
        }

        return $next($request);
    }
}

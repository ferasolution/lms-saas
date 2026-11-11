<?php

namespace App\Http\Controllers\Api\Central;

use App\Http\Controllers\Controller;
use App\Http\Resources\TenantResource;
use App\Http\Resources\UserResource;
use App\Models\Tenant;
use App\Models\User;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\AnonymousResourceCollection;
use Illuminate\Support\Facades\Hash;
use Illuminate\Validation\Rule;
use Illuminate\Validation\ValidationException;

/**
 * Platform owner (super admin) endpoints. No tenant is set on these routes.
 */
class PlatformController extends Controller
{
    public function login(Request $request): JsonResponse
    {
        $data = $request->validate([
            'email' => ['required', 'email'],
            'password' => ['required', 'string'],
        ]);

        $user = User::withoutGlobalScope('tenant')
            ->whereNull('tenant_id')
            ->where('role', User::ROLE_SUPER_ADMIN)
            ->where('email', strtolower($data['email']))
            ->first();

        if (! $user || ! $user->is_active || ! Hash::check($data['password'], $user->password)) {
            throw ValidationException::withMessages(['email' => 'These credentials do not match our records.']);
        }

        return response()->json([
            'user' => new UserResource($user),
            'token' => $user->createToken('platform')->plainTextToken,
        ]);
    }

    public function tenants(Request $request): AnonymousResourceCollection
    {
        $tenants = Tenant::query()
            ->with('plan')
            ->withCount(['users', 'courses'])
            ->when($request->filled('status'), fn ($q) => $q->where('status', $request->string('status')))
            ->when($request->filled('search'), fn ($q) => $q->where(function ($q) use ($request) {
                $term = '%'.$request->string('search').'%';
                $q->where('name', 'like', $term)->orWhere('slug', 'like', $term);
            }))
            ->latest()
            ->paginate(25);

        return TenantResource::collection($tenants);
    }

    public function updateTenant(Request $request, Tenant $tenant): TenantResource
    {
        $data = $request->validate([
            'status' => ['sometimes', Rule::in([Tenant::STATUS_TRIAL, Tenant::STATUS_ACTIVE, Tenant::STATUS_SUSPENDED])],
            'plan_id' => ['sometimes', 'nullable', 'exists:plans,id'],
            'trial_ends_at' => ['sometimes', 'nullable', 'date'],
        ]);

        $tenant->update($data);

        return new TenantResource($tenant->load('plan'));
    }
}

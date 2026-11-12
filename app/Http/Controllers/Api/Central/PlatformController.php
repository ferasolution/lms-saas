<?php

namespace App\Http\Controllers\Api\Central;

use App\Http\Controllers\Controller;
use App\Http\Resources\TenantResource;
use App\Http\Resources\UserResource;
use App\Models\Certificate;
use App\Models\Course;
use App\Models\Enrollment;
use App\Models\Tenant;
use App\Models\User;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\AnonymousResourceCollection;
use Illuminate\Support\Facades\Hash;
use Illuminate\Validation\Rule;
use Illuminate\Validation\Rules\Password;
use Illuminate\Validation\ValidationException;

/**
 * Platform owner (super admin) endpoints. No tenant is set on these routes.
 */
class PlatformController extends Controller
{
    /**
     * One-time creation of the first super admin, for hosting without a terminal.
     * Needs the DEPLOY_TOKEN and stops working as soon as a super admin exists.
     */
    public function setup(Request $request): JsonResponse
    {
        $expected = (string) config('app.deploy_token');

        if (strlen($expected) < 32 || $this->superAdminExists()) {
            abort(404);
        }

        $data = $request->validate([
            'token' => ['required', 'string'],
            'name' => ['required', 'string', 'max:120'],
            'email' => ['required', 'email', 'max:255'],
            'password' => ['required', 'confirmed', Password::min(10)],
        ]);

        if (! hash_equals($expected, $data['token'])) {
            throw ValidationException::withMessages(['token' => 'This setup key is not correct.']);
        }

        $user = new User([
            'name' => $data['name'],
            'email' => strtolower($data['email']),
            'password' => $data['password'],
        ]);
        $user->role = User::ROLE_SUPER_ADMIN;
        $user->tenant_id = null;
        $user->save();

        return response()->json([
            'user' => new UserResource($user),
            'token' => $user->createToken('platform')->plainTextToken,
        ], 201);
    }

    public function setupStatus(): JsonResponse
    {
        return response()->json([
            'available' => strlen((string) config('app.deploy_token')) >= 32 && ! $this->superAdminExists(),
        ]);
    }

    protected function superAdminExists(): bool
    {
        return User::withoutGlobalScope('tenant')
            ->whereNull('tenant_id')
            ->where('role', User::ROLE_SUPER_ADMIN)
            ->exists();
    }

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

    public function me(Request $request): JsonResponse
    {
        return response()->json(['user' => new UserResource($request->user())]);
    }

    public function stats(): JsonResponse
    {
        $byStatus = Tenant::query()->selectRaw('status, count(*) as total')->groupBy('status')->pluck('total', 'status');
        $byType = Tenant::query()->selectRaw('type, count(*) as total')->groupBy('type')->pluck('total', 'type');

        return response()->json([
            'tenants' => [
                'total' => (int) $byStatus->sum(),
                'trial' => (int) ($byStatus['trial'] ?? 0),
                'active' => (int) ($byStatus['active'] ?? 0),
                'suspended' => (int) ($byStatus['suspended'] ?? 0),
                'new_30_days' => Tenant::where('created_at', '>=', now()->subDays(30))->count(),
                'by_type' => $byType,
            ],
            'users' => User::whereNotNull('tenant_id')->count(),
            'students' => User::where('role', User::ROLE_STUDENT)->count(),
            'courses' => Course::count(),
            'enrollments' => Enrollment::count(),
            'certificates' => Certificate::count(),
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

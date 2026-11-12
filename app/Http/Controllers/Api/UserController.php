<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Resources\UserResource;
use App\Models\ActivityLog;
use App\Models\User;
use App\Services\Billing;
use App\Tenancy\TenantManager;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\AnonymousResourceCollection;
use Illuminate\Validation\Rule;
use Illuminate\Validation\Rules\Password;

/**
 * Institute admins manage their own people: instructors, students, parents, managers.
 */
class UserController extends Controller
{
    public function index(Request $request): AnonymousResourceCollection
    {
        $users = User::query()
            ->when($request->filled('role'), fn ($q) => $q->where('role', $request->string('role')))
            ->when($request->filled('search'), function ($q) use ($request) {
                $term = '%'.$request->string('search').'%';
                $q->where(fn ($q) => $q->where('name', 'like', $term)->orWhere('email', 'like', $term));
            })
            ->orderBy('name')
            ->paginate(min((int) $request->integer('per_page', 25) ?: 25, 100));

        return UserResource::collection($users);
    }

    public function store(Request $request): JsonResponse
    {
        $tenantId = $request->user()->tenant_id;

        $data = $request->validate([
            'name' => ['required', 'string', 'max:120'],
            'email' => ['required', 'email', 'max:255',
                Rule::unique('users', 'email')->where('tenant_id', $tenantId)],
            'role' => ['required', Rule::in(User::TENANT_ROLES)],
            'phone' => ['nullable', 'string', 'max:30'],
            'password' => ['required', Password::min(8)],
        ]);

        if ($data['role'] === User::ROLE_STUDENT) {
            app(Billing::class)->ensureCanAdd(app(TenantManager::class)->current(), 'students');
        }

        $user = new User([
            'name' => $data['name'],
            'email' => strtolower($data['email']),
            'phone' => $data['phone'] ?? null,
            'password' => $data['password'],
        ]);
        $user->role = $data['role'];
        $user->tenant_id = $tenantId;
        $user->save();

        ActivityLog::record('user.created', "Added {$user->role} {$user->name}", ['user_id' => $user->id]);

        return (new UserResource($user))->response()->setStatusCode(201);
    }

    public function update(Request $request, User $user): UserResource
    {
        $tenantId = $request->user()->tenant_id;

        $data = $request->validate([
            'name' => ['sometimes', 'string', 'max:120'],
            'email' => ['sometimes', 'email', 'max:255',
                Rule::unique('users', 'email')->where('tenant_id', $tenantId)->ignore($user->id)],
            'role' => ['sometimes', Rule::in(User::TENANT_ROLES)],
            'phone' => ['nullable', 'string', 'max:30'],
            'is_active' => ['sometimes', 'boolean'],
            'password' => ['sometimes', Password::min(8)],
        ]);

        // An admin cannot lock themselves out.
        if ($user->is($request->user()) && (isset($data['role']) && $data['role'] !== User::ROLE_ADMIN
            || (array_key_exists('is_active', $data) && ! $data['is_active']))) {
            abort(422, 'You cannot remove your own admin access.');
        }

        $user->fill(collect($data)->only(['name', 'email', 'phone', 'password'])->all());

        if (isset($data['role'])) {
            $user->role = $data['role'];
        }
        if (array_key_exists('is_active', $data)) {
            $user->is_active = $data['is_active'];
        }

        $user->save();

        // A new password or disabled account signs the person out everywhere.
        if (isset($data['password']) || (array_key_exists('is_active', $data) && ! $data['is_active'])) {
            $user->tokens()->where('id', '!=', $request->user()->currentAccessToken()?->id ?? 0)->delete();
            if (isset($data['password'])) {
                ActivityLog::record('user.password_reset', "Reset the password of {$user->name}", ['user_id' => $user->id]);
            }
        }

        return new UserResource($user);
    }
}

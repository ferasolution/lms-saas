<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Resources\TenantResource;
use App\Http\Resources\UserResource;
use App\Models\ActivityLog;
use App\Models\User;
use App\Tenancy\TenantManager;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Hash;
use Illuminate\Validation\ValidationException;

/**
 * Login for users of a tenant. Runs inside the "tenant" middleware, so the
 * User query below is automatically limited to the current institute.
 */
class AuthController extends Controller
{
    public function login(Request $request, TenantManager $tenants): JsonResponse
    {
        $data = $request->validate([
            'email' => ['required', 'email'],
            'password' => ['required', 'string'],
            'device_name' => ['nullable', 'string', 'max:60'],
        ]);

        $user = User::where('email', strtolower($data['email']))->first();

        if (! $user || ! Hash::check($data['password'], $user->password)) {
            throw ValidationException::withMessages([
                'email' => 'These credentials do not match our records.',
            ]);
        }

        if (! $user->is_active) {
            throw ValidationException::withMessages([
                'email' => 'Your account has been disabled. Please contact your institute.',
            ]);
        }

        $user->forceFill(['last_login_at' => now()])->saveQuietly();
        ActivityLog::record('auth.login', "{$user->name} signed in", [], $user->tenant_id, $user);

        return response()->json([
            'tenant' => new TenantResource($tenants->current()->load('plan')),
            'user' => new UserResource($user),
            'token' => $user->createToken($data['device_name'] ?? 'web')->plainTextToken,
        ]);
    }

    public function me(Request $request, TenantManager $tenants): JsonResponse
    {
        return response()->json([
            'tenant' => new TenantResource($tenants->current()->load('plan')),
            'user' => new UserResource($request->user()),
        ]);
    }

    public function logout(Request $request): JsonResponse
    {
        $request->user()->currentAccessToken()?->delete();

        return response()->json(['message' => 'Logged out.']);
    }
}

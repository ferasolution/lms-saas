<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Resources\TenantResource;
use App\Http\Resources\UserResource;
use App\Models\Plan;
use App\Models\Tenant;
use App\Models\User;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\Rule;
use Illuminate\Validation\Rules\Password;

/**
 * Public sign-up: creates a new institute (tenant) and its first admin.
 */
class TenantRegistrationController extends Controller
{
    public function store(Request $request): JsonResponse
    {
        $data = $request->validate([
            'institute_name' => ['required', 'string', 'max:120'],
            'slug' => [
                'required', 'string', 'min:3', 'max:40',
                'regex:/^[a-z0-9]([a-z0-9-]*[a-z0-9])?$/',
                Rule::notIn(config('tenancy.reserved_slugs')),
                Rule::unique('tenants', 'slug'),
            ],
            'type' => ['required', Rule::in(config('tenancy.types'))],
            'name' => ['required', 'string', 'max:120'],
            'email' => ['required', 'email', 'max:255'],
            'password' => ['required', 'confirmed', Password::min(8)],
        ], [
            'slug.regex' => 'Use only lowercase letters, numbers and dashes.',
            'slug.not_in' => 'This address is reserved. Please choose another.',
            'slug.unique' => 'This address is already taken.',
        ]);

        [$tenant, $admin] = DB::transaction(function () use ($data) {
            $tenant = Tenant::create([
                'name' => $data['institute_name'],
                'slug' => strtolower($data['slug']),
                'type' => $data['type'],
                'plan_id' => Plan::where('slug', 'free')->value('id'),
                'status' => Tenant::STATUS_TRIAL,
                'trial_ends_at' => now()->addDays(config('tenancy.trial_days')),
            ]);

            $admin = new User([
                'name' => $data['name'],
                'email' => strtolower($data['email']),
                'password' => $data['password'],
            ]);
            $admin->tenant_id = $tenant->id;
            $admin->role = User::ROLE_ADMIN;
            $admin->save();

            return [$tenant, $admin];
        });

        return response()->json([
            'tenant' => new TenantResource($tenant->load('plan')),
            'user' => new UserResource($admin),
            'token' => $admin->createToken('web')->plainTextToken,
        ], 201);
    }
}

<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Resources\TenantResource;
use App\Http\Resources\UserResource;
use App\Support\Payments;
use App\Tenancy\TenantManager;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Hash;
use Illuminate\Validation\Rule;
use Illuminate\Validation\Rules\Password;
use Illuminate\Validation\ValidationException;

class SettingsController extends Controller
{
    public const BRANDS = ['ink', 'emerald', 'plum', 'teal', 'maroon', 'slate'];

    /** Admin: institute profile, branding and payment details. */
    public function update(Request $request, TenantManager $tenants): TenantResource
    {
        $tenant = $tenants->current();

        $data = $request->validate([
            'name' => ['sometimes', 'string', 'max:120'],
            'settings' => ['sometimes', 'array'],
            'settings.brand' => ['nullable', Rule::in(self::BRANDS)],
            'settings.logo_url' => ['nullable', 'url:http,https', 'max:500'],
            'settings.welcome_message' => ['nullable', 'string', 'max:300'],
            'settings.support_email' => ['nullable', 'email', 'max:255'],
            'settings.support_phone' => ['nullable', 'string', 'max:30'],
            'settings.payments' => ['nullable', 'array'],
            'settings.payments.bank' => ['nullable', 'string', 'max:500'],
            'settings.payments.paypal' => ['nullable', 'string', 'max:255'],
            'settings.payments.wise' => ['nullable', 'string', 'max:255'],
            'settings.payments.card' => ['nullable', 'url:http,https', 'max:500'],
            'settings.payments.instructions' => ['nullable', 'string', 'max:1000'],
            'settings.certificate_signatory' => ['nullable', 'string', 'max:120'],
            'settings.currency' => ['nullable', Rule::in(Payments::CURRENCIES)],
            'settings.address' => ['nullable', 'string', 'max:300'],
            'settings.library_fine_per_day' => ['nullable', 'numeric', 'min:0', 'max:1000'],
            'settings.admissions_open' => ['nullable', 'boolean'],
            'settings.timezone' => ['nullable', 'timezone'],
            'settings.locale' => ['nullable', Rule::in(['en', 'ur', 'ar', 'es', 'fr'])],
        ]);

        if (isset($data['name'])) {
            $tenant->name = $data['name'];
        }

        if (isset($data['settings'])) {
            // Only known keys are stored; merge so a partial save keeps the rest.
            $settings = array_replace_recursive($tenant->settings ?? [], $data['settings']);
            // Drop payment methods that are no longer offered.
            if (isset($settings['payments'])) {
                $settings['payments'] = array_intersect_key($settings['payments'], array_flip(['bank', 'paypal', 'wise', 'card', 'instructions']));
            }
            $tenant->settings = $settings;
        }

        $tenant->save();

        return new TenantResource($tenant->load('plan'));
    }

    /** Any signed-in user: their own name, phone and password. */
    public function updateProfile(Request $request): UserResource
    {
        $user = $request->user();

        $data = $request->validate([
            'name' => ['sometimes', 'string', 'max:120'],
            'phone' => ['nullable', 'string', 'max:30'],
            'current_password' => ['required_with:password', 'string'],
            'password' => ['sometimes', 'confirmed', Password::min(8)],
        ]);

        if (isset($data['password'])) {
            if (! Hash::check($data['current_password'], $user->password)) {
                throw ValidationException::withMessages(['current_password' => 'Your current password is not correct.']);
            }
            $user->password = $data['password'];

            // Sign out other devices; keep this one.
            $user->tokens()->where('id', '!=', $user->currentAccessToken()?->id)->delete();
        }

        $user->fill(collect($data)->only(['name', 'phone'])->all());
        $user->save();

        return new UserResource($user);
    }
}

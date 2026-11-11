<?php

namespace App\Console\Commands;

use App\Models\User;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\Validator;

class CreateSuperAdmin extends Command
{
    protected $signature = 'lms:super-admin {email} {--name=Platform Admin}';

    protected $description = 'Create (or reset the password of) the platform super admin';

    public function handle(): int
    {
        $email = strtolower($this->argument('email'));
        $password = $this->secret('Password (min 10 characters)');

        $validator = Validator::make(
            ['email' => $email, 'password' => $password],
            ['email' => ['required', 'email'], 'password' => ['required', 'string', 'min:10']],
        );

        if ($validator->fails()) {
            foreach ($validator->errors()->all() as $error) {
                $this->error($error);
            }

            return self::FAILURE;
        }

        $user = User::withoutGlobalScope('tenant')
            ->whereNull('tenant_id')
            ->where('email', $email)
            ->first() ?? new User(['email' => $email]);

        $user->name = $user->name ?: $this->option('name');
        $user->password = $password;
        $user->role = User::ROLE_SUPER_ADMIN;
        $user->tenant_id = null;
        $user->is_active = true;
        $user->save();

        $this->info("Super admin ready: {$email}");

        return self::SUCCESS;
    }
}

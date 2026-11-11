<?php

namespace Database\Seeders;

use App\Models\Plan;
use Illuminate\Database\Seeder;

class DatabaseSeeder extends Seeder
{
    /**
     * Safe to run on production repeatedly: only creates/updates the plans.
     * Create the platform owner with: php artisan lms:super-admin
     */
    public function run(): void
    {
        $plans = [
            ['slug' => 'free', 'name' => 'Free', 'price_monthly' => 0, 'max_students' => 25, 'max_courses' => 3, 'storage_mb' => 500],
            ['slug' => 'basic', 'name' => 'Basic', 'price_monthly' => 29, 'max_students' => 300, 'max_courses' => 30, 'storage_mb' => 10240],
            ['slug' => 'pro', 'name' => 'Pro', 'price_monthly' => 79, 'max_students' => null, 'max_courses' => null, 'storage_mb' => 102400],
        ];

        foreach ($plans as $plan) {
            Plan::updateOrCreate(['slug' => $plan['slug']], $plan + ['currency' => 'USD', 'is_active' => true]);
        }
    }
}

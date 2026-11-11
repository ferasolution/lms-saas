<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        // SaaS subscription plans offered by the platform owner.
        Schema::create('plans', function (Blueprint $table) {
            $table->id();
            $table->string('name');
            $table->string('slug')->unique();
            $table->decimal('price_monthly', 10, 2)->default(0);
            $table->string('currency', 3)->default('USD');
            $table->unsignedInteger('max_students')->nullable();   // null = unlimited
            $table->unsignedInteger('max_courses')->nullable();
            $table->unsignedInteger('storage_mb')->nullable();
            $table->json('features')->nullable();
            $table->boolean('is_active')->default(true);
            $table->timestamps();
        });

        // Each customer (school, academy, company) is a tenant.
        Schema::create('tenants', function (Blueprint $table) {
            $table->id();
            $table->string('name');
            $table->string('slug')->unique();                      // used as subdomain / X-Tenant header
            $table->string('type')->default('academy');            // school | academy | corporate
            $table->foreignId('plan_id')->nullable()->constrained()->nullOnDelete();
            $table->string('status')->default('trial');            // trial | active | suspended
            $table->timestamp('trial_ends_at')->nullable();
            $table->string('custom_domain')->nullable()->unique();
            $table->json('settings')->nullable();                  // branding: logo, colors, etc.
            $table->timestamps();
            $table->softDeletes();
        });

        Schema::create('subscriptions', function (Blueprint $table) {
            $table->id();
            $table->foreignId('tenant_id')->constrained()->cascadeOnDelete();
            $table->foreignId('plan_id')->constrained()->restrictOnDelete();
            $table->string('status')->default('active');           // active | cancelled | expired
            $table->decimal('amount', 10, 2)->default(0);
            $table->string('currency', 3)->default('USD');
            $table->string('gateway')->nullable();
            $table->string('gateway_ref')->nullable();
            $table->timestamp('starts_at')->nullable();
            $table->timestamp('ends_at')->nullable();
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('subscriptions');
        Schema::dropIfExists('tenants');
        Schema::dropIfExists('plans');
    }
};

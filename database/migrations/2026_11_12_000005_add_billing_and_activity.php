<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('tenants', function (Blueprint $table) {
            $table->timestamp('plan_ends_at')->nullable()->after('trial_ends_at');
        });

        Schema::table('users', function (Blueprint $table) {
            $table->timestamp('last_login_at')->nullable()->after('remember_token');
        });

        // Institute → platform payments for a plan. The institute pays by
        // JazzCash / Easypaisa / bank and the platform owner approves.
        Schema::table('subscriptions', function (Blueprint $table) {
            $table->unsignedSmallInteger('months')->default(1)->after('plan_id');
            $table->string('payment_reference')->nullable()->after('gateway_ref');
            $table->string('note', 500)->nullable()->after('payment_reference');
            $table->foreignId('requested_by')->nullable()->after('note')->constrained('users')->nullOnDelete();
            $table->foreignId('reviewed_by')->nullable()->after('requested_by')->constrained('users')->nullOnDelete();
            $table->timestamp('reviewed_at')->nullable()->after('reviewed_by');
            $table->index(['status', 'created_at']);
        });

        Schema::create('activity_logs', function (Blueprint $table) {
            $table->id();
            $table->foreignId('tenant_id')->nullable()->constrained()->cascadeOnDelete();
            $table->foreignId('user_id')->nullable()->constrained()->nullOnDelete();
            $table->string('action', 60);
            $table->string('description', 500);
            $table->json('meta')->nullable();
            $table->string('ip', 45)->nullable();
            $table->timestamp('created_at')->useCurrent();
            $table->index(['tenant_id', 'created_at']);
            $table->index('created_at');
        });

        Schema::create('platform_settings', function (Blueprint $table) {
            $table->string('key')->primary();
            $table->json('value')->nullable();
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('platform_settings');
        Schema::dropIfExists('activity_logs');
        Schema::table('subscriptions', function (Blueprint $table) {
            $table->dropIndex(['status', 'created_at']);
            $table->dropConstrainedForeignId('reviewed_by');
            $table->dropConstrainedForeignId('requested_by');
            $table->dropColumn(['months', 'payment_reference', 'note', 'reviewed_at']);
        });
        Schema::table('users', fn (Blueprint $table) => $table->dropColumn('last_login_at'));
        Schema::table('tenants', fn (Blueprint $table) => $table->dropColumn('plan_ends_at'));
    }
};

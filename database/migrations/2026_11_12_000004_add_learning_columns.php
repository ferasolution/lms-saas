<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('courses', function (Blueprint $table) {
            $table->boolean('certificate_enabled')->default(true)->after('status');
            $table->string('what_you_learn', 2000)->nullable()->after('description');
        });

        Schema::table('lessons', function (Blueprint $table) {
            $table->string('summary', 500)->nullable()->after('title');
        });

        // Manual payment flow: the student pays by JazzCash / Easypaisa / bank and
        // enters the transaction reference; an admin checks it and approves.
        Schema::table('orders', function (Blueprint $table) {
            $table->string('payment_reference')->nullable()->after('gateway_ref');
            $table->string('note', 500)->nullable()->after('payment_reference');
            $table->foreignId('reviewed_by')->nullable()->after('note')->constrained('users')->nullOnDelete();
            $table->timestamp('reviewed_at')->nullable()->after('reviewed_by');
        });
    }

    public function down(): void
    {
        Schema::table('orders', function (Blueprint $table) {
            $table->dropConstrainedForeignId('reviewed_by');
            $table->dropColumn(['payment_reference', 'note', 'reviewed_at']);
        });
        Schema::table('lessons', fn (Blueprint $table) => $table->dropColumn('summary'));
        Schema::table('courses', fn (Blueprint $table) => $table->dropColumn(['certificate_enabled', 'what_you_learn']));
    }
};

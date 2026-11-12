<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Student fees: what is charged (heads and class plans), discounts,
 * invoices with line items, and payments with receipts.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('fee_heads', function (Blueprint $t) {
            $t->id();
            $t->foreignId('tenant_id')->constrained()->cascadeOnDelete();
            $t->string('name', 80);
            $t->string('frequency', 12)->default('monthly'); // monthly | termly | annual | once
            $t->boolean('is_active')->default(true);
            $t->timestamps();
            $t->unique(['tenant_id', 'name']);
        });

        Schema::create('fee_plans', function (Blueprint $t) {
            $t->id();
            $t->foreignId('tenant_id')->constrained()->cascadeOnDelete();
            $t->foreignId('school_class_id')->constrained()->cascadeOnDelete();
            $t->foreignId('fee_head_id')->constrained()->cascadeOnDelete();
            $t->decimal('amount', 12, 2);
            $t->timestamps();
            $t->unique(['school_class_id', 'fee_head_id']);
        });

        Schema::create('fee_discounts', function (Blueprint $t) {
            $t->id();
            $t->foreignId('tenant_id')->constrained()->cascadeOnDelete();
            $t->foreignId('student_id')->constrained('users')->cascadeOnDelete();
            $t->foreignId('fee_head_id')->nullable()->constrained()->cascadeOnDelete();
            $t->string('name', 80);
            $t->string('type', 10)->default('percent'); // percent | fixed
            $t->decimal('value', 12, 2);
            $t->timestamps();
        });

        Schema::create('fee_invoices', function (Blueprint $t) {
            $t->id();
            $t->foreignId('tenant_id')->constrained()->cascadeOnDelete();
            $t->string('number', 30);
            $t->foreignId('student_id')->constrained('users')->cascadeOnDelete();
            $t->foreignId('class_section_id')->nullable()->constrained()->nullOnDelete();
            $t->string('period', 60);
            $t->date('issued_on');
            $t->date('due_on');
            $t->decimal('subtotal', 12, 2)->default(0);
            $t->decimal('discount', 12, 2)->default(0);
            $t->decimal('late_fee', 12, 2)->default(0);
            $t->decimal('total', 12, 2)->default(0);
            $t->decimal('paid', 12, 2)->default(0);
            $t->string('currency', 3)->default('USD');
            $t->string('status', 12)->default('unpaid'); // unpaid | partial | paid | cancelled
            $t->string('note', 500)->nullable();
            $t->foreignId('created_by')->nullable()->constrained('users')->nullOnDelete();
            $t->timestamp('reminded_at')->nullable();
            $t->timestamps();
            $t->unique(['tenant_id', 'number']);
            $t->index(['tenant_id', 'status', 'due_on']);
            $t->index(['student_id', 'period']);
        });

        Schema::create('fee_invoice_items', function (Blueprint $t) {
            $t->id();
            $t->foreignId('fee_invoice_id')->constrained()->cascadeOnDelete();
            $t->foreignId('fee_head_id')->nullable()->constrained()->nullOnDelete();
            $t->string('description', 160);
            $t->decimal('amount', 12, 2);
            $t->decimal('discount', 12, 2)->default(0);
        });

        Schema::create('fee_payments', function (Blueprint $t) {
            $t->id();
            $t->foreignId('tenant_id')->constrained()->cascadeOnDelete();
            $t->foreignId('fee_invoice_id')->constrained()->cascadeOnDelete();
            $t->foreignId('student_id')->constrained('users')->cascadeOnDelete();
            $t->decimal('amount', 12, 2);
            $t->string('method', 12);
            $t->string('reference', 120)->nullable();
            $t->date('paid_on');
            $t->string('status', 12)->default('confirmed'); // pending (parent reported) | confirmed | rejected
            $t->string('receipt_no', 30)->nullable();
            $t->string('note', 500)->nullable();
            $t->foreignId('submitted_by')->nullable()->constrained('users')->nullOnDelete();
            $t->foreignId('received_by')->nullable()->constrained('users')->nullOnDelete();
            $t->timestamps();
            $t->index(['tenant_id', 'status', 'paid_on']);
        });
    }

    public function down(): void
    {
        foreach (['fee_payments', 'fee_invoice_items', 'fee_invoices', 'fee_discounts', 'fee_plans', 'fee_heads'] as $table) {
            Schema::dropIfExists($table);
        }
    }
};

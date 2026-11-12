<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * HR (employees, staff attendance, leave, payroll) and simple accounts
 * (income and expense entries alongside fee collections and payroll).
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('employees', function (Blueprint $t) {
            $t->id();
            $t->foreignId('tenant_id')->constrained()->cascadeOnDelete();
            $t->foreignId('user_id')->nullable()->constrained()->nullOnDelete();
            $t->string('employee_no', 30);
            $t->string('name', 120);
            $t->string('email', 160)->nullable();
            $t->string('phone', 40)->nullable();
            $t->string('designation', 80)->nullable();
            $t->string('department', 80)->nullable();
            $t->string('employment_type', 20)->default('full_time');
            $t->date('joined_on')->nullable();
            $t->date('left_on')->nullable();
            $t->string('status', 12)->default('active');
            $t->decimal('base_salary', 12, 2)->default(0);
            $t->json('allowances')->nullable();
            $t->json('deductions')->nullable();
            $t->unsignedTinyInteger('annual_leave_days')->default(14);
            $t->string('bank_name', 80)->nullable();
            $t->string('bank_account', 60)->nullable();
            $t->text('qualifications')->nullable();
            $t->text('notes')->nullable();
            $t->timestamps();
            $t->unique(['tenant_id', 'employee_no']);
            $t->index(['tenant_id', 'status']);
        });

        Schema::create('staff_attendance', function (Blueprint $t) {
            $t->id();
            $t->foreignId('tenant_id')->constrained()->cascadeOnDelete();
            $t->foreignId('employee_id')->constrained()->cascadeOnDelete();
            $t->date('date');
            $t->string('status', 10);
            $t->time('check_in')->nullable();
            $t->time('check_out')->nullable();
            $t->string('note', 200)->nullable();
            $t->foreignId('marked_by')->nullable()->constrained('users')->nullOnDelete();
            $t->timestamps();
            $t->unique(['employee_id', 'date']);
        });

        Schema::create('staff_leaves', function (Blueprint $t) {
            $t->id();
            $t->foreignId('tenant_id')->constrained()->cascadeOnDelete();
            $t->foreignId('employee_id')->constrained()->cascadeOnDelete();
            $t->string('type', 12);
            $t->date('from_date');
            $t->date('to_date');
            $t->unsignedSmallInteger('days');
            $t->string('reason', 1000)->nullable();
            $t->string('status', 12)->default('pending');
            $t->foreignId('reviewed_by')->nullable()->constrained('users')->nullOnDelete();
            $t->timestamp('reviewed_at')->nullable();
            $t->timestamps();
        });

        Schema::create('payroll_runs', function (Blueprint $t) {
            $t->id();
            $t->foreignId('tenant_id')->constrained()->cascadeOnDelete();
            $t->string('period', 7); // YYYY-MM
            $t->string('status', 12)->default('draft'); // draft | finalized | paid
            $t->decimal('gross', 14, 2)->default(0);
            $t->decimal('deductions', 14, 2)->default(0);
            $t->decimal('net', 14, 2)->default(0);
            $t->string('currency', 3)->default('USD');
            $t->date('paid_on')->nullable();
            $t->foreignId('created_by')->nullable()->constrained('users')->nullOnDelete();
            $t->timestamps();
            $t->unique(['tenant_id', 'period']);
        });

        Schema::create('payslips', function (Blueprint $t) {
            $t->id();
            $t->foreignId('tenant_id')->constrained()->cascadeOnDelete();
            $t->foreignId('payroll_run_id')->constrained()->cascadeOnDelete();
            $t->foreignId('employee_id')->constrained()->cascadeOnDelete();
            $t->decimal('basic', 12, 2);
            $t->json('allowances')->nullable();
            $t->json('deductions')->nullable();
            $t->decimal('unpaid_days', 5, 1)->default(0);
            $t->decimal('unpaid_deduction', 12, 2)->default(0);
            $t->decimal('bonus', 12, 2)->default(0);
            $t->decimal('gross', 12, 2);
            $t->decimal('total_deductions', 12, 2);
            $t->decimal('net', 12, 2);
            $t->string('note', 300)->nullable();
            $t->timestamps();
            $t->unique(['payroll_run_id', 'employee_id']);
        });

        Schema::create('ledger_entries', function (Blueprint $t) {
            $t->id();
            $t->foreignId('tenant_id')->constrained()->cascadeOnDelete();
            $t->string('type', 8); // income | expense
            $t->string('category', 60);
            $t->date('date');
            $t->decimal('amount', 14, 2);
            $t->string('method', 12)->nullable();
            $t->string('party', 120)->nullable();
            $t->string('reference', 120)->nullable();
            $t->string('description', 500)->nullable();
            $t->string('attachment', 500)->nullable();
            $t->foreignId('created_by')->nullable()->constrained('users')->nullOnDelete();
            $t->timestamps();
            $t->index(['tenant_id', 'type', 'date']);
        });
    }

    public function down(): void
    {
        foreach (['ledger_entries', 'payslips', 'payroll_runs', 'staff_leaves', 'staff_attendance', 'employees'] as $table) {
            Schema::dropIfExists($table);
        }
    }
};

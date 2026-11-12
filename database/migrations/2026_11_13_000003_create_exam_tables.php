<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Examinations: exams with a paper per class subject, marks entry,
 * a grading scale, and published results / report cards.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('grade_bands', function (Blueprint $t) {
            $t->id();
            $t->foreignId('tenant_id')->constrained()->cascadeOnDelete();
            $t->decimal('min_percent', 5, 2);
            $t->string('grade', 10);
            $t->decimal('points', 4, 2)->nullable();
            $t->string('remark', 60)->nullable();
            $t->timestamps();
        });

        Schema::create('exams', function (Blueprint $t) {
            $t->id();
            $t->foreignId('tenant_id')->constrained()->cascadeOnDelete();
            $t->foreignId('academic_year_id')->nullable()->constrained()->nullOnDelete();
            $t->string('name', 120);
            $t->string('kind', 20)->default('term'); // term | midterm | final | monthly | weekly | entrance | other
            $t->date('starts_on')->nullable();
            $t->date('ends_on')->nullable();
            $t->string('status', 12)->default('draft'); // draft | scheduled | published
            $t->timestamp('published_at')->nullable();
            $t->boolean('show_rank')->default(false);
            $t->timestamps();
            $t->index(['tenant_id', 'status']);
        });

        Schema::create('exam_papers', function (Blueprint $t) {
            $t->id();
            $t->foreignId('tenant_id')->constrained()->cascadeOnDelete();
            $t->foreignId('exam_id')->constrained()->cascadeOnDelete();
            $t->foreignId('class_section_id')->constrained()->cascadeOnDelete();
            $t->foreignId('subject_id')->constrained()->cascadeOnDelete();
            $t->date('date')->nullable();
            $t->time('starts_at')->nullable();
            $t->unsignedSmallInteger('duration_minutes')->nullable();
            $t->string('room', 60)->nullable();
            $t->decimal('max_marks', 6, 2)->default(100);
            $t->decimal('pass_marks', 6, 2)->nullable();
            $t->timestamps();
            $t->unique(['exam_id', 'class_section_id', 'subject_id']);
        });

        Schema::create('exam_marks', function (Blueprint $t) {
            $t->id();
            $t->foreignId('tenant_id')->constrained()->cascadeOnDelete();
            $t->foreignId('exam_paper_id')->constrained()->cascadeOnDelete();
            $t->foreignId('student_id')->constrained('users')->cascadeOnDelete();
            $t->decimal('marks', 6, 2)->nullable();
            $t->boolean('is_absent')->default(false);
            $t->string('remark', 200)->nullable();
            $t->foreignId('entered_by')->nullable()->constrained('users')->nullOnDelete();
            $t->timestamps();
            $t->unique(['exam_paper_id', 'student_id']);
        });
    }

    public function down(): void
    {
        foreach (['exam_marks', 'exam_papers', 'exams', 'grade_bands'] as $table) {
            Schema::dropIfExists($table);
        }
    }
};

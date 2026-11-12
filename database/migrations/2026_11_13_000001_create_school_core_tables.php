<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * School core: academic structure, student records, families, admissions,
 * attendance, the daily diary (classwork / homework), timetables and leave.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('academic_years', function (Blueprint $t) {
            $t->id();
            $t->foreignId('tenant_id')->constrained()->cascadeOnDelete();
            $t->string('name', 60);
            $t->date('starts_on');
            $t->date('ends_on');
            $t->boolean('is_current')->default(false);
            $t->timestamps();
        });

        Schema::create('school_classes', function (Blueprint $t) {
            $t->id();
            $t->foreignId('tenant_id')->constrained()->cascadeOnDelete();
            $t->string('name', 60);
            $t->unsignedSmallInteger('sort')->default(0);
            $t->timestamps();
            $t->unique(['tenant_id', 'name']);
        });

        Schema::create('class_sections', function (Blueprint $t) {
            $t->id();
            $t->foreignId('tenant_id')->constrained()->cascadeOnDelete();
            $t->foreignId('school_class_id')->constrained()->cascadeOnDelete();
            $t->string('name', 30);
            $t->unsignedSmallInteger('capacity')->nullable();
            $t->string('room', 60)->nullable();
            $t->foreignId('class_teacher_id')->nullable()->constrained('users')->nullOnDelete();
            $t->timestamps();
            $t->unique(['school_class_id', 'name']);
        });

        Schema::create('subjects', function (Blueprint $t) {
            $t->id();
            $t->foreignId('tenant_id')->constrained()->cascadeOnDelete();
            $t->string('name', 80);
            $t->string('code', 20)->nullable();
            $t->string('color', 7)->nullable();
            $t->timestamps();
            $t->unique(['tenant_id', 'name']);
        });

        Schema::create('section_subjects', function (Blueprint $t) {
            $t->id();
            $t->foreignId('tenant_id')->constrained()->cascadeOnDelete();
            $t->foreignId('class_section_id')->constrained()->cascadeOnDelete();
            $t->foreignId('subject_id')->constrained()->cascadeOnDelete();
            $t->foreignId('teacher_id')->nullable()->constrained('users')->nullOnDelete();
            $t->timestamps();
            $t->unique(['class_section_id', 'subject_id']);
        });

        Schema::create('student_profiles', function (Blueprint $t) {
            $t->id();
            $t->foreignId('tenant_id')->constrained()->cascadeOnDelete();
            $t->foreignId('user_id')->unique()->constrained()->cascadeOnDelete();
            $t->string('admission_no', 30);
            $t->foreignId('class_section_id')->nullable()->constrained()->nullOnDelete();
            $t->string('roll_no', 20)->nullable();
            $t->date('date_of_birth')->nullable();
            $t->string('gender', 20)->nullable();
            $t->string('address', 500)->nullable();
            $t->string('emergency_contact', 120)->nullable();
            $t->text('medical_notes')->nullable();
            $t->string('previous_school', 160)->nullable();
            $t->date('admitted_on')->nullable();
            $t->string('status', 20)->default('active');
            $t->timestamps();
            $t->unique(['tenant_id', 'admission_no']);
            $t->index(['tenant_id', 'class_section_id', 'status']);
        });

        Schema::create('guardian_student', function (Blueprint $t) {
            $t->id();
            $t->foreignId('tenant_id')->constrained()->cascadeOnDelete();
            $t->foreignId('guardian_id')->constrained('users')->cascadeOnDelete();
            $t->foreignId('student_id')->constrained('users')->cascadeOnDelete();
            $t->string('relation', 20)->default('guardian');
            $t->boolean('can_pickup')->default(true);
            $t->timestamps();
            $t->unique(['guardian_id', 'student_id']);
        });

        Schema::create('admission_applications', function (Blueprint $t) {
            $t->id();
            $t->foreignId('tenant_id')->constrained()->cascadeOnDelete();
            $t->string('reference', 20);
            $t->string('student_name', 120);
            $t->date('date_of_birth')->nullable();
            $t->string('gender', 20)->nullable();
            $t->foreignId('school_class_id')->nullable()->constrained()->nullOnDelete();
            $t->string('guardian_name', 120);
            $t->string('guardian_email', 160);
            $t->string('guardian_phone', 40)->nullable();
            $t->string('relation', 20)->default('guardian');
            $t->string('previous_school', 160)->nullable();
            $t->text('notes')->nullable();
            $t->json('documents')->nullable();
            $t->string('source', 20)->default('online');
            $t->string('status', 20)->default('new');
            $t->dateTime('interview_at')->nullable();
            $t->text('decision_note')->nullable();
            $t->foreignId('student_id')->nullable()->constrained('users')->nullOnDelete();
            $t->foreignId('handled_by')->nullable()->constrained('users')->nullOnDelete();
            $t->timestamps();
            $t->unique(['tenant_id', 'reference']);
            $t->index(['tenant_id', 'status']);
        });

        Schema::create('attendance_records', function (Blueprint $t) {
            $t->id();
            $t->foreignId('tenant_id')->constrained()->cascadeOnDelete();
            $t->foreignId('class_section_id')->constrained()->cascadeOnDelete();
            $t->foreignId('student_id')->constrained('users')->cascadeOnDelete();
            $t->date('date');
            $t->string('status', 10);
            $t->string('note', 200)->nullable();
            $t->foreignId('marked_by')->nullable()->constrained('users')->nullOnDelete();
            $t->timestamps();
            $t->unique(['student_id', 'date']);
            $t->index(['class_section_id', 'date']);
        });

        Schema::create('diary_entries', function (Blueprint $t) {
            $t->id();
            $t->foreignId('tenant_id')->constrained()->cascadeOnDelete();
            $t->foreignId('class_section_id')->constrained()->cascadeOnDelete();
            $t->foreignId('subject_id')->nullable()->constrained()->nullOnDelete();
            $t->foreignId('teacher_id')->nullable()->constrained('users')->nullOnDelete();
            $t->date('date');
            $t->string('kind', 12)->default('homework');
            $t->string('title', 200);
            $t->text('body')->nullable();
            $t->string('attachment', 500)->nullable();
            $t->date('due_on')->nullable();
            $t->boolean('accepts_submissions')->default(false);
            $t->unsignedSmallInteger('max_marks')->nullable();
            $t->timestamps();
            $t->index(['class_section_id', 'date']);
        });

        Schema::create('homework_submissions', function (Blueprint $t) {
            $t->id();
            $t->foreignId('tenant_id')->constrained()->cascadeOnDelete();
            $t->foreignId('diary_entry_id')->constrained()->cascadeOnDelete();
            $t->foreignId('student_id')->constrained('users')->cascadeOnDelete();
            $t->text('body')->nullable();
            $t->string('file_path', 500)->nullable();
            $t->string('status', 12)->default('submitted');
            $t->decimal('marks', 6, 2)->nullable();
            $t->text('feedback')->nullable();
            $t->foreignId('checked_by')->nullable()->constrained('users')->nullOnDelete();
            $t->timestamp('submitted_at')->nullable();
            $t->timestamp('checked_at')->nullable();
            $t->timestamps();
            $t->unique(['diary_entry_id', 'student_id']);
        });

        Schema::create('timetable_slots', function (Blueprint $t) {
            $t->id();
            $t->foreignId('tenant_id')->constrained()->cascadeOnDelete();
            $t->foreignId('class_section_id')->constrained()->cascadeOnDelete();
            $t->unsignedTinyInteger('weekday');
            $t->time('starts_at');
            $t->time('ends_at');
            $t->foreignId('subject_id')->nullable()->constrained()->nullOnDelete();
            $t->foreignId('teacher_id')->nullable()->constrained('users')->nullOnDelete();
            $t->string('label', 60)->nullable();
            $t->string('room', 60)->nullable();
            $t->string('meeting_url', 500)->nullable();
            $t->timestamps();
            $t->index(['class_section_id', 'weekday']);
            $t->index(['teacher_id', 'weekday']);
        });

        Schema::create('leave_requests', function (Blueprint $t) {
            $t->id();
            $t->foreignId('tenant_id')->constrained()->cascadeOnDelete();
            $t->foreignId('student_id')->constrained('users')->cascadeOnDelete();
            $t->foreignId('requested_by')->nullable()->constrained('users')->nullOnDelete();
            $t->date('from_date');
            $t->date('to_date');
            $t->string('reason', 1000);
            $t->string('attachment', 500)->nullable();
            $t->string('status', 12)->default('pending');
            $t->foreignId('reviewed_by')->nullable()->constrained('users')->nullOnDelete();
            $t->timestamp('reviewed_at')->nullable();
            $t->timestamps();
            $t->index(['tenant_id', 'status']);
        });
    }

    public function down(): void
    {
        foreach (['leave_requests', 'timetable_slots', 'homework_submissions', 'diary_entries', 'attendance_records',
            'admission_applications', 'guardian_student', 'student_profiles', 'section_subjects', 'subjects',
            'class_sections', 'school_classes', 'academic_years'] as $table) {
            Schema::dropIfExists($table);
        }
    }
};

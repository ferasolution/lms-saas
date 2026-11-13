<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Live sessions: online classes, staff trainings and webinars held on Zoom,
 * Google Meet, Teams or any meeting link. EduSphere handles scheduling,
 * who is invited, registration, the join button (which records attendance)
 * and the recording link afterwards.
 */
return new class extends Migration
{
    public function up(): void
    {
        $tenant = fn (Blueprint $t) => $t->foreignId('tenant_id')->constrained()->cascadeOnDelete();

        Schema::create('live_sessions', function (Blueprint $t) use ($tenant) {
            $t->id(); $tenant($t);
            $t->string('kind', 12)->default('class');        // class | training | webinar
            $t->string('title', 160);
            $t->text('description')->nullable();
            $t->foreignId('host_id')->nullable()->constrained('users')->nullOnDelete();
            $t->dateTime('starts_at');
            $t->unsignedSmallInteger('duration_minutes')->default(45);
            $t->string('meeting_url', 500);
            $t->string('passcode', 60)->nullable();
            $t->string('audience', 12)->default('sections');  // sections | staff | everyone
            $t->json('section_ids')->nullable();
            $t->boolean('is_public')->default(false);         // webinars: open registration page
            $t->unsignedInteger('capacity')->nullable();
            $t->string('slug', 40)->unique();
            $t->string('recording_url', 500)->nullable();
            $t->string('status', 12)->default('scheduled');  // scheduled | cancelled
            $t->foreignId('created_by')->nullable()->constrained('users')->nullOnDelete();
            $t->timestamps();
            $t->index(['tenant_id', 'starts_at']);
        });

        Schema::create('live_session_registrations', function (Blueprint $t) use ($tenant) {
            $t->id(); $tenant($t);
            $t->foreignId('live_session_id')->constrained()->cascadeOnDelete();
            $t->string('name', 120);
            $t->string('email', 160);
            $t->string('phone', 40)->nullable();
            $t->string('organisation', 160)->nullable();
            $t->string('token', 40)->unique();
            $t->timestamp('joined_at')->nullable();
            $t->timestamps();
            $t->unique(['live_session_id', 'email']);
        });

        Schema::create('live_session_attendance', function (Blueprint $t) use ($tenant) {
            $t->id(); $tenant($t);
            $t->foreignId('live_session_id')->constrained()->cascadeOnDelete();
            $t->foreignId('user_id')->constrained()->cascadeOnDelete();
            $t->timestamp('first_joined_at');
            $t->timestamp('last_joined_at');
            $t->unsignedSmallInteger('joins')->default(1);
            $t->timestamps();
            $t->unique(['live_session_id', 'user_id']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('live_session_attendance');
        Schema::dropIfExists('live_session_registrations');
        Schema::dropIfExists('live_sessions');
    }
};

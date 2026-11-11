<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('categories', function (Blueprint $table) {
            $table->id();
            $table->foreignId('tenant_id')->constrained()->cascadeOnDelete();
            $table->string('name');
            $table->string('slug');
            $table->timestamps();
            $table->unique(['tenant_id', 'slug']);
        });

        Schema::create('courses', function (Blueprint $table) {
            $table->id();
            $table->foreignId('tenant_id')->constrained()->cascadeOnDelete();
            $table->foreignId('instructor_id')->nullable()->constrained('users')->nullOnDelete();
            $table->foreignId('category_id')->nullable()->constrained()->nullOnDelete();
            $table->string('title');
            $table->string('slug');
            $table->string('short_description', 500)->nullable();
            $table->longText('description')->nullable();
            $table->string('thumbnail')->nullable();
            $table->string('level')->default('beginner');          // beginner | intermediate | advanced
            $table->string('language', 10)->default('en');
            $table->boolean('is_free')->default(false);
            $table->decimal('price', 10, 2)->default(0);
            $table->decimal('sale_price', 10, 2)->nullable();
            $table->string('currency', 3)->default('PKR');
            $table->string('status')->default('draft');            // draft | published | archived
            $table->timestamp('published_at')->nullable();
            $table->timestamps();
            $table->softDeletes();
            $table->unique(['tenant_id', 'slug']);
            $table->index(['tenant_id', 'status']);
        });

        Schema::create('course_sections', function (Blueprint $table) {
            $table->id();
            $table->foreignId('tenant_id')->constrained()->cascadeOnDelete();
            $table->foreignId('course_id')->constrained()->cascadeOnDelete();
            $table->string('title');
            $table->unsignedInteger('position')->default(0);
            $table->timestamps();
        });

        Schema::create('lessons', function (Blueprint $table) {
            $table->id();
            $table->foreignId('tenant_id')->constrained()->cascadeOnDelete();
            $table->foreignId('course_id')->constrained()->cascadeOnDelete();
            $table->foreignId('section_id')->constrained('course_sections')->cascadeOnDelete();
            $table->string('title');
            $table->string('type')->default('video');              // video | pdf | text | live | quiz
            $table->longText('content')->nullable();               // text body / live class notes
            $table->string('video_provider')->nullable();          // bunny | vimeo | youtube
            $table->string('video_url')->nullable();
            $table->string('file_path')->nullable();               // pdf / attachments
            $table->string('live_url')->nullable();                // zoom / meet link
            $table->timestamp('live_starts_at')->nullable();
            $table->unsignedInteger('duration_seconds')->default(0);
            $table->boolean('is_preview')->default(false);         // free preview before purchase
            $table->unsignedInteger('drip_days')->nullable();      // unlock N days after enrollment
            $table->unsignedInteger('position')->default(0);
            $table->timestamps();
        });

        Schema::create('enrollments', function (Blueprint $table) {
            $table->id();
            $table->foreignId('tenant_id')->constrained()->cascadeOnDelete();
            $table->foreignId('user_id')->constrained()->cascadeOnDelete();
            $table->foreignId('course_id')->constrained()->cascadeOnDelete();
            $table->string('status')->default('active');           // active | completed | cancelled
            $table->unsignedTinyInteger('progress_percent')->default(0);
            $table->timestamp('enrolled_at')->nullable();
            $table->timestamp('completed_at')->nullable();
            $table->timestamps();
            $table->unique(['user_id', 'course_id']);
        });

        Schema::create('lesson_progress', function (Blueprint $table) {
            $table->id();
            $table->foreignId('tenant_id')->constrained()->cascadeOnDelete();
            $table->foreignId('user_id')->constrained()->cascadeOnDelete();
            $table->foreignId('lesson_id')->constrained()->cascadeOnDelete();
            $table->unsignedInteger('last_position_seconds')->default(0);
            $table->timestamp('completed_at')->nullable();
            $table->timestamps();
            $table->unique(['user_id', 'lesson_id']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('lesson_progress');
        Schema::dropIfExists('enrollments');
        Schema::dropIfExists('lessons');
        Schema::dropIfExists('course_sections');
        Schema::dropIfExists('courses');
        Schema::dropIfExists('categories');
    }
};

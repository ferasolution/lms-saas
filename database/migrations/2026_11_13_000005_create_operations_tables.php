<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * School operations: library, transport, inventory, visitors, helpdesk,
 * parent-teacher meetings, events with consent, and direct messages.
 */
return new class extends Migration
{
    public function up(): void
    {
        $tenant = fn (Blueprint $t) => $t->foreignId('tenant_id')->constrained()->cascadeOnDelete();

        // Library
        Schema::create('library_books', function (Blueprint $t) use ($tenant) {
            $t->id(); $tenant($t);
            $t->string('title', 200);
            $t->string('author', 160)->nullable();
            $t->string('isbn', 20)->nullable();
            $t->string('category', 60)->nullable();
            $t->string('publisher', 120)->nullable();
            $t->string('shelf', 40)->nullable();
            $t->unsignedSmallInteger('copies')->default(1);
            $t->string('ebook_url', 500)->nullable();
            $t->timestamps();
            $t->index(['tenant_id', 'title']);
        });
        Schema::create('library_loans', function (Blueprint $t) use ($tenant) {
            $t->id(); $tenant($t);
            $t->foreignId('library_book_id')->constrained()->cascadeOnDelete();
            $t->foreignId('user_id')->constrained()->cascadeOnDelete();
            $t->date('issued_on');
            $t->date('due_on');
            $t->date('returned_on')->nullable();
            $t->decimal('fine', 10, 2)->default(0);
            $t->foreignId('issued_by')->nullable()->constrained('users')->nullOnDelete();
            $t->timestamps();
            $t->index(['tenant_id', 'returned_on']);
        });

        // Transport
        Schema::create('transport_routes', function (Blueprint $t) use ($tenant) {
            $t->id(); $tenant($t);
            $t->string('name', 80);
            $t->string('vehicle', 60)->nullable();
            $t->unsignedSmallInteger('capacity')->nullable();
            $t->string('driver_name', 120)->nullable();
            $t->string('driver_phone', 40)->nullable();
            $t->string('attendant_name', 120)->nullable();
            $t->json('stops')->nullable(); // [{name, pickup, drop}]
            $t->decimal('monthly_fee', 10, 2)->nullable();
            $t->timestamps();
        });
        Schema::create('transport_assignments', function (Blueprint $t) use ($tenant) {
            $t->id(); $tenant($t);
            $t->foreignId('transport_route_id')->constrained()->cascadeOnDelete();
            $t->foreignId('student_id')->unique()->constrained('users')->cascadeOnDelete();
            $t->string('stop', 120)->nullable();
            $t->timestamps();
        });

        // Inventory
        Schema::create('inventory_items', function (Blueprint $t) use ($tenant) {
            $t->id(); $tenant($t);
            $t->string('name', 120);
            $t->string('category', 60)->nullable();
            $t->string('unit', 20)->default('pcs');
            $t->integer('quantity')->default(0);
            $t->integer('min_quantity')->default(0);
            $t->string('location', 80)->nullable();
            $t->decimal('unit_cost', 10, 2)->nullable();
            $t->timestamps();
        });
        Schema::create('inventory_movements', function (Blueprint $t) use ($tenant) {
            $t->id(); $tenant($t);
            $t->foreignId('inventory_item_id')->constrained()->cascadeOnDelete();
            $t->string('kind', 10); // in | out | adjust
            $t->integer('quantity');
            $t->string('note', 200)->nullable();
            $t->foreignId('user_id')->nullable()->constrained()->nullOnDelete();
            $t->timestamps();
        });

        // Visitors
        Schema::create('visitors', function (Blueprint $t) use ($tenant) {
            $t->id(); $tenant($t);
            $t->string('name', 120);
            $t->string('phone', 40)->nullable();
            $t->string('purpose', 200);
            $t->string('host', 120)->nullable();
            $t->string('id_note', 120)->nullable();
            $t->string('badge', 20)->nullable();
            $t->timestamp('checked_in_at');
            $t->timestamp('checked_out_at')->nullable();
            $t->foreignId('logged_by')->nullable()->constrained('users')->nullOnDelete();
            $t->timestamps();
            $t->index(['tenant_id', 'checked_in_at']);
        });

        // Helpdesk
        Schema::create('tickets', function (Blueprint $t) use ($tenant) {
            $t->id(); $tenant($t);
            $t->foreignId('user_id')->constrained()->cascadeOnDelete();
            $t->foreignId('assignee_id')->nullable()->constrained('users')->nullOnDelete();
            $t->string('subject', 200);
            $t->string('category', 30)->default('general');
            $t->string('priority', 10)->default('normal');
            $t->string('status', 12)->default('open'); // open | in_progress | resolved | closed
            $t->timestamp('resolved_at')->nullable();
            $t->timestamps();
            $t->index(['tenant_id', 'status']);
        });
        Schema::create('ticket_replies', function (Blueprint $t) use ($tenant) {
            $t->id(); $tenant($t);
            $t->foreignId('ticket_id')->constrained()->cascadeOnDelete();
            $t->foreignId('user_id')->constrained()->cascadeOnDelete();
            $t->text('body');
            $t->string('attachment', 500)->nullable();
            $t->timestamps();
        });

        // Parent-teacher meetings
        Schema::create('ptm_events', function (Blueprint $t) use ($tenant) {
            $t->id(); $tenant($t);
            $t->string('title', 160);
            $t->date('date');
            $t->time('starts_at');
            $t->time('ends_at');
            $t->unsignedSmallInteger('slot_minutes')->default(10);
            $t->string('mode', 10)->default('in_person'); // in_person | online
            $t->string('location', 160)->nullable();
            $t->json('teacher_ids');
            $t->timestamps();
        });
        Schema::create('ptm_bookings', function (Blueprint $t) use ($tenant) {
            $t->id(); $tenant($t);
            $t->foreignId('ptm_event_id')->constrained()->cascadeOnDelete();
            $t->foreignId('teacher_id')->constrained('users')->cascadeOnDelete();
            $t->foreignId('parent_id')->constrained('users')->cascadeOnDelete();
            $t->foreignId('student_id')->nullable()->constrained('users')->nullOnDelete();
            $t->time('slot');
            $t->string('status', 12)->default('booked'); // booked | done | missed | cancelled
            $t->string('meeting_url', 500)->nullable();
            $t->text('notes')->nullable();
            $t->timestamps();
            $t->unique(['ptm_event_id', 'teacher_id', 'slot']);
        });

        // Events and consent
        Schema::create('school_events', function (Blueprint $t) use ($tenant) {
            $t->id(); $tenant($t);
            $t->string('title', 160);
            $t->text('description')->nullable();
            $t->string('kind', 20)->default('event'); // event | trip | sports | competition | holiday | meeting
            $t->date('date');
            $t->date('end_date')->nullable();
            $t->time('starts_at')->nullable();
            $t->string('location', 160)->nullable();
            $t->json('section_ids')->nullable(); // null = whole school
            $t->boolean('needs_consent')->default(false);
            $t->decimal('fee', 10, 2)->nullable();
            $t->foreignId('created_by')->nullable()->constrained('users')->nullOnDelete();
            $t->timestamps();
            $t->index(['tenant_id', 'date']);
        });
        Schema::create('event_responses', function (Blueprint $t) use ($tenant) {
            $t->id(); $tenant($t);
            $t->foreignId('school_event_id')->constrained()->cascadeOnDelete();
            $t->foreignId('student_id')->constrained('users')->cascadeOnDelete();
            $t->foreignId('responded_by')->constrained('users')->cascadeOnDelete();
            $t->string('response', 10); // yes | no
            $t->string('note', 300)->nullable();
            $t->timestamps();
            $t->unique(['school_event_id', 'student_id']);
        });

        // Direct messages
        Schema::create('conversations', function (Blueprint $t) use ($tenant) {
            $t->id(); $tenant($t);
            $t->string('subject', 160)->nullable();
            $t->foreignId('student_id')->nullable()->constrained('users')->nullOnDelete();
            $t->timestamp('last_message_at')->nullable();
            $t->timestamps();
        });
        Schema::create('conversation_participants', function (Blueprint $t) {
            $t->id();
            $t->foreignId('conversation_id')->constrained()->cascadeOnDelete();
            $t->foreignId('user_id')->constrained()->cascadeOnDelete();
            $t->timestamp('read_at')->nullable();
            $t->unique(['conversation_id', 'user_id']);
        });
        Schema::create('messages', function (Blueprint $t) use ($tenant) {
            $t->id(); $tenant($t);
            $t->foreignId('conversation_id')->constrained()->cascadeOnDelete();
            $t->foreignId('user_id')->constrained()->cascadeOnDelete();
            $t->text('body');
            $t->string('attachment', 500)->nullable();
            $t->timestamps();
        });
    }

    public function down(): void
    {
        foreach (['messages', 'conversation_participants', 'conversations', 'event_responses', 'school_events', 'ptm_bookings', 'ptm_events',
            'ticket_replies', 'tickets', 'visitors', 'inventory_movements', 'inventory_items', 'transport_assignments', 'transport_routes',
            'library_loans', 'library_books'] as $table) {
            Schema::dropIfExists($table);
        }
    }
};

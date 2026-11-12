<?php

namespace App\Http\Controllers\Api\School;

use App\Http\Controllers\Controller;
use App\Models\ClassSection;
use App\Models\Conversation;
use App\Models\EventResponse;
use App\Models\Message;
use App\Models\PtmBooking;
use App\Models\PtmEvent;
use App\Models\SchoolEvent;
use App\Models\SectionSubject;
use App\Models\StudentProfile;
use App\Models\Ticket;
use App\Models\TicketReply;
use App\Models\User;
use App\Services\Notifier;
use App\Services\School;
use Carbon\CarbonImmutable;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use Illuminate\Validation\Rule;

/**
 * Talking to the school: direct messages, the helpdesk, parent-teacher
 * meetings, and events with parent consent.
 */
class CommunityController extends Controller
{
    public function __construct(protected School $school) {}

    protected function isStaff(User $u): bool
    {
        return $u->hasRole(User::ROLE_ADMIN, User::ROLE_MANAGER, User::ROLE_INSTRUCTOR);
    }

    // ── Messages ─────────────────────────────────────────────────────

    /** Who the viewer can start a conversation with. */
    public function contacts(Request $request): JsonResponse
    {
        $u = $request->user();
        if ($this->isStaff($u)) {
            $term = '%'.$request->string('search').'%';
            $people = User::where('id', '!=', $u->id)->where('is_active', true)
                ->whereIn('role', [User::ROLE_ADMIN, User::ROLE_MANAGER, User::ROLE_INSTRUCTOR, User::ROLE_PARENT, User::ROLE_STUDENT])
                ->when($request->filled('search'), fn ($q) => $q->where(fn ($q) => $q->where('name', 'like', $term)->orWhere('email', 'like', $term)))
                ->orderBy('name')->limit(30)->get(['id', 'name', 'role']);

            return response()->json(['data' => $people->map(fn ($p) => $p->only('id', 'name', 'role') + ['about' => ucfirst($p->role === 'instructor' ? 'teacher' : $p->role)])]);
        }

        // Families: their children's class teachers and subject teachers, plus the office.
        $sections = StudentProfile::whereIn('user_id', $this->school->familyStudentIds($u) ?: [0])->pluck('class_section_id')->filter()->unique();
        $about = [];
        foreach (ClassSection::with('schoolClass')->whereIn('id', $sections)->get() as $s) {
            if ($s->class_teacher_id) {
                $about[$s->class_teacher_id][] = 'Class teacher, '.$s->label();
            }
        }
        foreach (SectionSubject::with(['subject', 'section.schoolClass'])->whereIn('class_section_id', $sections)->whereNotNull('teacher_id')->get() as $ss) {
            $about[$ss->teacher_id][] = $ss->subject?->name.', '.$ss->section?->label();
        }
        $office = User::whereIn('role', School::OFFICE)->where('is_active', true)->pluck('id')->all();
        $people = User::whereIn('id', array_unique(array_merge(array_keys($about), $office)))->orderBy('name')->get(['id', 'name', 'role']);

        return response()->json(['data' => $people->map(fn ($p) => $p->only('id', 'name', 'role') + ['about' => isset($about[$p->id]) ? implode(' · ', array_unique($about[$p->id])) : 'School office'])]);
    }

    public function conversations(Request $request): JsonResponse
    {
        $uid = $request->user()->id;
        $mine = DB::table('conversation_participants')->where('user_id', $uid)->pluck('read_at', 'conversation_id');
        $convs = Conversation::with('student')->whereIn('id', $mine->keys())->orderByDesc('last_message_at')->limit(100)->get();
        $people = DB::table('conversation_participants')->join('users', 'users.id', '=', 'conversation_participants.user_id')
            ->whereIn('conversation_id', $convs->pluck('id'))->where('user_id', '!=', $uid)
            ->get(['conversation_id', 'users.id', 'users.name', 'users.role'])->groupBy('conversation_id');
        $last = Message::whereIn('id', Message::whereIn('conversation_id', $convs->pluck('id'))->selectRaw('MAX(id)')->groupBy('conversation_id'))->get()->keyBy('conversation_id');

        return response()->json(['data' => $convs->map(fn ($c) => [
            'id' => $c->id, 'subject' => $c->subject, 'student' => $c->student?->only('id', 'name'),
            'with' => ($people[$c->id] ?? collect())->map(fn ($p) => ['id' => $p->id, 'name' => $p->name, 'role' => $p->role])->values(),
            'last' => isset($last[$c->id]) ? ['body' => Str::limit($last[$c->id]->body, 120), 'mine' => $last[$c->id]->user_id === $uid, 'at' => $last[$c->id]->created_at?->toIso8601String()] : null,
            'unread' => isset($last[$c->id]) && $last[$c->id]->user_id !== $uid && (! $mine[$c->id] || $last[$c->id]->created_at > CarbonImmutable::parse($mine[$c->id])),
        ])]);
    }

    public function start(Request $request): JsonResponse
    {
        $u = $request->user();
        $allowed = collect($this->contacts($request)->getData(true)['data'])->pluck('id')->all();
        $data = $request->validate([
            'to' => ['required', 'integer', Rule::in($this->isStaff($u) ? User::where('id', '!=', $u->id)->pluck('id')->all() : $allowed)],
            'subject' => ['nullable', 'string', 'max:160'],
            'student_id' => ['nullable', 'integer', Rule::exists('student_profiles', 'user_id')->where('tenant_id', $u->tenant_id)],
            'body' => ['required', 'string', 'max:5000'],
            'attachment' => ['nullable', 'string', 'max:500', 'starts_with:/storage/,https://'],
        ]);
        abort_if(! $this->isStaff($u) && ! $this->isStaff(User::findOrFail($data['to'])), 403);

        $conv = DB::transaction(function () use ($data, $u) {
            $conv = Conversation::create(['subject' => $data['subject'] ?? null, 'student_id' => $data['student_id'] ?? null, 'last_message_at' => now()]);
            DB::table('conversation_participants')->insert([
                ['conversation_id' => $conv->id, 'user_id' => $u->id, 'read_at' => now()],
                ['conversation_id' => $conv->id, 'user_id' => $data['to'], 'read_at' => null],
            ]);
            Message::create(['conversation_id' => $conv->id, 'user_id' => $u->id, 'body' => $data['body'], 'attachment' => $data['attachment'] ?? null]);

            return $conv;
        });
        $this->school->notify($data['to'], 'message', "Message from {$u->name}", Str::limit($data['body'], 140), "/messages?c={$conv->id}");

        return response()->json(['id' => $conv->id], 201);
    }

    public function thread(Request $request, Conversation $conversation): JsonResponse
    {
        $this->participant($request->user(), $conversation);
        DB::table('conversation_participants')->where('conversation_id', $conversation->id)->where('user_id', $request->user()->id)->update(['read_at' => now()]);
        $others = DB::table('conversation_participants')->where('conversation_id', $conversation->id)->where('user_id', '!=', $request->user()->id)->pluck('read_at', 'user_id');

        return response()->json([
            'id' => $conversation->id, 'subject' => $conversation->subject, 'student' => $conversation->load('student')->student?->only('id', 'name'),
            'with' => User::whereIn('id', $others->keys())->get(['id', 'name', 'role']),
            'seen_at' => $others->filter()->min(),
            'messages' => Message::with('user')->where('conversation_id', $conversation->id)->orderBy('id')->limit(500)->get()->map(fn ($m) => [
                'id' => $m->id, 'body' => $m->body, 'attachment' => $m->attachment, 'mine' => $m->user_id === $request->user()->id,
                'user' => $m->user?->only('id', 'name'), 'at' => $m->created_at?->toIso8601String(),
            ]),
        ]);
    }

    public function reply(Request $request, Conversation $conversation): JsonResponse
    {
        $this->participant($request->user(), $conversation);
        $data = $request->validate(['body' => ['required', 'string', 'max:5000'], 'attachment' => ['nullable', 'string', 'max:500', 'starts_with:/storage/,https://']]);
        $m = Message::create($data + ['conversation_id' => $conversation->id, 'user_id' => $request->user()->id]);
        $conversation->forceFill(['last_message_at' => now()])->save();
        DB::table('conversation_participants')->where('conversation_id', $conversation->id)->where('user_id', $request->user()->id)->update(['read_at' => now()]);
        $others = DB::table('conversation_participants')->where('conversation_id', $conversation->id)->where('user_id', '!=', $request->user()->id)->pluck('user_id')->all();
        $this->school->notify($others, 'message', "Reply from {$request->user()->name}", Str::limit($data['body'], 140), "/messages?c={$conversation->id}");

        return response()->json(['id' => $m->id], 201);
    }

    protected function participant(User $u, Conversation $c): void
    {
        abort_if(! DB::table('conversation_participants')->where('conversation_id', $c->id)->where('user_id', $u->id)->exists(), 404);
    }

    // ── Helpdesk ─────────────────────────────────────────────────────

    public function tickets(Request $request): JsonResponse
    {
        $u = $request->user();
        $office = $this->school->isOffice($u);
        $rows = Ticket::with(['user', 'assignee'])
            ->when(! $office, fn ($q) => $q->where(fn ($q) => $q->where('user_id', $u->id)->orWhere('assignee_id', $u->id)))
            ->when($request->filled('status'), fn ($q) => $request->input('status') === 'active' ? $q->whereIn('status', ['open', 'in_progress']) : $q->where('status', $request->string('status')))
            ->orderByRaw("CASE priority WHEN 'urgent' THEN 0 WHEN 'high' THEN 1 WHEN 'normal' THEN 2 ELSE 3 END")->latest('id')->limit(300)->get();

        return response()->json(['data' => $rows->map(fn ($t) => $this->ticketRow($t)), 'can_manage' => $office]);
    }

    public function openTicket(Request $request): JsonResponse
    {
        $data = $request->validate([
            'subject' => ['required', 'string', 'max:200'],
            'category' => ['required', Rule::in(['general', 'academic', 'fees', 'technical', 'transport', 'facilities', 'other'])],
            'priority' => ['nullable', Rule::in(['low', 'normal', 'high', 'urgent'])],
            'body' => ['required', 'string', 'max:5000'],
            'attachment' => ['nullable', 'string', 'max:500', 'starts_with:/storage/,https://'],
        ]);
        $t = DB::transaction(function () use ($data, $request) {
            $t = Ticket::create(['user_id' => $request->user()->id, 'subject' => $data['subject'], 'category' => $data['category'], 'priority' => $data['priority'] ?? 'normal']);
            TicketReply::create(['ticket_id' => $t->id, 'user_id' => $request->user()->id, 'body' => $data['body'], 'attachment' => $data['attachment'] ?? null]);

            return $t;
        });
        $this->school->notify(app(Notifier::class)->roleIds($request->user()->tenant_id, School::OFFICE), 'ticket', "New request: {$t->subject}", "From {$request->user()->name}", "/helpdesk?t={$t->id}");

        return response()->json($this->ticketRow($t->load(['user', 'assignee'])), 201);
    }

    public function ticket(Request $request, Ticket $ticket): JsonResponse
    {
        $this->canSeeTicket($request->user(), $ticket);

        return response()->json($this->ticketRow($ticket->load(['user', 'assignee'])) + [
            'replies' => TicketReply::with('user')->where('ticket_id', $ticket->id)->orderBy('id')->get()->map(fn ($r) => [
                'id' => $r->id, 'body' => $r->body, 'attachment' => $r->attachment, 'user' => $r->user?->only('id', 'name', 'role'), 'at' => $r->created_at?->toIso8601String(),
            ]),
            'staff' => $this->school->isOffice($request->user()) ? User::whereIn('role', [User::ROLE_ADMIN, User::ROLE_MANAGER, User::ROLE_INSTRUCTOR])->orderBy('name')->get(['id', 'name']) : [],
        ]);
    }

    public function replyTicket(Request $request, Ticket $ticket): JsonResponse
    {
        $this->canSeeTicket($request->user(), $ticket);
        $data = $request->validate(['body' => ['required', 'string', 'max:5000'], 'attachment' => ['nullable', 'string', 'max:500', 'starts_with:/storage/,https://']]);
        TicketReply::create($data + ['ticket_id' => $ticket->id, 'user_id' => $request->user()->id]);
        $staffReply = $request->user()->id !== $ticket->user_id;
        if ($staffReply && $ticket->status === 'open') {
            $ticket->forceFill(['status' => 'in_progress'])->save();
        }
        if (! $staffReply && $ticket->status === 'resolved') {
            $ticket->forceFill(['status' => 'open', 'resolved_at' => null])->save();
        }
        $to = $staffReply ? [$ticket->user_id] : (array_filter([$ticket->assignee_id]) ?: app(Notifier::class)->roleIds($request->user()->tenant_id, School::OFFICE));
        $this->school->notify($to, 'ticket', "Reply on: {$ticket->subject}", Str::limit($data['body'], 140), "/helpdesk?t={$ticket->id}");

        return response()->json(['ok' => true], 201);
    }

    public function updateTicket(Request $request, Ticket $ticket): JsonResponse
    {
        $data = $request->validate([
            'status' => ['sometimes', Rule::in(['open', 'in_progress', 'resolved', 'closed'])],
            'priority' => ['sometimes', Rule::in(['low', 'normal', 'high', 'urgent'])],
            'assignee_id' => ['nullable', 'integer', Rule::exists('users', 'id')->where('tenant_id', $request->user()->tenant_id)],
        ]);
        $ticket->fill($data);
        if (($data['status'] ?? null) === 'resolved') {
            $ticket->resolved_at = now();
            $this->school->notify($ticket->user_id, 'ticket', "Resolved: {$ticket->subject}", 'Reply if you still need help.', "/helpdesk?t={$ticket->id}");
        }
        if (array_key_exists('assignee_id', $data) && $data['assignee_id']) {
            $this->school->notify($data['assignee_id'], 'ticket', "Assigned to you: {$ticket->subject}", null, "/helpdesk?t={$ticket->id}");
        }
        $ticket->save();

        return response()->json($this->ticketRow($ticket->load(['user', 'assignee'])));
    }

    protected function canSeeTicket(User $u, Ticket $t): void
    {
        abort_if(! $this->school->isOffice($u) && $t->user_id !== $u->id && $t->assignee_id !== $u->id, 404);
    }

    protected function ticketRow(Ticket $t): array
    {
        return ['id' => $t->id, 'subject' => $t->subject, 'category' => $t->category, 'priority' => $t->priority, 'status' => $t->status,
            'user' => $t->user?->only('id', 'name', 'role'), 'assignee' => $t->assignee?->only('id', 'name'),
            'created_at' => $t->created_at?->toIso8601String(), 'updated_at' => $t->updated_at?->toIso8601String()];
    }

    // ── Parent-teacher meetings ──────────────────────────────────────

    public function ptmEvents(Request $request): JsonResponse
    {
        $u = $request->user();
        $events = PtmEvent::whereDate('date', '>=', now()->subDays(60)->toDateString())->orderBy('date')->get();
        $bookings = PtmBooking::with(['teacher', 'parent', 'student'])->whereIn('ptm_event_id', $events->pluck('id'))->get()->groupBy('ptm_event_id');
        $teacherNames = User::whereIn('id', $events->flatMap(fn ($e) => $e->teacher_ids ?? [])->unique())->pluck('name', 'id');

        // Families only see teachers who teach their children.
        $familyTeachers = null;
        if ($u->hasRole(User::ROLE_PARENT)) {
            $sections = StudentProfile::whereIn('user_id', $this->school->familyStudentIds($u) ?: [0])->pluck('class_section_id')->filter();
            $familyTeachers = ClassSection::whereIn('id', $sections)->pluck('class_teacher_id')
                ->merge(SectionSubject::whereIn('class_section_id', $sections)->pluck('teacher_id'))->filter()->unique()->values()->all();
        }

        return response()->json(['data' => $events->map(function (PtmEvent $e) use ($bookings, $teacherNames, $u, $familyTeachers) {
            $ids = collect($e->teacher_ids ?? [])->when($familyTeachers !== null, fn ($c) => $c->intersect($familyTeachers))
                ->when($u->hasRole(User::ROLE_INSTRUCTOR), fn ($c) => $c->filter(fn ($id) => $id === $u->id))->values();
            $taken = ($bookings[$e->id] ?? collect())->where('status', '!=', 'cancelled');

            return [
                'id' => $e->id, 'title' => $e->title, 'date' => $e->date->toDateString(), 'starts_at' => substr($e->starts_at, 0, 5), 'ends_at' => substr($e->ends_at, 0, 5),
                'slot_minutes' => $e->slot_minutes, 'mode' => $e->mode, 'location' => $e->location, 'teacher_ids' => $e->teacher_ids,
                'teachers' => $ids->map(fn ($tid) => [
                    'id' => $tid, 'name' => $teacherNames[$tid] ?? 'Teacher',
                    'slots' => collect($this->slots($e))->map(fn ($slot) => [
                        'time' => $slot,
                        'taken' => $taken->contains(fn ($b) => $b->teacher_id === $tid && substr($b->slot, 0, 5) === $slot),
                    ])->values(),
                ]),
                'bookings' => $taken->filter(fn ($b) => $this->school->isOffice($u) || $b->parent_id === $u->id || $b->teacher_id === $u->id)
                    ->sortBy('slot')->values()->map(fn ($b) => [
                        'id' => $b->id, 'slot' => substr($b->slot, 0, 5), 'status' => $b->status, 'teacher' => $b->teacher?->only('id', 'name'),
                        'parent' => $b->parent?->only('id', 'name'), 'student' => $b->student?->only('id', 'name'), 'meeting_url' => $b->meeting_url,
                        'notes' => $b->teacher_id === $u->id || $this->school->isOffice($u) ? $b->notes : null,
                    ]),
            ];
        })]);
    }

    public function storePtm(Request $request): JsonResponse
    {
        $data = $request->validate([
            'title' => ['required', 'string', 'max:160'],
            'date' => ['required', 'date', 'after_or_equal:today'],
            'starts_at' => ['required', 'date_format:H:i'],
            'ends_at' => ['required', 'date_format:H:i', 'after:starts_at'],
            'slot_minutes' => ['required', 'integer', 'min:5', 'max:60'],
            'mode' => ['required', Rule::in(['in_person', 'online'])],
            'location' => ['nullable', 'string', 'max:160'],
            'teacher_ids' => ['required', 'array', 'min:1'],
            'teacher_ids.*' => ['integer', Rule::exists('users', 'id')->where('tenant_id', $request->user()->tenant_id)],
        ]);
        $e = PtmEvent::create($data);
        $this->school->notify(app(Notifier::class)->roleIds($request->user()->tenant_id, [User::ROLE_PARENT]), 'ptm',
            "Parent-teacher meeting: {$e->title}", $e->date->format('D, M j').' · book a time with your child’s teachers', '/meetings');

        return response()->json(['id' => $e->id], 201);
    }

    public function destroyPtm(PtmEvent $event): JsonResponse
    {
        $event->delete();

        return response()->json(['ok' => true]);
    }

    public function book(Request $request, PtmEvent $event): JsonResponse
    {
        $u = $request->user();
        $family = $this->school->familyStudentIds($u);
        $data = $request->validate([
            'teacher_id' => ['required', 'integer', Rule::in($event->teacher_ids ?? [])],
            'slot' => ['required', 'date_format:H:i', Rule::in($this->slots($event))],
            'student_id' => ['nullable', 'integer', Rule::in($family)],
        ]);
        abort_if(PtmBooking::where('ptm_event_id', $event->id)->where('teacher_id', $data['teacher_id'])->where('parent_id', $u->id)->where('status', 'booked')->exists(), 422,
            'You already have a time with this teacher. Cancel it first to pick another.');
        abort_if(PtmBooking::where('ptm_event_id', $event->id)->where('teacher_id', $data['teacher_id'])->where('slot', $data['slot'].':00')->where('status', '!=', 'cancelled')->exists(), 422,
            'Someone just took that time. Please pick another.');

        PtmBooking::where('ptm_event_id', $event->id)->where('teacher_id', $data['teacher_id'])->where('slot', $data['slot'].':00')->where('status', 'cancelled')->delete();
        $b = PtmBooking::create([
            'ptm_event_id' => $event->id, 'teacher_id' => $data['teacher_id'], 'parent_id' => $u->id, 'student_id' => $data['student_id'] ?? ($family[0] ?? null),
            'slot' => $data['slot'].':00', 'meeting_url' => $event->mode === 'online' ? 'https://meet.jit.si/'.Str::slug($this->school->tenant()->slug.'-ptm-'.$event->id.'-'.Str::random(8)) : null,
        ]);
        $this->school->notify($data['teacher_id'], 'ptm', "Meeting booked: {$u->name}", $event->date->format('D, M j').' at '.$data['slot'], '/meetings');

        return response()->json(['id' => $b->id], 201);
    }

    public function updateBooking(Request $request, PtmBooking $booking): JsonResponse
    {
        $u = $request->user();
        $isParent = $booking->parent_id === $u->id;
        abort_if(! $isParent && $booking->teacher_id !== $u->id && ! $this->school->isOffice($u), 404);
        $data = $request->validate([
            'status' => ['sometimes', Rule::in($isParent ? ['cancelled'] : ['booked', 'done', 'missed', 'cancelled'])],
            'notes' => [$isParent ? 'prohibited' : 'nullable', 'string', 'max:3000'],
        ]);
        $booking->update($data);

        return response()->json(['ok' => true]);
    }

    protected function slots(PtmEvent $e): array
    {
        $out = [];
        $t = CarbonImmutable::createFromFormat('H:i', substr($e->starts_at, 0, 5));
        $end = CarbonImmutable::createFromFormat('H:i', substr($e->ends_at, 0, 5));
        while ($t->addMinutes($e->slot_minutes)->lte($end) && count($out) < 100) {
            $out[] = $t->format('H:i');
            $t = $t->addMinutes($e->slot_minutes);
        }

        return $out;
    }

    // ── Events and consent ───────────────────────────────────────────

    public function events(Request $request): JsonResponse
    {
        $u = $request->user();
        $family = $this->school->familyStudentIds($u);
        $kids = $family ? StudentProfile::with('user')->whereIn('user_id', $family)->get() : collect();

        $events = SchoolEvent::whereDate('date', '>=', $request->boolean('past') ? now()->subYear()->toDateString() : now()->subDays(1)->toDateString())
            ->orderBy('date')->limit(200)->get()
            ->filter(fn ($e) => ! $family || ! $e->section_ids || $kids->pluck('class_section_id')->intersect($e->section_ids)->isNotEmpty())->values();
        $responses = EventResponse::whereIn('school_event_id', $events->pluck('id'))->get()->groupBy('school_event_id');
        $labels = $this->school->sectionLabels();

        return response()->json(['data' => $events->map(function (SchoolEvent $e) use ($family, $kids, $responses, $labels) {
            $rs = $responses[$e->id] ?? collect();
            $row = [
                'id' => $e->id, 'title' => $e->title, 'description' => $e->description, 'kind' => $e->kind, 'date' => $e->date->toDateString(),
                'end_date' => $e->end_date?->toDateString(), 'starts_at' => $e->starts_at ? substr($e->starts_at, 0, 5) : null, 'location' => $e->location,
                'sections' => $e->section_ids ? collect($e->section_ids)->map(fn ($id) => $labels[$id] ?? null)->filter()->values() : null,
                'section_ids' => $e->section_ids, 'needs_consent' => $e->needs_consent, 'fee' => $e->fee,
            ];
            if ($family) {
                $row['children'] = $kids->filter(fn ($k) => ! $e->section_ids || in_array($k->class_section_id, $e->section_ids, true))->map(fn ($k) => [
                    'id' => $k->user_id, 'name' => $k->user?->name, 'response' => $rs->firstWhere('student_id', $k->user_id)?->response,
                ])->values();
            } else {
                $row['responses'] = ['yes' => $rs->where('response', 'yes')->count(), 'no' => $rs->where('response', 'no')->count()];
            }

            return $row;
        })]);
    }

    public function storeEvent(Request $request): JsonResponse
    {
        $data = $this->eventRules($request);
        $e = SchoolEvent::create($data + ['created_by' => $request->user()->id]);
        $title = ($e->needs_consent ? 'Permission needed: ' : 'Event: ').$e->title;
        $body = $e->date->format('D, M j').($e->location ? " · {$e->location}" : '');
        if ($e->section_ids) {
            foreach ($e->section_ids as $sid) {
                $this->school->notifySection($sid, 'event', $title, $body, '/events');
            }
        } else {
            $this->school->notify(app(Notifier::class)->roleIds($request->user()->tenant_id, [User::ROLE_PARENT, User::ROLE_STUDENT, User::ROLE_INSTRUCTOR]), 'event', $title, $body, '/events');
        }

        return response()->json(['id' => $e->id], 201);
    }

    public function updateEvent(Request $request, SchoolEvent $event): JsonResponse
    {
        $event->update($this->eventRules($request, true));

        return response()->json(['ok' => true]);
    }

    public function destroyEvent(SchoolEvent $event): JsonResponse
    {
        $event->delete();

        return response()->json(['ok' => true]);
    }

    /** Parents give or refuse permission (or RSVP) for a child. */
    public function respond(Request $request, SchoolEvent $event): JsonResponse
    {
        $family = $this->school->familyStudentIds($request->user());
        $data = $request->validate([
            'student_id' => ['required', 'integer', Rule::in($family)],
            'response' => ['required', Rule::in(['yes', 'no'])],
            'note' => ['nullable', 'string', 'max:300'],
        ]);
        abort_if($event->date->lt(now()->startOfDay()), 422, 'This event has already happened.');
        EventResponse::updateOrCreate(['school_event_id' => $event->id, 'student_id' => $data['student_id']],
            ['response' => $data['response'], 'note' => $data['note'] ?? null, 'responded_by' => $request->user()->id]);

        return response()->json(['ok' => true]);
    }

    public function eventResponses(SchoolEvent $event): JsonResponse
    {
        $rs = EventResponse::with(['student', 'responder'])->where('school_event_id', $event->id)->get();

        return response()->json(['data' => $rs->map(fn ($r) => ['student' => $r->student?->only('id', 'name'), 'response' => $r->response, 'note' => $r->note,
            'by' => $r->responder?->name, 'at' => $r->updated_at?->toIso8601String()])->sortBy('student.name')->values()]);
    }

    protected function eventRules(Request $request, bool $partial = false): array
    {
        $req = $partial ? 'sometimes' : 'required';

        return $request->validate([
            'title' => [$req, 'string', 'max:160'],
            'description' => ['nullable', 'string', 'max:5000'],
            'kind' => [$req, Rule::in(['event', 'trip', 'sports', 'competition', 'holiday', 'meeting', 'exam', 'other'])],
            'date' => [$req, 'date'],
            'end_date' => ['nullable', 'date', 'after_or_equal:date'],
            'starts_at' => ['nullable', 'date_format:H:i'],
            'location' => ['nullable', 'string', 'max:160'],
            'section_ids' => ['nullable', 'array'],
            'section_ids.*' => ['integer', Rule::exists('class_sections', 'id')->where('tenant_id', $request->user()->tenant_id)],
            'needs_consent' => ['sometimes', 'boolean'],
            'fee' => ['nullable', 'numeric', 'min:0'],
        ]);
    }
}

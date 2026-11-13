<?php

namespace App\Http\Controllers\Api\School;

use App\Http\Controllers\Controller;
use App\Models\ActivityLog;
use App\Models\LiveSession;
use App\Models\LiveSessionAttendance;
use App\Models\LiveSessionRegistration;
use App\Models\StudentProfile;
use App\Models\User;
use App\Services\Notifier;
use App\Services\School;
use App\Support\Csv;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use Illuminate\Validation\Rule;
use Symfony\Component\HttpFoundation\StreamedResponse;

/**
 * Live sessions — online classes, staff trainings and webinars — held on the
 * host's own Zoom / Google Meet / Teams link. EduSphere schedules them, invites
 * the right people, takes webinar registrations, records attendance when
 * someone presses Join, and shares the recording afterwards.
 */
class LiveController extends Controller
{
    public const KINDS = ['class', 'training', 'webinar'];

    public const AUDIENCES = ['sections', 'staff', 'everyone'];

    public function __construct(protected School $school) {}

    protected function isStaff(User $u): bool
    {
        return $u->hasRole(User::ROLE_ADMIN, User::ROLE_MANAGER, User::ROLE_INSTRUCTOR);
    }

    /** Coarse query for sessions the viewer may be invited to; finish with canSee(). */
    protected function visible(User $u): Builder
    {
        $q = LiveSession::query();
        if ($this->school->isOffice($u)) {
            return $q;
        }
        if ($this->isStaff($u)) {
            return $q->where(fn ($q) => $q->where('host_id', $u->id)->orWhere('created_by', $u->id)->orWhereIn('audience', self::AUDIENCES));
        }

        return $q->whereIn('audience', ['everyone', 'sections']);
    }

    /** Exact check (section lists are JSON, so they're matched here rather than in SQL). */
    protected function seer(User $u): \Closure
    {
        if ($this->school->isOffice($u)) {
            return fn () => true;
        }
        if ($this->isStaff($u)) {
            $sections = $this->school->sectionIdsFor($u) ?? [];

            return fn (LiveSession $s) => $s->host_id === $u->id || $s->created_by === $u->id || in_array($s->audience, ['staff', 'everyone'], true)
                || ($s->audience === 'sections' && array_intersect($s->section_ids ?? [], $sections));
        }
        $sections = StudentProfile::whereIn('user_id', $this->school->familyStudentIds($u) ?: [0])->pluck('class_section_id')->filter()->map(fn ($v) => (int) $v)->unique()->values()->all();

        return fn (LiveSession $s) => $s->audience === 'everyone' || ($s->audience === 'sections' && array_intersect($s->section_ids ?? [], $sections));
    }

    protected function canSee(User $u, LiveSession $s): bool
    {
        return (bool) ($this->seer($u))($s);
    }

    protected function canManage(User $u, LiveSession $s): bool
    {
        return $this->school->isOffice($u) || $s->host_id === $u->id || $s->created_by === $u->id;
    }

    public function index(Request $request): JsonResponse
    {
        $u = $request->user();
        $past = $request->boolean('past');
        $sessions = $this->visible($u)->with('host')
            ->when($request->filled('kind'), fn ($q) => $q->where('kind', $request->string('kind')))
            ->when($past,
                fn ($q) => $q->where('starts_at', '<', now())->where('starts_at', '>=', now()->subMonths(6))->orderByDesc('starts_at'),
                fn ($q) => $q->where('starts_at', '>=', now()->subHours(6))->orderBy('starts_at'))
            ->limit(300)->get()->filter($this->seer($u))->values()
            ->when(! $past, fn ($c) => $c->filter(fn (LiveSession $s) => $s->state() !== 'ended' || $s->starts_at->isToday())->values());

        return response()->json(['data' => $this->rows($sessions, $u)]);
    }

    /** Live now and starting within 24 hours — for dashboards. */
    public function upcoming(Request $request): JsonResponse
    {
        $u = $request->user();
        $sessions = $this->visible($u)->with('host')->where('status', 'scheduled')
            ->where('starts_at', '>=', now()->subHours(4))->where('starts_at', '<=', now()->addDay())
            ->orderBy('starts_at')->limit(50)->get()->filter($this->seer($u))
            ->filter(fn (LiveSession $s) => $s->state() !== 'ended')->take(5)->values();

        return response()->json(['data' => $this->rows($sessions, $u)]);
    }

    public function show(Request $request, LiveSession $session): JsonResponse
    {
        $u = $request->user();
        abort_unless($this->canSee($u, $session), 404);

        return response()->json($this->rows(collect([$session->load('host')]), $u)[0]);
    }

    public function store(Request $request): JsonResponse
    {
        $u = $request->user();
        $data = $this->validated($request);
        $data['slug'] = $this->slug();
        $data['created_by'] = $u->id;
        $data['host_id'] ??= $u->id;
        $s = LiveSession::create($data);
        ActivityLog::record('live.created', ucfirst($s->kind).": {$s->title}");

        if ($request->boolean('notify', true)) {
            $this->announce($s, $this->kindLabel($s).": {$s->title}", $this->when($s).($s->host_id ? ' · '.$s->load('host')->host?->name : ''));
        }

        return response()->json(['id' => $s->id, 'slug' => $s->slug], 201);
    }

    public function update(Request $request, LiveSession $session): JsonResponse
    {
        abort_unless($this->canManage($request->user(), $session), 403);
        $before = $session->only('starts_at', 'recording_url', 'status');
        $session->update($this->validated($request, $session));

        if ($session->status === 'cancelled' && $before['status'] !== 'cancelled') {
            $this->announce($session, "Cancelled: {$session->title}", $this->when($session), true);
        } elseif ($session->recording_url && $session->recording_url !== $before['recording_url']) {
            $this->announce($session, "Recording ready: {$session->title}", 'Watch it any time from Live sessions.', true);
        } elseif (! $session->starts_at->equalTo($before['starts_at']) && $request->boolean('notify', true)) {
            $this->announce($session, "New time: {$session->title}", $this->when($session), true);
        }

        return response()->json(['ok' => true]);
    }

    public function destroy(Request $request, LiveSession $session): JsonResponse
    {
        abort_unless($this->canManage($request->user(), $session), 403);
        $session->delete();

        return response()->json(['ok' => true]);
    }

    /** Host sends a "starting soon" reminder. */
    public function remind(Request $request, LiveSession $session): JsonResponse
    {
        abort_unless($this->canManage($request->user(), $session), 403);
        abort_if($session->status !== 'scheduled' || $session->state() === 'ended', 422, 'This session has already ended.');
        $n = $this->announce($session, ($session->state() === 'live' ? 'Live now: ' : 'Starting soon: ').$session->title, $this->when($session).' · Press Join in Live sessions.', true);

        return response()->json(['sent' => $n]);
    }

    /** Join: records attendance and returns the meeting link. */
    public function join(Request $request, LiveSession $session): JsonResponse
    {
        $u = $request->user();
        abort_unless($this->canSee($u, $session), 404);
        $isHost = $this->canManage($u, $session);
        abort_if($session->status === 'cancelled', 422, 'This session was cancelled.');
        abort_if(! $isHost && ! $session->joinOpen(), 422, $session->state() === 'upcoming'
            ? 'Join opens 15 minutes before the start ('.$this->when($session).').'
            : 'This session has ended.'.($session->recording_url ? ' The recording is available.' : ''));

        // Parents open the link to sit with a younger child; count the student role and staff.
        if (! $u->hasRole(User::ROLE_PARENT) || $session->audience !== 'sections') {
            $row = LiveSessionAttendance::where('live_session_id', $session->id)->where('user_id', $u->id)->first();
            if ($row) {
                $row->update(['last_joined_at' => now(), 'joins' => $row->joins + 1]);
            } else {
                LiveSessionAttendance::create(['live_session_id' => $session->id, 'user_id' => $u->id, 'first_joined_at' => now(), 'last_joined_at' => now()]);
            }
        }

        return response()->json(['meeting_url' => $session->meeting_url, 'passcode' => $session->passcode]);
    }

    /** Who joined, who didn't, and webinar registrations. */
    public function attendance(Request $request, LiveSession $session): JsonResponse
    {
        abort_unless($this->canManage($request->user(), $session), 403);

        return response()->json($this->attendanceData($session));
    }

    public function exportAttendance(Request $request, LiveSession $session): StreamedResponse
    {
        abort_unless($this->canManage($request->user(), $session), 403);
        $d = $this->attendanceData($session);
        $rows = collect($d['people'])->map(fn ($p) => [$p['name'], $p['email'], $p['about'], $p['joined'] ? 'Joined' : 'Absent', $p['first_joined_at'], $p['joins']])
            ->merge(collect($d['registrations'])->map(fn ($r) => [$r['name'], $r['email'], trim('Registered '.($r['organisation'] ?? '')), $r['joined_at'] ? 'Joined' : 'Absent', $r['joined_at'], $r['joined_at'] ? 1 : 0]));

        return Csv::download(Str::slug($session->title).'-attendance.csv', ['Name', 'Email', 'Group', 'Status', 'First joined', 'Joins'], $rows);
    }

    // ── Public webinar page ──────────────────────────────────────────

    public function publicShow(string $slug): JsonResponse
    {
        $s = $this->publicSession($slug);
        $t = $this->school->tenant();
        $count = $s->registrations()->count();

        return response()->json([
            'institute' => ['name' => $t->name, 'logo' => data_get($t->settings, 'logo_url'), 'timezone' => data_get($t->settings, 'timezone')],
            'session' => [
                'title' => $s->title, 'description' => $s->description, 'kind' => $s->kind, 'starts_at' => $s->starts_at->toIso8601String(),
                'ends_at' => $s->endsAt()->toIso8601String(), 'duration_minutes' => $s->duration_minutes, 'host' => $s->load('host')->host?->name,
                'provider' => $s->provider(), 'state' => $s->state(), 'recording_url' => $s->recording_url,
                'seats_left' => $s->capacity ? max(0, $s->capacity - $count) : null,
            ],
        ]);
    }

    public function register(Request $request, string $slug): JsonResponse
    {
        $s = $this->publicSession($slug);
        abort_if($s->state() === 'ended', 422, 'Registration has closed — this webinar has ended.');
        $data = $request->validate([
            'name' => ['required', 'string', 'max:120'],
            'email' => ['required', 'email', 'max:160'],
            'phone' => ['nullable', 'string', 'max:40'],
            'organisation' => ['nullable', 'string', 'max:160'],
            'website' => ['prohibited'],
        ]);
        unset($data['website']);
        $data['email'] = Str::lower($data['email']);

        $reg = DB::transaction(function () use ($s, $data) {
            $existing = LiveSessionRegistration::where('live_session_id', $s->id)->where('email', $data['email'])->lockForUpdate()->first();
            if ($existing) {
                return $existing;
            }
            abort_if($s->capacity && LiveSessionRegistration::where('live_session_id', $s->id)->count() >= $s->capacity, 422, 'Sorry, this webinar is full.');

            return LiveSessionRegistration::create($data + ['live_session_id' => $s->id, 'token' => Str::random(32)]);
        });

        if ($reg->wasRecentlyCreated && $s->host_id) {
            $this->school->notify($s->host_id, 'live', "New registration: {$s->title}", "{$reg->name}".($reg->organisation ? " · {$reg->organisation}" : ''), "/live?s={$s->id}");
        }

        return response()->json(['token' => $reg->token, 'name' => $reg->name], $reg->wasRecentlyCreated ? 201 : 200);
    }

    /** A registered guest joins with their personal token. */
    public function publicJoin(Request $request, string $slug): JsonResponse
    {
        $s = $this->publicSession($slug);
        $reg = LiveSessionRegistration::where('live_session_id', $s->id)->where('token', (string) $request->query('t'))->first();
        abort_if(! $reg, 403, 'This join link isn’t valid. Please register again with the same email.');
        abort_if(! $s->joinOpen(), 422, $s->state() === 'upcoming' ? 'Join opens 15 minutes before the start.' : 'This webinar has ended.');
        $reg->joined_at ??= now();
        $reg->save();

        return response()->json(['meeting_url' => $s->meeting_url, 'passcode' => $s->passcode, 'name' => $reg->name]);
    }

    // ── Helpers ──────────────────────────────────────────────────────

    protected function publicSession(string $slug): LiveSession
    {
        return LiveSession::where('slug', $slug)->where('is_public', true)->where('status', 'scheduled')->firstOrFail();
    }

    protected function validated(Request $request, ?LiveSession $existing = null): array
    {
        $u = $request->user();
        $tid = $u->tenant_id;
        $sometimes = $existing ? 'sometimes' : 'required';
        $data = $request->validate([
            'kind' => [$sometimes, Rule::in(self::KINDS)],
            'title' => [$sometimes, 'string', 'max:160'],
            'description' => ['nullable', 'string', 'max:5000'],
            'starts_at' => [$sometimes, 'date', ...($existing ? [] : ['after:-1 hour'])],
            'duration_minutes' => [$sometimes, 'integer', 'min:5', 'max:600'],
            'meeting_url' => [$sometimes, 'url:https', 'max:500'],
            'passcode' => ['nullable', 'string', 'max:60'],
            'audience' => [$sometimes, Rule::in(self::AUDIENCES)],
            'section_ids' => ['nullable', 'array'],
            'section_ids.*' => ['integer', Rule::exists('class_sections', 'id')->where('tenant_id', $tid)],
            'is_public' => ['sometimes', 'boolean'],
            'capacity' => ['nullable', 'integer', 'min:1', 'max:100000'],
            'host_id' => ['nullable', 'integer', Rule::exists('users', 'id')->where('tenant_id', $tid)->whereIn('role', [User::ROLE_ADMIN, User::ROLE_MANAGER, User::ROLE_INSTRUCTOR])],
            'recording_url' => ['nullable', 'url:https', 'max:500'],
            'status' => ['sometimes', Rule::in(['scheduled', 'cancelled'])],
            'notify' => ['sometimes', 'boolean'],
        ]);
        unset($data['notify']);

        $kind = $data['kind'] ?? $existing?->kind;
        $audience = $data['audience'] ?? $existing?->audience;
        $sections = array_key_exists('section_ids', $data) ? array_values(array_unique(array_map('intval', $data['section_ids'] ?? []))) : ($existing?->section_ids ?? []);

        if ($kind === 'training') {
            $audience = 'staff';
        }
        if ($audience === 'sections') {
            abort_if(! $sections, 422, 'Choose at least one class for this session.');
            if (! $this->school->isOffice($u)) {
                foreach ($sections as $id) {
                    abort_unless($this->school->canTeach($u, $id), 403, 'You can only schedule classes for sections you teach.');
                }
            }
        } else {
            $sections = null;
        }
        abort_if($kind === 'training' && ! $this->school->isOffice($u) && ! $existing, 403, 'Only the office can schedule staff trainings.');
        abort_if(! $this->school->isOffice($u) && isset($data['host_id']) && $data['host_id'] !== $u->id, 403, 'Only the office can schedule a session for someone else.');

        $data['audience'] = $audience;
        $data['section_ids'] = $sections;
        if (isset($data['starts_at'])) {
            $data['starts_at'] = Carbon::parse($data['starts_at'])->utc();
        }
        if ($kind !== 'webinar') {
            $data['is_public'] = false;
        }

        return $data;
    }

    protected function slug(): string
    {
        do {
            $slug = Str::lower(Str::random(10));
        } while (LiveSession::withoutGlobalScopes()->where('slug', $slug)->exists());

        return $slug;
    }

    /** Invited user ids: students + parents of sections, staff, or everyone. */
    protected function audienceIds(LiveSession $s, bool $withParents = true): array
    {
        $tid = $this->school->tenant()->id;
        $notifier = app(Notifier::class);
        $staff = [User::ROLE_ADMIN, User::ROLE_MANAGER, User::ROLE_INSTRUCTOR];

        $ids = match ($s->audience) {
            'staff' => $notifier->roleIds($tid, $staff),
            'everyone' => $notifier->roleIds($tid, [...$staff, User::ROLE_STUDENT, User::ROLE_PARENT]),
            default => (function () use ($s, $withParents) {
                $students = StudentProfile::whereIn('class_section_id', $s->section_ids ?? [0])->where('status', 'active')->pluck('user_id')->all();

                return $withParents ? array_merge($students, $this->school->guardianIds($students)) : $students;
            })(),
        };

        return array_values(array_diff(array_unique($ids), [$s->host_id]));
    }

    protected function announce(LiveSession $s, string $title, string $body, bool $includeHost = false): int
    {
        $ids = $this->audienceIds($s);
        if ($includeHost && $s->host_id && $s->host_id !== request()->user()?->id) {
            $ids[] = $s->host_id;
        }
        $this->school->notify($ids, 'live', $title, $body, "/live?s={$s->id}");

        return count($ids);
    }

    protected function attendanceData(LiveSession $s): array
    {
        $joined = LiveSessionAttendance::where('live_session_id', $s->id)->get()->keyBy('user_id');
        $invited = $this->audienceIds($s, false);
        $labels = $this->school->sectionLabels();
        $sectionOf = StudentProfile::whereIn('user_id', $invited)->pluck('class_section_id', 'user_id');
        $people = User::whereIn('id', array_unique(array_merge($invited, $joined->keys()->all())))
            ->when($s->audience === 'everyone', fn ($q) => $q->whereIn('id', $joined->keys()))
            ->orderBy('name')->get(['id', 'name', 'email', 'role'])
            ->map(function (User $p) use ($joined, $sectionOf, $labels) {
                $a = $joined[$p->id] ?? null;

                return [
                    'id' => $p->id, 'name' => $p->name, 'email' => $p->email,
                    'about' => isset($sectionOf[$p->id]) ? ($labels[$sectionOf[$p->id]] ?? 'Student') : ucfirst($p->role === 'instructor' ? 'teacher' : $p->role),
                    'joined' => (bool) $a, 'first_joined_at' => $a?->first_joined_at?->toIso8601String(), 'joins' => $a?->joins ?? 0,
                ];
            })->sortBy([['joined', 'desc'], ['name', 'asc']])->values();

        $regs = $s->registrations()->orderBy('created_at')->get()->map(fn ($r) => [
            'id' => $r->id, 'name' => $r->name, 'email' => $r->email, 'phone' => $r->phone, 'organisation' => $r->organisation,
            'registered_at' => $r->created_at?->toIso8601String(), 'joined_at' => $r->joined_at?->toIso8601String(),
        ]);

        return [
            'people' => $people,
            'registrations' => $regs,
            'summary' => [
                'invited' => $s->audience === 'everyone' ? null : $people->count(),
                'joined' => $people->where('joined', true)->count() + $regs->whereNotNull('joined_at')->count(),
                'registered' => $regs->count(),
            ],
        ];
    }

    protected function rows($sessions, User $u): array
    {
        $ids = $sessions->pluck('id');
        $mine = LiveSessionAttendance::whereIn('live_session_id', $ids)->where('user_id', $u->id)->pluck('live_session_id')->flip();
        $joins = LiveSessionAttendance::whereIn('live_session_id', $ids)->selectRaw('live_session_id, COUNT(*) as n')->groupBy('live_session_id')->pluck('n', 'live_session_id');
        $regs = LiveSessionRegistration::whereIn('live_session_id', $ids)->selectRaw('live_session_id, COUNT(*) as n, SUM(CASE WHEN joined_at IS NULL THEN 0 ELSE 1 END) as j')->groupBy('live_session_id')->get()->keyBy('live_session_id');
        $labels = $this->school->sectionLabels();

        return $sessions->map(function (LiveSession $s) use ($u, $mine, $joins, $regs, $labels) {
            $manage = $this->canManage($u, $s);
            $r = $regs[$s->id] ?? null;

            return [
                'id' => $s->id, 'kind' => $s->kind, 'title' => $s->title, 'description' => $s->description,
                'starts_at' => $s->starts_at->toIso8601String(), 'ends_at' => $s->endsAt()->toIso8601String(), 'duration_minutes' => $s->duration_minutes,
                'host' => $s->host?->only('id', 'name'), 'provider' => $s->provider(), 'state' => $s->state(), 'status' => $s->status,
                'join_open' => $s->joinOpen(), 'audience' => $s->audience, 'section_ids' => $s->section_ids,
                'sections' => $s->section_ids ? collect($s->section_ids)->map(fn ($id) => $labels[$id] ?? null)->filter()->values() : null,
                'is_public' => $s->is_public, 'slug' => $s->is_public ? $s->slug : null, 'capacity' => $s->capacity,
                'recording_url' => $s->recording_url, 'attended' => isset($mine[$s->id]), 'can_manage' => $manage,
                // The link itself only goes to hosts; everyone else gets it through Join, so attendance is recorded.
                'meeting_url' => $manage ? $s->meeting_url : null, 'passcode' => $manage ? $s->passcode : null,
                'stats' => $manage ? ['joined' => (int) ($joins[$s->id] ?? 0) + (int) ($r->j ?? 0), 'registered' => (int) ($r->n ?? 0)] : null,
            ];
        })->values()->all();
    }

    protected function kindLabel(LiveSession $s): string
    {
        return ['class' => 'Online class', 'training' => 'Staff training', 'webinar' => 'Webinar'][$s->kind] ?? 'Live session';
    }

    protected function when(LiveSession $s): string
    {
        $tz = data_get($this->school->tenant()->settings, 'timezone') ?: config('app.timezone');

        return $s->starts_at->copy()->setTimezone($tz)->format('D, M j · g:i A');
    }
}

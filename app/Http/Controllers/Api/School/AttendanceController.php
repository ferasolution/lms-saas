<?php

namespace App\Http\Controllers\Api\School;

use App\Http\Controllers\Controller;
use App\Models\AttendanceRecord;
use App\Models\ClassSection;
use App\Models\LeaveRequest;
use App\Models\StudentProfile;
use App\Models\User;
use App\Services\School;
use App\Support\Csv;
use Carbon\CarbonImmutable;
use Carbon\CarbonPeriod;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\Rule;
use Symfony\Component\HttpFoundation\StreamedResponse;

/**
 * Daily student attendance with parent alerts, monthly registers and leave requests.
 */
class AttendanceController extends Controller
{
    public const STATUSES = ['present', 'absent', 'late', 'excused', 'leave'];

    public function __construct(protected School $school) {}

    /** The register for one section on one day. */
    public function sheet(Request $request): JsonResponse
    {
        $data = $request->validate([
            'section_id' => ['required', 'integer'],
            'date' => ['nullable', 'date', 'before_or_equal:today'],
        ]);
        $section = ClassSection::with('schoolClass')->findOrFail($data['section_id']);
        abort_if(! $this->school->canTeach($request->user(), $section->id), 403);
        $date = $data['date'] ?? now()->toDateString();

        $records = AttendanceRecord::where('class_section_id', $section->id)->whereDate('date', $date)->get()->keyBy('student_id');
        $leave = LeaveRequest::where('status', 'approved')->whereDate('from_date', '<=', $date)->whereDate('to_date', '>=', $date)->pluck('student_id')->flip();

        $students = StudentProfile::with('user')->where('class_section_id', $section->id)->where('status', 'active')->get()
            ->sortBy(fn ($p) => [is_numeric($p->roll_no) ? (int) $p->roll_no : PHP_INT_MAX, $p->user?->name])->values();

        return response()->json([
            'section' => ['id' => $section->id, 'label' => $section->label()],
            'date' => $date,
            'taken' => $records->isNotEmpty(),
            'students' => $students->map(fn ($p) => [
                'id' => $p->user_id,
                'name' => $p->user?->name,
                'roll_no' => $p->roll_no,
                'admission_no' => $p->admission_no,
                'status' => $records[$p->user_id]->status ?? (isset($leave[$p->user_id]) ? 'leave' : null),
                'note' => $records[$p->user_id]->note ?? null,
                'on_leave' => isset($leave[$p->user_id]),
            ]),
        ]);
    }

    /** Save the register. Parents hear about absences and late arrivals. */
    public function save(Request $request): JsonResponse
    {
        $data = $request->validate([
            'section_id' => ['required', 'integer'],
            'date' => ['required', 'date', 'before_or_equal:today'],
            'records' => ['required', 'array', 'max:500'],
            'records.*.student_id' => ['required', 'integer'],
            'records.*.status' => ['required', Rule::in(self::STATUSES)],
            'records.*.note' => ['nullable', 'string', 'max:200'],
        ]);
        $section = ClassSection::with('schoolClass')->findOrFail($data['section_id']);
        abort_if(! $this->school->canTeach($request->user(), $section->id), 403);

        $allowed = array_flip($this->school->studentIdsIn($section->id));
        $date = CarbonImmutable::parse($data['date'])->toDateString();
        $before = AttendanceRecord::where('class_section_id', $section->id)->whereDate('date', $date)->pluck('status', 'student_id');

        $alerts = ['absent' => [], 'late' => []];
        DB::transaction(function () use ($data, $section, $allowed, $date, $before, $request, &$alerts) {
            foreach ($data['records'] as $r) {
                if (! isset($allowed[$r['student_id']])) {
                    continue;
                }
                $rec = AttendanceRecord::firstOrNew(['student_id' => $r['student_id'], 'date' => $date]);
                $rec->class_section_id = $section->id;
                $rec->status = $r['status'];
                $rec->note = $r['note'] ?? null;
                $rec->marked_by = $request->user()->id;
                $rec->save();

                if (isset($alerts[$r['status']]) && ($before[$r['student_id']] ?? null) !== $r['status']) {
                    $alerts[$r['status']][] = $r['student_id'];
                }
            }
        });

        $names = User::whereIn('id', array_merge($alerts['absent'], $alerts['late']))->pluck('name', 'id');
        $day = CarbonImmutable::parse($date)->format('D, M j');
        foreach ($alerts as $status => $ids) {
            foreach ($ids as $id) {
                $guardians = $this->school->guardianIds([$id]);
                $this->school->notify($guardians, "attendance_{$status}",
                    $status === 'absent' ? "{$names[$id]} was marked absent today" : "{$names[$id]} arrived late today",
                    "{$section->label()} · {$day}", '/family');
            }
        }

        return response()->json(['saved' => count($data['records']), 'alerts' => count($alerts['absent']) + count($alerts['late'])]);
    }

    /** Month register: students × days, plus totals. */
    public function month(Request $request): JsonResponse
    {
        $data = $request->validate(['section_id' => ['required', 'integer'], 'month' => ['nullable', 'date_format:Y-m']]);
        $section = ClassSection::with('schoolClass')->findOrFail($data['section_id']);
        abort_if(! $this->school->canTeach($request->user(), $section->id), 403);

        [$start, $end] = $this->monthRange($data['month'] ?? null);
        $records = AttendanceRecord::where('class_section_id', $section->id)->whereBetween('date', [$start, $end])->get()
            ->groupBy('student_id');
        $students = StudentProfile::with('user')->where('class_section_id', $section->id)->where('status', 'active')->get()->sortBy('user.name')->values();
        $days = AttendanceRecord::where('class_section_id', $section->id)->whereBetween('date', [$start, $end])
            ->distinct()->orderBy('date')->pluck('date')->map(fn ($d) => CarbonImmutable::parse($d)->toDateString())->unique()->values();

        return response()->json([
            'section' => ['id' => $section->id, 'label' => $section->label()],
            'month' => $start->format('Y-m'),
            'days' => $days,
            'students' => $students->map(function ($p) use ($records) {
                $mine = ($records[$p->user_id] ?? collect())->mapWithKeys(fn ($r) => [$r->date->toDateString() => $r->status]);
                $present = $mine->filter(fn ($s) => in_array($s, ['present', 'late'], true))->count();

                return [
                    'id' => $p->user_id, 'name' => $p->user?->name, 'roll_no' => $p->roll_no,
                    'days' => $mine,
                    'present' => $present,
                    'absent' => $mine->filter(fn ($s) => $s === 'absent')->count(),
                    'late' => $mine->filter(fn ($s) => $s === 'late')->count(),
                    'percent' => $mine->count() ? round($present / $mine->count() * 100) : null,
                ];
            }),
        ]);
    }

    public function exportMonth(Request $request): StreamedResponse
    {
        $json = $this->month($request)->getData(true);
        $short = ['present' => 'P', 'absent' => 'A', 'late' => 'L', 'excused' => 'E', 'leave' => 'LV'];

        return Csv::download("attendance-{$json['month']}.csv",
            array_merge(['Roll', 'Student'], array_map(fn ($d) => substr($d, 8), $json['days']), ['Present', 'Absent', 'Late', '%']),
            array_map(fn ($s) => array_merge([$s['roll_no'], $s['name']],
                array_map(fn ($d) => $short[$s['days'][$d] ?? ''] ?? '', $json['days']),
                [$s['present'], $s['absent'], $s['late'], $s['percent']]), $json['students']));
    }

    /** Today across the school, for the dashboard. */
    public function today(Request $request): JsonResponse
    {
        $ids = $this->school->sectionIdsFor($request->user());
        $sections = ClassSection::with('schoolClass')->when($ids !== null, fn ($q) => $q->whereIn('id', $ids ?: [0]))->get();
        $date = now()->toDateString();
        $stats = AttendanceRecord::whereDate('date', $date)->whereIn('class_section_id', $sections->pluck('id'))
            ->selectRaw('class_section_id, status, COUNT(*) as n')->groupBy('class_section_id', 'status')->get()->groupBy('class_section_id');
        $sizes = StudentProfile::where('status', 'active')->whereIn('class_section_id', $sections->pluck('id'))
            ->selectRaw('class_section_id, COUNT(*) as n')->groupBy('class_section_id')->pluck('n', 'class_section_id');

        $rows = $sections->map(function ($s) use ($stats, $sizes) {
            $by = ($stats[$s->id] ?? collect())->pluck('n', 'status');

            return [
                'id' => $s->id, 'label' => $s->label(), 'students' => (int) ($sizes[$s->id] ?? 0),
                'taken' => $by->isNotEmpty(),
                'present' => (int) (($by['present'] ?? 0) + ($by['late'] ?? 0)),
                'absent' => (int) ($by['absent'] ?? 0),
                'late' => (int) ($by['late'] ?? 0),
                'leave' => (int) (($by['leave'] ?? 0) + ($by['excused'] ?? 0)),
            ];
        })->sortBy('label')->values();

        $marked = $rows->sum(fn ($r) => $r['present'] + $r['absent'] + $r['leave']);

        return response()->json([
            'date' => $date,
            'sections' => $rows,
            'totals' => [
                'students' => $rows->sum('students'), 'present' => $rows->sum('present'), 'absent' => $rows->sum('absent'),
                'late' => $rows->sum('late'), 'pending_sections' => $rows->where('taken', false)->where('students', '>', 0)->count(),
                'percent' => $marked ? round($rows->sum('present') / $marked * 100) : null,
            ],
        ]);
    }

    // ── Leave ────────────────────────────────────────────────────────

    public function leaves(Request $request): JsonResponse
    {
        $user = $request->user();
        $family = $this->school->familyStudentIds($user);
        $sections = $this->school->sectionIdsFor($user);

        $q = LeaveRequest::with(['student', 'requester'])
            ->when($family, fn ($q) => $q->whereIn('student_id', $family))
            ->when(! $family && $sections !== null, fn ($q) => $q->whereIn('student_id',
                StudentProfile::whereIn('class_section_id', $sections ?: [0])->pluck('user_id')))
            ->when($request->filled('status'), fn ($q) => $q->where('status', $request->string('status')))
            ->latest('id')->limit(200)->get();

        $labels = $this->school->sectionLabels();
        $sectionOf = StudentProfile::whereIn('user_id', $q->pluck('student_id'))->pluck('class_section_id', 'user_id');

        return response()->json(['data' => $q->map(fn (LeaveRequest $l) => [
            'id' => $l->id,
            'student' => ['id' => $l->student_id, 'name' => $l->student?->name, 'section' => $labels[$sectionOf[$l->student_id] ?? 0] ?? null],
            'requested_by' => $l->requester?->only('id', 'name'),
            'from_date' => $l->from_date->toDateString(),
            'to_date' => $l->to_date->toDateString(),
            'days' => $l->from_date->diffInDays($l->to_date) + 1,
            'reason' => $l->reason,
            'attachment' => $l->attachment,
            'status' => $l->status,
            'reviewed_at' => $l->reviewed_at?->toIso8601String(),
            'created_at' => $l->created_at?->toIso8601String(),
            'can_review' => ! $family && $l->status === 'pending',
        ])]);
    }

    /** Parents (or the student) ask for leave. */
    public function requestLeave(Request $request): JsonResponse
    {
        $family = $this->school->familyStudentIds($request->user());
        $data = $request->validate([
            'student_id' => ['required', 'integer', Rule::in($family)],
            'from_date' => ['required', 'date', 'after_or_equal:'.now()->subDays(14)->toDateString()],
            'to_date' => ['required', 'date', 'after_or_equal:from_date', 'before:'.now()->addDays(120)->toDateString()],
            'reason' => ['required', 'string', 'max:1000'],
            'attachment' => ['nullable', 'string', 'max:500'],
        ]);
        abort_if(CarbonImmutable::parse($data['from_date'])->diffInDays($data['to_date']) > 60, 422, 'Ask for at most 60 days at a time.');

        $leave = new LeaveRequest($data);
        $leave->requested_by = $request->user()->id;
        $leave->save();

        $profile = StudentProfile::with('section')->where('user_id', $data['student_id'])->first();
        $to = array_filter([$profile?->section?->class_teacher_id]);
        $to = array_merge($to, app(\App\Services\Notifier::class)->roleIds($request->user()->tenant_id, School::OFFICE));
        $name = User::find($data['student_id'])?->name;
        $this->school->notify(array_unique($to), 'leave', "Leave request for {$name}", $data['reason'], '/attendance?tab=leave');

        return response()->json(['id' => $leave->id], 201);
    }

    public function reviewLeave(Request $request, LeaveRequest $leave): JsonResponse
    {
        abort_if($leave->status !== 'pending', 422, 'This request was already decided.');
        $profile = StudentProfile::where('user_id', $leave->student_id)->first();
        abort_if($profile?->class_section_id && ! $this->school->canTeach($request->user(), $profile->class_section_id), 403);
        $data = $request->validate(['status' => ['required', Rule::in(['approved', 'rejected'])]]);

        DB::transaction(function () use ($leave, $data, $request, $profile) {
            $leave->forceFill(['status' => $data['status'], 'reviewed_by' => $request->user()->id, 'reviewed_at' => now()])->save();

            // Approved leave fills the register for those days (keeps anything already marked present).
            if ($data['status'] === 'approved' && $profile?->class_section_id) {
                foreach (CarbonPeriod::create($leave->from_date, $leave->to_date) as $day) {
                    $rec = AttendanceRecord::firstOrNew(['student_id' => $leave->student_id, 'date' => $day->toDateString()]);
                    if ($rec->exists && in_array($rec->status, ['present', 'late'], true)) {
                        continue;
                    }
                    $rec->class_section_id = $profile->class_section_id;
                    $rec->status = 'leave';
                    $rec->note = 'Approved leave';
                    $rec->marked_by = $request->user()->id;
                    $rec->save();
                }
            }
        });

        $this->school->notify(array_unique(array_filter([$leave->requested_by, $leave->student_id])), 'leave_'.$data['status'],
            'Leave '.($data['status'] === 'approved' ? 'approved' : 'not approved'),
            $leave->from_date->format('M j').' – '.$leave->to_date->format('M j'), '/family');

        return response()->json(['ok' => true]);
    }

    protected function monthRange(?string $month): array
    {
        $start = $month ? CarbonImmutable::createFromFormat('Y-m-d', $month.'-01')->startOfDay() : CarbonImmutable::now()->startOfMonth();

        return [$start, $start->endOfMonth()];
    }
}

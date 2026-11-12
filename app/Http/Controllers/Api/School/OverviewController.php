<?php

namespace App\Http\Controllers\Api\School;

use App\Http\Controllers\Controller;
use App\Models\AdmissionApplication;
use App\Models\AttendanceRecord;
use App\Models\ClassSection;
use App\Models\DiaryEntry;
use App\Models\HomeworkSubmission;
use App\Models\LeaveRequest;
use App\Models\StudentProfile;
use App\Models\TimetableSlot;
use App\Models\User;
use App\Services\School;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/**
 * Dashboards: the school office overview, a teacher's day, and the family view
 * (parents see each child; students see themselves).
 */
class OverviewController extends Controller
{
    public function __construct(protected School $school) {}

    public function office(Request $request): JsonResponse
    {
        $today = now()->toDateString();
        $att = AttendanceRecord::whereDate('date', $today)->selectRaw('status, COUNT(*) as n')->groupBy('status')->pluck('n', 'status');
        $marked = (int) $att->sum();
        $present = (int) (($att['present'] ?? 0) + ($att['late'] ?? 0));
        $sectionsWithStudents = StudentProfile::where('status', 'active')->whereNotNull('class_section_id')->distinct()->pluck('class_section_id');
        $taken = AttendanceRecord::whereDate('date', $today)->distinct()->pluck('class_section_id');

        return response()->json([
            'students' => StudentProfile::where('status', 'active')->count(),
            'unplaced' => StudentProfile::where('status', 'active')->whereNull('class_section_id')->count(),
            'teachers' => User::where('role', User::ROLE_INSTRUCTOR)->where('is_active', true)->count(),
            'parents' => User::where('role', User::ROLE_PARENT)->where('is_active', true)->count(),
            'sections' => ClassSection::count(),
            'attendance' => [
                'percent' => $marked ? round($present / $marked * 100) : null,
                'present' => $present,
                'absent' => (int) ($att['absent'] ?? 0),
                'pending_sections' => $sectionsWithStudents->diff($taken)->count(),
            ],
            'admissions' => AdmissionApplication::whereIn('status', ['new', 'reviewing', 'interview'])->count(),
            'leave_pending' => LeaveRequest::where('status', 'pending')->count(),
            'diary_today' => DiaryEntry::whereDate('date', $today)->count(),
        ]);
    }

    /** A teacher's (or office member's) day. */
    public function teacher(Request $request): JsonResponse
    {
        $user = $request->user();
        $weekday = now()->dayOfWeekIso;
        $sections = $this->school->sectionIdsFor($user) ?? [];
        $taken = AttendanceRecord::whereDate('date', now()->toDateString())->whereIn('class_section_id', $sections)->distinct()->pluck('class_section_id')->all();
        $toCheck = HomeworkSubmission::where('status', 'submitted')
            ->whereIn('diary_entry_id', DiaryEntry::where('teacher_id', $user->id)->pluck('id'))->count();

        return response()->json([
            'today' => TimetableSlot::with(['subject', 'section.schoolClass'])->where('teacher_id', $user->id)->where('weekday', $weekday)
                ->orderBy('starts_at')->get()->map(fn ($s) => [
                    'starts_at' => substr($s->starts_at, 0, 5), 'ends_at' => substr($s->ends_at, 0, 5),
                    'subject' => $s->subject?->name, 'section' => $s->section?->label(), 'section_id' => $s->class_section_id,
                    'room' => $s->room, 'meeting_url' => $s->meeting_url,
                ]),
            'attendance_pending' => $this->school->sectionLabels(array_values(array_diff($sections, $taken)))
                ->filter(fn ($l, $id) => StudentProfile::where('class_section_id', $id)->where('status', 'active')->exists())
                ->map(fn ($label, $id) => ['id' => $id, 'label' => $label])->values(),
            'homework_to_check' => $toCheck,
            'leave_pending' => LeaveRequest::where('status', 'pending')
                ->whereIn('student_id', StudentProfile::whereIn('class_section_id', $sections ?: [0])->pluck('user_id'))->count(),
        ]);
    }

    /** Parents: every child. Students: themselves. */
    public function family(Request $request): JsonResponse
    {
        $ids = $this->school->familyStudentIds($request->user());
        $profiles = StudentProfile::with(['user', 'section.schoolClass', 'section.classTeacher'])->whereIn('user_id', $ids)->get();
        $weekday = now()->dayOfWeekIso;
        $today = now()->toDateString();
        $since = now()->subDays(30)->toDateString();

        return response()->json(['children' => $profiles->map(function (StudentProfile $p) use ($weekday, $today, $since) {
            $sid = $p->class_section_id;
            $att = AttendanceRecord::where('student_id', $p->user_id)->where('date', '>=', $since)->selectRaw('status, COUNT(*) as n')->groupBy('status')->pluck('n', 'status');
            $marked = (int) $att->sum();
            $homework = $sid ? DiaryEntry::where('class_section_id', $sid)->where('accepts_submissions', true)->whereDate('due_on', '>=', $today)->get(['id', 'title', 'due_on']) : collect();
            $done = HomeworkSubmission::where('student_id', $p->user_id)->whereIn('diary_entry_id', $homework->pluck('id'))->pluck('diary_entry_id')->all();

            return [
                'id' => $p->user_id,
                'name' => $p->user?->name,
                'admission_no' => $p->admission_no,
                'status' => $p->status,
                'section' => $p->section ? ['id' => $sid, 'label' => $p->section->label()] : null,
                'class_teacher' => $p->section?->classTeacher?->only('id', 'name'),
                'today_attendance' => AttendanceRecord::where('student_id', $p->user_id)->whereDate('date', $today)->value('status'),
                'attendance' => [
                    'percent' => $marked ? round((($att['present'] ?? 0) + ($att['late'] ?? 0)) / $marked * 100) : null,
                    'absent' => (int) ($att['absent'] ?? 0), 'late' => (int) ($att['late'] ?? 0), 'days' => $marked,
                ],
                'today' => $sid ? TimetableSlot::with(['subject', 'teacher'])->where('class_section_id', $sid)->where('weekday', $weekday)->orderBy('starts_at')->get()
                    ->map(fn ($s) => ['starts_at' => substr($s->starts_at, 0, 5), 'ends_at' => substr($s->ends_at, 0, 5),
                        'subject' => $s->subject?->name ?? $s->label, 'teacher' => $s->teacher?->name, 'room' => $s->room, 'meeting_url' => $s->meeting_url]) : [],
                'homework_due' => $homework->reject(fn ($h) => in_array($h->id, $done, true))->map(fn ($h) => ['id' => $h->id, 'title' => $h->title, 'due_on' => $h->due_on?->toDateString()])->values(),
                'diary' => $sid ? DiaryEntry::with('subject')->where('class_section_id', $sid)->orderByDesc('date')->orderByDesc('id')->limit(5)->get()
                    ->map(fn ($e) => ['id' => $e->id, 'kind' => $e->kind, 'title' => $e->title, 'date' => $e->date?->toDateString(), 'subject' => $e->subject?->name]) : [],
            ];
        })->values()]);
    }
}

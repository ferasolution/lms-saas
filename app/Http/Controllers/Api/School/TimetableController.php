<?php

namespace App\Http\Controllers\Api\School;

use App\Http\Controllers\Controller;
use App\Models\ClassSection;
use App\Models\StudentProfile;
use App\Models\TimetableSlot;
use App\Models\User;
use App\Services\School;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\Rule;
use Illuminate\Validation\ValidationException;

/**
 * Weekly timetables per section, with teacher double-booking checks,
 * and "my week" views for teachers, students and parents.
 */
class TimetableController extends Controller
{
    public function __construct(protected School $school) {}

    public function section(Request $request, ClassSection $section): JsonResponse
    {
        $user = $request->user();
        $family = $this->school->familyStudentIds($user);
        $allowed = $family
            ? StudentProfile::whereIn('user_id', $family)->where('class_section_id', $section->id)->exists()
            : ! $user->hasRole(User::ROLE_STUDENT, User::ROLE_PARENT);
        abort_if(! $allowed, 403);

        return response()->json([
            'section' => ['id' => $section->id, 'label' => $section->load('schoolClass')->label()],
            'slots' => $this->slots(TimetableSlot::where('class_section_id', $section->id)),
            'can_edit' => $this->school->isOffice($user),
        ]);
    }

    /** Replace a section's week. Rejects clashes with the same teacher elsewhere. */
    public function save(Request $request, ClassSection $section): JsonResponse
    {
        $tenantId = $request->user()->tenant_id;
        $data = $request->validate([
            'slots' => ['present', 'array', 'max:120'],
            'slots.*.weekday' => ['required', 'integer', 'between:1,7'],
            'slots.*.starts_at' => ['required', 'date_format:H:i'],
            'slots.*.ends_at' => ['required', 'date_format:H:i'],
            'slots.*.subject_id' => ['nullable', 'integer', Rule::exists('subjects', 'id')->where('tenant_id', $tenantId)],
            'slots.*.teacher_id' => ['nullable', 'integer', Rule::exists('users', 'id')->where('tenant_id', $tenantId)],
            'slots.*.label' => ['nullable', 'string', 'max:60'],
            'slots.*.room' => ['nullable', 'string', 'max:60'],
            'slots.*.meeting_url' => ['nullable', 'url', 'max:500'],
        ]);

        $errors = [];
        foreach ($data['slots'] as $i => $s) {
            if ($s['ends_at'] <= $s['starts_at']) {
                $errors["slots.$i.ends_at"] = 'Ends before it starts.';
                continue;
            }
            // Same section overlapping itself.
            foreach ($data['slots'] as $j => $o) {
                if ($j > $i && $o['weekday'] === $s['weekday'] && $o['starts_at'] < $s['ends_at'] && $s['starts_at'] < $o['ends_at']) {
                    $errors["slots.$j.starts_at"] = 'Overlaps another period on the same day.';
                }
            }
            if (! empty($s['teacher_id'])) {
                $clash = TimetableSlot::with(['section.schoolClass'])->where('teacher_id', $s['teacher_id'])->where('weekday', $s['weekday'])
                    ->where('class_section_id', '!=', $section->id)
                    ->where('starts_at', '<', $s['ends_at'].':00')->where('ends_at', '>', $s['starts_at'].':00')->first();
                if ($clash) {
                    $errors["slots.$i.teacher_id"] = 'This teacher is already teaching '.$clash->section?->label().' at that time.';
                }
            }
        }
        if ($errors) {
            throw ValidationException::withMessages($errors);
        }

        DB::transaction(function () use ($section, $data) {
            TimetableSlot::where('class_section_id', $section->id)->delete();
            foreach ($data['slots'] as $s) {
                TimetableSlot::create($s + ['class_section_id' => $section->id]);
            }
        });

        $this->school->notifySection($section->id, 'timetable', 'Timetable updated', $section->load('schoolClass')->label(), '/timetable', true);

        return response()->json(['slots' => $this->slots(TimetableSlot::where('class_section_id', $section->id))]);
    }

    /** The viewer's own week: teacher periods, or each child's class periods. */
    public function mine(Request $request): JsonResponse
    {
        $user = $request->user();
        $family = $this->school->familyStudentIds($user);

        if ($family) {
            $profiles = StudentProfile::with(['user', 'section.schoolClass'])->whereIn('user_id', $family)->where('status', 'active')->get();

            return response()->json(['children' => $profiles->map(fn ($p) => [
                'student' => ['id' => $p->user_id, 'name' => $p->user?->name],
                'section' => $p->section ? ['id' => $p->section->id, 'label' => $p->section->label()] : null,
                'slots' => $p->class_section_id ? $this->slots(TimetableSlot::where('class_section_id', $p->class_section_id)) : [],
            ])->values()]);
        }

        return response()->json(['slots' => $this->slots(TimetableSlot::where('teacher_id', $user->id), true)]);
    }

    protected function slots($query, bool $withSection = false): array
    {
        return $query->with(array_filter(['subject', 'teacher', $withSection ? 'section.schoolClass' : null]))
            ->orderBy('weekday')->orderBy('starts_at')->get()
            ->map(fn (TimetableSlot $s) => [
                'id' => $s->id,
                'weekday' => $s->weekday,
                'starts_at' => substr($s->starts_at, 0, 5),
                'ends_at' => substr($s->ends_at, 0, 5),
                'subject' => $s->subject?->only('id', 'name', 'color'),
                'teacher' => $s->teacher?->only('id', 'name'),
                'label' => $s->label,
                'room' => $s->room,
                'meeting_url' => $s->meeting_url,
                'section' => $withSection && $s->section ? ['id' => $s->section->id, 'label' => $s->section->label()] : null,
            ])->all();
    }
}

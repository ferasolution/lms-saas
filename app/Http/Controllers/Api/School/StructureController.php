<?php

namespace App\Http\Controllers\Api\School;

use App\Http\Controllers\Controller;
use App\Models\AcademicYear;
use App\Models\ClassSection;
use App\Models\SchoolClass;
use App\Models\SectionSubject;
use App\Models\StudentProfile;
use App\Models\Subject;
use App\Models\User;
use App\Services\School;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

/**
 * Academic structure: years, classes, sections, subjects and who teaches what.
 * Reading is open to staff; changes are for the school office.
 */
class StructureController extends Controller
{
    public function __construct(protected School $school) {}

    /** Everything the structure screens and pickers need, in one call. */
    public function index(Request $request): JsonResponse
    {
        $counts = StudentProfile::where('status', 'active')->whereNotNull('class_section_id')
            ->selectRaw('class_section_id, COUNT(*) as n')->groupBy('class_section_id')->pluck('n', 'class_section_id');

        $mine = $this->school->sectionIdsFor($request->user());

        $classes = SchoolClass::with(['sections.classTeacher', 'sections.subjects.subject', 'sections.subjects.teacher'])
            ->orderBy('sort')->orderBy('name')->get()
            ->map(fn (SchoolClass $c) => [
                'id' => $c->id,
                'name' => $c->name,
                'sort' => $c->sort,
                'sections' => $c->sections->map(fn (ClassSection $s) => [
                    'id' => $s->id,
                    'name' => $s->name,
                    'label' => $c->name.' – '.$s->name,
                    'capacity' => $s->capacity,
                    'room' => $s->room,
                    'students_count' => (int) ($counts[$s->id] ?? 0),
                    'class_teacher' => $s->classTeacher?->only('id', 'name'),
                    'mine' => $mine === null || in_array($s->id, $mine, true),
                    'subjects' => $s->subjects->map(fn (SectionSubject $ss) => [
                        'id' => $ss->id,
                        'subject_id' => $ss->subject_id,
                        'name' => $ss->subject?->name,
                        'color' => $ss->subject?->color,
                        'teacher' => $ss->teacher?->only('id', 'name'),
                    ])->sortBy('name')->values(),
                ])->values(),
            ]);

        return response()->json([
            'years' => AcademicYear::orderByDesc('starts_on')->get(['id', 'name', 'starts_on', 'ends_on', 'is_current']),
            'classes' => $classes,
            'subjects' => Subject::orderBy('name')->get(['id', 'name', 'code', 'color']),
            'teachers' => User::whereIn('role', [User::ROLE_INSTRUCTOR, User::ROLE_ADMIN, User::ROLE_MANAGER])
                ->where('is_active', true)->orderBy('name')->get(['id', 'name', 'role']),
        ]);
    }

    // ── Academic years ────────────────────────────────────────────────

    public function storeYear(Request $request): JsonResponse
    {
        $data = $request->validate([
            'name' => ['required', 'string', 'max:60'],
            'starts_on' => ['required', 'date'],
            'ends_on' => ['required', 'date', 'after:starts_on'],
            'is_current' => ['boolean'],
        ]);
        $year = AcademicYear::create($data);
        if ($year->is_current || AcademicYear::count() === 1) {
            $this->makeCurrent($year);
        }

        return response()->json($year->fresh(), 201);
    }

    public function updateYear(Request $request, AcademicYear $year): JsonResponse
    {
        $data = $request->validate([
            'name' => ['sometimes', 'string', 'max:60'],
            'starts_on' => ['sometimes', 'date'],
            'ends_on' => ['sometimes', 'date'],
            'is_current' => ['sometimes', 'boolean'],
        ]);
        $year->update($data);
        if (! empty($data['is_current'])) {
            $this->makeCurrent($year);
        }

        return response()->json($year->fresh());
    }

    public function destroyYear(AcademicYear $year): JsonResponse
    {
        $year->delete();

        return response()->json(['ok' => true]);
    }

    protected function makeCurrent(AcademicYear $year): void
    {
        AcademicYear::where('id', '!=', $year->id)->update(['is_current' => false]);
        $year->forceFill(['is_current' => true])->save();
    }

    // ── Classes and sections ──────────────────────────────────────────

    public function storeClass(Request $request): JsonResponse
    {
        $data = $request->validate([
            'name' => ['required', 'string', 'max:60', Rule::unique('school_classes')->where('tenant_id', $request->user()->tenant_id)],
            'sections' => ['nullable', 'array', 'max:26'],
            'sections.*' => ['string', 'max:30', 'distinct'],
        ]);
        $class = SchoolClass::create(['name' => $data['name'], 'sort' => (int) SchoolClass::max('sort') + 1]);
        foreach ($data['sections'] ?? ['A'] as $name) {
            $class->sections()->create(['name' => $name]);
        }

        return response()->json(['id' => $class->id], 201);
    }

    public function updateClass(Request $request, SchoolClass $class): JsonResponse
    {
        $data = $request->validate([
            'name' => ['sometimes', 'string', 'max:60', Rule::unique('school_classes')->where('tenant_id', $request->user()->tenant_id)->ignore($class->id)],
            'sort' => ['sometimes', 'integer', 'min:0', 'max:999'],
        ]);
        $class->update($data);

        return response()->json(['ok' => true]);
    }

    public function destroyClass(SchoolClass $class): JsonResponse
    {
        $ids = $class->sections()->pluck('id');
        abort_if(StudentProfile::whereIn('class_section_id', $ids)->where('status', 'active')->exists(), 422,
            'Move the students in this class to another class first.');
        $class->delete();

        return response()->json(['ok' => true]);
    }

    public function storeSection(Request $request, SchoolClass $class): JsonResponse
    {
        $data = $this->sectionRules($request, $class);
        $section = $class->sections()->create($data);

        return response()->json(['id' => $section->id], 201);
    }

    public function updateSection(Request $request, ClassSection $section): JsonResponse
    {
        $section->update($this->sectionRules($request, $section->schoolClass()->first(), $section));

        return response()->json(['ok' => true]);
    }

    public function destroySection(ClassSection $section): JsonResponse
    {
        abort_if(StudentProfile::where('class_section_id', $section->id)->where('status', 'active')->exists(), 422,
            'Move the students in this section to another section first.');
        $section->delete();

        return response()->json(['ok' => true]);
    }

    protected function sectionRules(Request $request, SchoolClass $class, ?ClassSection $section = null): array
    {
        $required = $section ? 'sometimes' : 'required';

        return $request->validate([
            'name' => [$required, 'string', 'max:30', Rule::unique('class_sections')->where('school_class_id', $class->id)->ignore($section?->id)],
            'capacity' => ['nullable', 'integer', 'min:1', 'max:2000'],
            'room' => ['nullable', 'string', 'max:60'],
            'class_teacher_id' => ['nullable', 'integer', $this->staffRule($request)],
        ]);
    }

    // ── Subjects and allocation ──────────────────────────────────────

    public function storeSubject(Request $request): JsonResponse
    {
        $data = $request->validate([
            'name' => ['required', 'string', 'max:80', Rule::unique('subjects')->where('tenant_id', $request->user()->tenant_id)],
            'code' => ['nullable', 'string', 'max:20'],
            'color' => ['nullable', 'regex:/^#[0-9a-fA-F]{6}$/'],
        ]);

        return response()->json(Subject::create($data), 201);
    }

    public function updateSubject(Request $request, Subject $subject): JsonResponse
    {
        $data = $request->validate([
            'name' => ['sometimes', 'string', 'max:80', Rule::unique('subjects')->where('tenant_id', $request->user()->tenant_id)->ignore($subject->id)],
            'code' => ['nullable', 'string', 'max:20'],
            'color' => ['nullable', 'regex:/^#[0-9a-fA-F]{6}$/'],
        ]);
        $subject->update($data);

        return response()->json($subject->fresh());
    }

    public function destroySubject(Subject $subject): JsonResponse
    {
        $subject->delete();

        return response()->json(['ok' => true]);
    }

    /** Replace the subjects (and their teachers) taught in a section. */
    public function allocate(Request $request, ClassSection $section): JsonResponse
    {
        $data = $request->validate([
            'subjects' => ['present', 'array', 'max:40'],
            'subjects.*.subject_id' => ['required', 'integer', Rule::exists('subjects', 'id')->where('tenant_id', $request->user()->tenant_id)],
            'subjects.*.teacher_id' => ['nullable', 'integer', $this->staffRule($request)],
        ]);

        $keep = [];
        foreach ($data['subjects'] as $row) {
            $ss = SectionSubject::firstOrNew(['class_section_id' => $section->id, 'subject_id' => $row['subject_id']]);
            $ss->teacher_id = $row['teacher_id'] ?? null;
            $ss->save();
            $keep[] = $ss->id;
        }
        SectionSubject::where('class_section_id', $section->id)->whereNotIn('id', $keep)->delete();

        return response()->json(['ok' => true]);
    }

    protected function staffRule(Request $request)
    {
        return Rule::exists('users', 'id')->where('tenant_id', $request->user()->tenant_id)
            ->whereIn('role', [User::ROLE_INSTRUCTOR, User::ROLE_ADMIN, User::ROLE_MANAGER]);
    }
}

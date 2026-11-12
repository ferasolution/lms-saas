<?php

namespace App\Http\Controllers\Api\School;

use App\Http\Controllers\Controller;
use App\Models\ActivityLog;
use App\Models\AttendanceRecord;
use App\Models\ClassSection;
use App\Models\HomeworkSubmission;
use App\Models\StudentProfile;
use App\Models\User;
use App\Services\School;
use App\Support\Csv;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\Rule;
use Symfony\Component\HttpFoundation\StreamedResponse;

/**
 * Student information system: school records, families, promotion and status.
 */
class StudentController extends Controller
{
    public const STATUSES = ['active', 'suspended', 'withdrawn', 'graduated', 'alumni'];

    public const RELATIONS = ['mother', 'father', 'guardian', 'grandparent', 'sibling', 'other'];

    public function __construct(protected School $school) {}

    public function index(Request $request): JsonResponse
    {
        $user = $request->user();
        $sections = $this->school->sectionIdsFor($user);

        $q = StudentProfile::with(['user', 'section.schoolClass'])
            ->when($sections !== null, fn ($q) => $q->whereIn('class_section_id', $sections ?: [0]))
            ->when(is_numeric($request->input('section_id')), fn ($q) => $q->where('class_section_id', $request->integer('section_id')))
            ->when($request->filled('class_id'), fn ($q) => $q->whereIn('class_section_id', ClassSection::where('school_class_id', $request->integer('class_id'))->pluck('id')))
            ->when($request->input('section_id') === 'none', fn ($q) => $q->whereNull('class_section_id'))
            ->where('student_profiles.status', $request->input('status', 'active'))
            ->when($request->filled('search'), function ($q) use ($request) {
                $term = '%'.$request->string('search').'%';
                $q->where(fn ($q) => $q->where('admission_no', 'like', $term)
                    ->orWhereHas('user', fn ($u) => $u->where('name', 'like', $term)->orWhere('email', 'like', $term)));
            })
            ->join('users', 'users.id', '=', 'student_profiles.user_id')
            ->orderBy('users.name')
            ->select('student_profiles.*');

        $page = $q->paginate(min($request->integer('per_page', 50) ?: 50, 200));
        $guardians = $this->guardiansFor($page->getCollection()->pluck('user_id')->all());

        return response()->json([
            'data' => $page->getCollection()->map(fn ($p) => $this->row($p, $guardians[$p->user_id] ?? []))->values(),
            'meta' => ['total' => $page->total(), 'current_page' => $page->currentPage(), 'last_page' => $page->lastPage()],
        ]);
    }

    public function show(Request $request, User $student): JsonResponse
    {
        $profile = $this->profileOr404($student);
        $this->authorizeView($request->user(), $profile);

        $since = now()->subDays(90)->toDateString();
        $att = AttendanceRecord::where('student_id', $student->id)->where('date', '>=', $since)
            ->selectRaw('status, COUNT(*) as n')->groupBy('status')->pluck('n', 'status');
        $hw = HomeworkSubmission::where('student_id', $student->id)->selectRaw('status, COUNT(*) as n')->groupBy('status')->pluck('n', 'status');

        $guardians = $this->guardiansFor([$student->id]);

        return response()->json(array_merge($this->row($profile->load(['user', 'section.schoolClass']), $guardians[$student->id] ?? []), [
            'date_of_birth' => $profile->date_of_birth?->toDateString(),
            'gender' => $profile->gender,
            'address' => $profile->address,
            'emergency_contact' => $profile->emergency_contact,
            'medical_notes' => $this->school->isOffice($request->user()) || $request->user()->hasRole(User::ROLE_INSTRUCTOR) || $this->isFamily($request->user(), $student->id) ? $profile->medical_notes : null,
            'previous_school' => $profile->previous_school,
            'attendance' => [
                'present' => (int) (($att['present'] ?? 0) + ($att['late'] ?? 0)),
                'absent' => (int) ($att['absent'] ?? 0),
                'late' => (int) ($att['late'] ?? 0),
                'leave' => (int) (($att['leave'] ?? 0) + ($att['excused'] ?? 0)),
                'days' => (int) $att->sum(),
            ],
            'homework' => ['submitted' => (int) ($hw['submitted'] ?? 0), 'checked' => (int) ($hw['checked'] ?? 0), 'redo' => (int) ($hw['redo'] ?? 0)],
        ]));
    }

    /** Admit a student directly (walk-in), with up to two guardians. */
    public function store(Request $request): JsonResponse
    {
        $tenantId = $request->user()->tenant_id;
        $data = $request->validate(array_merge($this->profileRules($tenantId), [
            'name' => ['required', 'string', 'max:120'],
            'email' => ['nullable', 'email', 'max:255'],
            'password' => ['nullable', 'string', 'min:8'],
            'guardians' => ['nullable', 'array', 'max:2'],
            'guardians.*.name' => ['required', 'string', 'max:120'],
            'guardians.*.email' => ['required', 'email', 'max:255'],
            'guardians.*.phone' => ['nullable', 'string', 'max:30'],
            'guardians.*.relation' => ['nullable', Rule::in(self::RELATIONS)],
        ]));

        $result = DB::transaction(function () use ($data) {
            [$student, $password] = $this->school->createStudent(
                ['name' => $data['name'], 'email' => $data['email'] ?? null, 'password' => $data['password'] ?? null],
                $this->profileData($data),
            );
            $logins = [['name' => $student->name, 'email' => $student->email, 'role' => 'student', 'password' => $password]];
            foreach ($data['guardians'] ?? [] as $g) {
                [$guardian, $gPassword, $created] = $this->school->findOrCreateGuardian($g);
                $this->school->link($guardian, $student, $g['relation'] ?? 'guardian');
                if ($created) {
                    $logins[] = ['name' => $guardian->name, 'email' => $guardian->email, 'role' => 'parent', 'password' => $gPassword];
                }
            }

            return [$student, $logins];
        });

        ActivityLog::record('student.admitted', "Admitted {$result[0]->name}");

        return response()->json(['id' => $result[0]->id, 'logins' => array_values(array_filter($result[1], fn ($l) => $l['password']))], 201);
    }

    public function update(Request $request, User $student): JsonResponse
    {
        $profile = $this->profileOr404($student);
        $tenantId = $request->user()->tenant_id;
        $data = $request->validate(array_merge($this->profileRules($tenantId, $profile), [
            'name' => ['sometimes', 'string', 'max:120'],
            'phone' => ['nullable', 'string', 'max:30'],
            'status' => ['sometimes', Rule::in(self::STATUSES)],
        ]));

        DB::transaction(function () use ($student, $profile, $data) {
            if (array_key_exists('name', $data) || array_key_exists('phone', $data)) {
                $student->fill(array_intersect_key($data, array_flip(['name', 'phone'])))->save();
            }
            $profile->fill($this->profileData($data, true));
            if (isset($data['status'])) {
                $profile->status = $data['status'];
                // Leaving the school ends sign-in; coming back restores it.
                $student->forceFill(['is_active' => in_array($data['status'], ['active', 'suspended'], true) ? $data['status'] === 'active' : false])->save();
            }
            $profile->save();
        });

        ActivityLog::record('student.updated', "Updated {$student->name}’s record", ['changes' => array_keys($data)]);

        return response()->json(['ok' => true]);
    }

    /** Move many students to another section (promotion, re-sectioning, graduation). */
    public function promote(Request $request): JsonResponse
    {
        $tenantId = $request->user()->tenant_id;
        $data = $request->validate([
            'student_ids' => ['required', 'array', 'min:1', 'max:500'],
            'student_ids.*' => ['integer'],
            'to_section_id' => ['nullable', 'required_without:status', 'integer', Rule::exists('class_sections', 'id')->where('tenant_id', $tenantId)],
            'status' => ['nullable', Rule::in(['graduated', 'withdrawn', 'alumni'])],
        ]);

        $q = StudentProfile::whereIn('user_id', $data['student_ids']);
        $n = ! empty($data['status'])
            ? tap($q->count(), function () use ($q, $data) {
                $ids = $q->pluck('user_id');
                $q->update(['status' => $data['status']]);
                User::whereIn('id', $ids)->update(['is_active' => false]);
            })
            : $q->update(['class_section_id' => $data['to_section_id'], 'roll_no' => null]);

        ActivityLog::record('student.promoted', "Moved {$n} students", $data);

        return response()->json(['moved' => $n]);
    }

    /** Link a parent (existing or new) to a student. */
    public function addGuardian(Request $request, User $student): JsonResponse
    {
        $this->profileOr404($student);
        $data = $request->validate([
            'name' => ['required', 'string', 'max:120'],
            'email' => ['required', 'email', 'max:255'],
            'phone' => ['nullable', 'string', 'max:30'],
            'relation' => ['nullable', Rule::in(self::RELATIONS)],
        ]);
        [$guardian, $password] = $this->school->findOrCreateGuardian($data);
        $this->school->link($guardian, $student, $data['relation'] ?? 'guardian');

        return response()->json(['id' => $guardian->id, 'login' => $password ? ['email' => $guardian->email, 'password' => $password] : null], 201);
    }

    public function removeGuardian(User $student, User $guardian): JsonResponse
    {
        DB::table('guardian_student')->where('student_id', $student->id)->where('guardian_id', $guardian->id)->delete();

        return response()->json(['ok' => true]);
    }

    public function export(Request $request): StreamedResponse
    {
        $labels = $this->school->sectionLabels();
        $rows = StudentProfile::with('user')->where('status', $request->input('status', 'active'))
            ->when($request->filled('section_id'), fn ($q) => $q->where('class_section_id', $request->integer('section_id')))
            ->get()->sortBy(fn ($p) => ($labels[$p->class_section_id] ?? 'zzz').$p->user?->name);
        $guardians = $this->guardiansFor($rows->pluck('user_id')->all());

        return Csv::download('students.csv',
            ['Admission no', 'Name', 'Email', 'Class', 'Roll no', 'Date of birth', 'Gender', 'Status', 'Parents', 'Parent emails', 'Parent phones'],
            $rows->map(fn ($p) => [
                $p->admission_no, $p->user?->name, $p->user?->email, $labels[$p->class_section_id] ?? '', $p->roll_no,
                $p->date_of_birth?->toDateString(), $p->gender, $p->status,
                collect($guardians[$p->user_id] ?? [])->pluck('name')->implode('; '),
                collect($guardians[$p->user_id] ?? [])->pluck('email')->implode('; '),
                collect($guardians[$p->user_id] ?? [])->pluck('phone')->filter()->implode('; '),
            ]));
    }

    // ── helpers ──────────────────────────────────────────────────────

    protected function profileRules(int $tenantId, ?StudentProfile $profile = null): array
    {
        return [
            'class_section_id' => ['nullable', 'integer', Rule::exists('class_sections', 'id')->where('tenant_id', $tenantId)],
            'admission_no' => ['nullable', 'string', 'max:30', Rule::unique('student_profiles')->where('tenant_id', $tenantId)->ignore($profile?->id)],
            'roll_no' => ['nullable', 'string', 'max:20'],
            'date_of_birth' => ['nullable', 'date', 'before:today'],
            'gender' => ['nullable', Rule::in(['female', 'male', 'other'])],
            'address' => ['nullable', 'string', 'max:500'],
            'emergency_contact' => ['nullable', 'string', 'max:120'],
            'medical_notes' => ['nullable', 'string', 'max:2000'],
            'previous_school' => ['nullable', 'string', 'max:160'],
            'admitted_on' => ['nullable', 'date'],
        ];
    }

    protected function profileData(array $data, bool $partial = false): array
    {
        $keys = ['class_section_id', 'admission_no', 'roll_no', 'date_of_birth', 'gender', 'address', 'emergency_contact', 'medical_notes', 'previous_school', 'admitted_on'];
        $out = array_intersect_key($data, array_flip($keys));
        if (! $partial && empty($out['admission_no'])) {
            unset($out['admission_no']);
        }
        if ($partial && array_key_exists('admission_no', $out) && empty($out['admission_no'])) {
            unset($out['admission_no']);
        }

        return $out;
    }

    protected function profileOr404(User $student): StudentProfile
    {
        $profile = StudentProfile::where('user_id', $student->id)->first();
        abort_if(! $profile, 404);

        return $profile;
    }

    protected function isFamily(User $viewer, int $studentId): bool
    {
        return in_array($studentId, $this->school->familyStudentIds($viewer), true);
    }

    protected function authorizeView(User $viewer, StudentProfile $profile): void
    {
        if ($this->isFamily($viewer, $profile->user_id)) {
            return;
        }
        abort_if(! $profile->class_section_id && ! $this->school->isOffice($viewer), 403);
        abort_if($profile->class_section_id && ! $this->school->canTeach($viewer, $profile->class_section_id), 403);
    }

    /** [studentId => [guardian rows]] */
    protected function guardiansFor(array $studentIds): array
    {
        if (! $studentIds) {
            return [];
        }

        return DB::table('guardian_student')
            ->join('users', 'users.id', '=', 'guardian_student.guardian_id')
            ->whereIn('guardian_student.student_id', $studentIds)
            ->get(['guardian_student.student_id', 'users.id', 'users.name', 'users.email', 'users.phone', 'guardian_student.relation'])
            ->groupBy('student_id')
            ->map(fn ($g) => $g->map(fn ($r) => ['id' => $r->id, 'name' => $r->name, 'email' => $r->email, 'phone' => $r->phone, 'relation' => $r->relation])->values()->all())
            ->all();
    }

    protected function row(StudentProfile $p, array $guardians): array
    {
        return [
            'id' => $p->user_id,
            'profile_id' => $p->id,
            'name' => $p->user?->name,
            'email' => $p->user?->email,
            'phone' => $p->user?->phone,
            'admission_no' => $p->admission_no,
            'roll_no' => $p->roll_no,
            'status' => $p->status,
            'admitted_on' => $p->admitted_on?->toDateString(),
            'section' => $p->section ? ['id' => $p->section->id, 'label' => $p->section->label(), 'class_id' => $p->section->school_class_id] : null,
            'guardians' => $guardians,
        ];
    }
}

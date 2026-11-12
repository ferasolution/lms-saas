<?php

namespace App\Http\Controllers\Api\School;

use App\Http\Controllers\Controller;
use App\Models\ActivityLog;
use App\Models\AdmissionApplication;
use App\Models\SchoolClass;
use App\Services\School;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use Illuminate\Validation\Rule;

/**
 * Admissions: a public application form, the office pipeline, and turning an
 * accepted application into a student with parent accounts.
 */
class AdmissionController extends Controller
{
    public const STATUSES = ['new', 'reviewing', 'interview', 'accepted', 'waitlisted', 'rejected', 'enrolled'];

    public const SOURCES = ['online', 'walk_in', 'phone', 'referral', 'event', 'other'];

    public function __construct(protected School $school) {}

    /** Classes open for applications (public). */
    public function form(): JsonResponse
    {
        $t = $this->school->tenant();

        return response()->json([
            'institute' => ['name' => $t->name, 'logo' => data_get($t->settings, 'logo')],
            'open' => (bool) data_get($t->settings, 'admissions_open', true),
            'classes' => SchoolClass::orderBy('sort')->orderBy('name')->get(['id', 'name']),
        ]);
    }

    /** Public: a parent applies. */
    public function apply(Request $request): JsonResponse
    {
        abort_if(! data_get($this->school->tenant()->settings, 'admissions_open', true), 422, 'Admissions are closed at the moment.');
        $data = $request->validate($this->rules($request) + ['website' => ['prohibited']]);

        $app = $this->create($data, 'online');
        $this->school->notify($this->office(), 'admission', "New application: {$app->student_name}",
            "From {$app->guardian_name} · Ref {$app->reference}", '/admissions');

        return response()->json(['reference' => $app->reference], 201);
    }

    public function index(Request $request): JsonResponse
    {
        $q = AdmissionApplication::with('schoolClass')
            ->when($request->filled('status'), fn ($q) => $q->where('status', $request->string('status')))
            ->when($request->filled('search'), function ($q) use ($request) {
                $term = '%'.$request->string('search').'%';
                $q->where(fn ($q) => $q->where('student_name', 'like', $term)->orWhere('guardian_name', 'like', $term)
                    ->orWhere('guardian_email', 'like', $term)->orWhere('reference', 'like', $term));
            })
            ->latest('id');

        $counts = AdmissionApplication::selectRaw('status, COUNT(*) as n')->groupBy('status')->pluck('n', 'status');

        return response()->json([
            'data' => $q->limit(300)->get()->map(fn ($a) => $this->row($a)),
            'counts' => collect(self::STATUSES)->mapWithKeys(fn ($s) => [$s => (int) ($counts[$s] ?? 0)]),
        ]);
    }

    /** Walk-in or phone enquiry entered by the office. */
    public function store(Request $request): JsonResponse
    {
        $data = $request->validate($this->rules($request) + ['source' => ['nullable', Rule::in(self::SOURCES)]]);

        return response()->json($this->row($this->create($data, $data['source'] ?? 'walk_in')), 201);
    }

    public function update(Request $request, AdmissionApplication $application): JsonResponse
    {
        abort_if($application->status === 'enrolled', 422, 'This applicant is already enrolled.');
        $data = $request->validate([
            'status' => ['sometimes', Rule::in(array_diff(self::STATUSES, ['enrolled']))],
            'interview_at' => ['nullable', 'date'],
            'decision_note' => ['nullable', 'string', 'max:2000'],
            'school_class_id' => ['nullable', 'integer', Rule::exists('school_classes', 'id')->where('tenant_id', $request->user()->tenant_id)],
        ]);
        $before = $application->status;
        $application->fill($data);
        $application->handled_by = $request->user()->id;
        $application->save();

        if (isset($data['status']) && $data['status'] !== $before) {
            ActivityLog::record('admission.status', "{$application->student_name}: {$before} → {$data['status']}");
        }

        return response()->json($this->row($application->load('schoolClass')));
    }

    /** Accepted → student account in a section, parent account linked. */
    public function enrol(Request $request, AdmissionApplication $application): JsonResponse
    {
        abort_if($application->status === 'enrolled', 422, 'This applicant is already enrolled.');
        $data = $request->validate([
            'class_section_id' => ['required', 'integer', Rule::exists('class_sections', 'id')->where('tenant_id', $request->user()->tenant_id)],
            'student_email' => ['nullable', 'email', 'max:255'],
        ]);

        $logins = DB::transaction(function () use ($application, $data, $request) {
            [$student, $password] = $this->school->createStudent(
                ['name' => $application->student_name, 'email' => $data['student_email'] ?? null],
                [
                    'class_section_id' => $data['class_section_id'],
                    'date_of_birth' => $application->date_of_birth?->toDateString(),
                    'gender' => $application->gender,
                    'previous_school' => $application->previous_school,
                ],
            );
            [$guardian, $gPassword] = $this->school->findOrCreateGuardian([
                'name' => $application->guardian_name, 'email' => $application->guardian_email, 'phone' => $application->guardian_phone,
            ]);
            $this->school->link($guardian, $student, $application->relation ?: 'guardian');

            $application->forceFill(['status' => 'enrolled', 'student_id' => $student->id, 'handled_by' => $request->user()->id])->save();

            $this->school->notify($guardian, 'admission', "{$student->name} is enrolled", 'Welcome! Your parent portal shows the timetable, diary and attendance.', '/');

            return array_values(array_filter([
                ['name' => $student->name, 'email' => $student->email, 'role' => 'student', 'password' => $password],
                ['name' => $guardian->name, 'email' => $guardian->email, 'role' => 'parent', 'password' => $gPassword],
            ], fn ($l) => $l['password']));
        });

        ActivityLog::record('admission.enrolled', "Enrolled {$application->student_name}");

        return response()->json(['student_id' => $application->student_id, 'logins' => $logins]);
    }

    public function destroy(AdmissionApplication $application): JsonResponse
    {
        abort_if($application->status === 'enrolled', 422, 'Enrolled applications are kept for the record.');
        $application->delete();

        return response()->json(['ok' => true]);
    }

    protected function rules(Request $request): array
    {
        return [
            'student_name' => ['required', 'string', 'max:120'],
            'date_of_birth' => ['nullable', 'date', 'before:today'],
            'gender' => ['nullable', Rule::in(['female', 'male', 'other'])],
            'school_class_id' => ['nullable', 'integer', Rule::exists('school_classes', 'id')->where('tenant_id', $this->school->tenant()->id)],
            'guardian_name' => ['required', 'string', 'max:120'],
            'guardian_email' => ['required', 'email', 'max:160'],
            'guardian_phone' => ['nullable', 'string', 'max:40'],
            'relation' => ['nullable', Rule::in(StudentController::RELATIONS)],
            'previous_school' => ['nullable', 'string', 'max:160'],
            'notes' => ['nullable', 'string', 'max:3000'],
            'documents' => ['nullable', 'array', 'max:6'],
            'documents.*.name' => ['required', 'string', 'max:120'],
            'documents.*.url' => ['required', 'string', 'max:500', 'starts_with:/storage/,https://'],
        ];
    }

    protected function create(array $data, string $source): AdmissionApplication
    {
        unset($data['website'], $data['source']);
        $app = new AdmissionApplication($data);
        $app->source = $source;
        $app->status = 'new';
        $app->relation = $data['relation'] ?? 'guardian';
        do {
            $app->reference = 'A'.now()->format('y').strtoupper(Str::random(5));
        } while (AdmissionApplication::where('reference', $app->reference)->exists());
        $app->save();

        return $app;
    }

    protected function office(): array
    {
        return app(\App\Services\Notifier::class)->roleIds($this->school->tenant()->id, School::OFFICE);
    }

    protected function row(AdmissionApplication $a): array
    {
        return [
            'id' => $a->id,
            'reference' => $a->reference,
            'student_name' => $a->student_name,
            'date_of_birth' => $a->date_of_birth?->toDateString(),
            'gender' => $a->gender,
            'class' => $a->schoolClass?->only('id', 'name'),
            'guardian_name' => $a->guardian_name,
            'guardian_email' => $a->guardian_email,
            'guardian_phone' => $a->guardian_phone,
            'relation' => $a->relation,
            'previous_school' => $a->previous_school,
            'notes' => $a->notes,
            'documents' => $a->documents ?? [],
            'source' => $a->source,
            'status' => $a->status,
            'interview_at' => $a->interview_at?->toIso8601String(),
            'decision_note' => $a->decision_note,
            'student_id' => $a->student_id,
            'created_at' => $a->created_at?->toIso8601String(),
        ];
    }
}

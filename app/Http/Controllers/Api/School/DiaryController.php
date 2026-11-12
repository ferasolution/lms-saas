<?php

namespace App\Http\Controllers\Api\School;

use App\Http\Controllers\Controller;
use App\Models\ClassSection;
use App\Models\DiaryEntry;
use App\Models\HomeworkSubmission;
use App\Models\SectionSubject;
use App\Models\StudentProfile;
use App\Models\User;
use App\Services\School;
use Carbon\CarbonImmutable;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Str;
use Illuminate\Validation\Rule;

/**
 * The digital diary: what was taught, homework, notices and upcoming tests,
 * plus homework hand-in and checking.
 */
class DiaryController extends Controller
{
    public const KINDS = ['classwork', 'homework', 'notice', 'test'];

    public function __construct(protected School $school) {}

    /**
     * Staff: entries for sections they teach (filter by section/date).
     * Students and parents: entries for their own class(es).
     */
    public function index(Request $request): JsonResponse
    {
        $user = $request->user();
        $family = $this->school->familyStudentIds($user);
        $familySections = $family ? StudentProfile::whereIn('user_id', $family)->where('status', 'active')->pluck('class_section_id', 'user_id') : collect();
        $staffSections = $family ? [] : $this->school->sectionIdsFor($user);

        $q = DiaryEntry::with(['section.schoolClass', 'subject', 'teacher'])
            ->withCount(['submissions', 'submissions as checked_count' => fn ($q) => $q->where('status', 'checked')])
            ->when($family, fn ($q) => $q->whereIn('class_section_id', $familySections->filter()->values()->all() ?: [0]))
            ->when(! $family && $staffSections !== null, fn ($q) => $q->whereIn('class_section_id', $staffSections ?: [0]))
            ->when($request->filled('section_id'), fn ($q) => $q->where('class_section_id', $request->integer('section_id')))
            ->when($request->filled('kind'), fn ($q) => $q->where('kind', $request->string('kind')))
            ->when($request->filled('date'), fn ($q) => $q->whereDate('date', $request->date('date')))
            ->when($request->filled('from'), fn ($q) => $q->whereDate('date', '>=', $request->date('from')))
            ->when($request->boolean('pending'), fn ($q) => $q->where('accepts_submissions', true)->whereDate('due_on', '>=', now()->subDays(7)))
            ->orderByDesc('date')->orderByDesc('id')
            ->limit(min($request->integer('limit', 60) ?: 60, 200))->get();

        // For students/parents, attach each child's hand-in status.
        $mine = $family ? HomeworkSubmission::whereIn('student_id', $family)->whereIn('diary_entry_id', $q->pluck('id'))->get()->groupBy('diary_entry_id') : collect();
        $sizes = ! $family ? StudentProfile::where('status', 'active')->whereIn('class_section_id', $q->pluck('class_section_id')->unique())
            ->selectRaw('class_section_id, COUNT(*) as n')->groupBy('class_section_id')->pluck('n', 'class_section_id') : collect();

        return response()->json(['data' => $q->map(function (DiaryEntry $e) use ($family, $familySections, $mine, $sizes, $user) {
            $row = $this->row($e);
            if ($family) {
                $kids = $familySections->filter(fn ($s) => (int) $s === (int) $e->class_section_id)->keys();
                $row['children'] = $kids->map(fn ($id) => [
                    'student_id' => $id,
                    'submission' => optional(($mine[$e->id] ?? collect())->firstWhere('student_id', $id), fn ($s) => $this->submissionRow($s)),
                ])->values();
            } else {
                $row['class_size'] = (int) ($sizes[$e->class_section_id] ?? 0);
                $row['can_edit'] = $this->school->isOffice($user) || $e->teacher_id === $user->id;
            }

            return $row;
        })]);
    }

    public function store(Request $request): JsonResponse
    {
        $data = $this->validated($request);
        $section = ClassSection::with('schoolClass')->findOrFail($data['class_section_id']);
        abort_if(! $this->school->canTeach($request->user(), $section->id), 403);

        $notify = $data['notify'] ?? true;
        unset($data['notify']);
        $entry = new DiaryEntry($data);
        $entry->teacher_id = $request->user()->id;
        $entry->date ??= now()->toDateString();
        $entry->save();
        $entry->load(['section.schoolClass', 'subject', 'teacher']);

        if ($notify) {
            $what = ['homework' => 'New homework', 'test' => 'Upcoming test', 'notice' => 'Class notice', 'classwork' => 'Today in class'][$entry->kind];
            $this->school->notifySection($section->id, 'diary', "{$what}: {$entry->title}",
                trim(($entry->subject?->name ? $entry->subject->name.' · ' : '').$section->label().($entry->due_on ? ' · due '.$entry->due_on->format('M j') : '')),
                '/diary', true);
        }

        return response()->json($this->row($entry), 201);
    }

    public function update(Request $request, DiaryEntry $entry): JsonResponse
    {
        $this->authorizeEdit($request->user(), $entry);
        $data = $this->validated($request, $entry);
        unset($data['notify']);
        $entry->update($data);

        return response()->json($this->row($entry->fresh(['section.schoolClass', 'subject', 'teacher'])));
    }

    public function destroy(Request $request, DiaryEntry $entry): JsonResponse
    {
        $this->authorizeEdit($request->user(), $entry);
        $entry->delete();

        return response()->json(['ok' => true]);
    }

    /** Teacher: the class list for one homework, with each hand-in. */
    public function submissions(Request $request, DiaryEntry $entry): JsonResponse
    {
        abort_if(! $this->school->canTeach($request->user(), $entry->class_section_id), 403);
        $subs = HomeworkSubmission::where('diary_entry_id', $entry->id)->get()->keyBy('student_id');
        $students = StudentProfile::with('user')->where('class_section_id', $entry->class_section_id)->where('status', 'active')->get()->sortBy('user.name')->values();

        return response()->json([
            'entry' => $this->row($entry->load(['section.schoolClass', 'subject', 'teacher'])),
            'students' => $students->map(fn ($p) => [
                'id' => $p->user_id, 'name' => $p->user?->name, 'roll_no' => $p->roll_no,
                'submission' => isset($subs[$p->user_id]) ? $this->submissionRow($subs[$p->user_id]) : null,
            ]),
        ]);
    }

    /** Student (or a parent on the student's behalf) hands in homework. */
    public function submit(Request $request, DiaryEntry $entry): JsonResponse
    {
        abort_if(! $entry->accepts_submissions, 422, 'This entry doesn’t take submissions.');
        $family = $this->school->familyStudentIds($request->user());
        $data = $request->validate([
            'student_id' => ['nullable', 'integer', Rule::in($family)],
            'body' => ['nullable', 'required_without:file_path', 'string', 'max:20000'],
            'file_path' => ['nullable', 'string', 'max:500', 'starts_with:/storage/,https://'],
        ]);
        $studentId = $data['student_id'] ?? ($request->user()->hasRole(User::ROLE_STUDENT) ? $request->user()->id : null);
        abort_if(! $studentId, 422, 'Choose which child this is for.');
        abort_if(StudentProfile::where('user_id', $studentId)->value('class_section_id') !== $entry->class_section_id, 403);

        $sub = HomeworkSubmission::firstOrNew(['diary_entry_id' => $entry->id, 'student_id' => $studentId]);
        abort_if($sub->exists && $sub->status === 'checked', 422, 'This homework has already been checked.');
        $sub->body = $data['body'] ?? null;
        $sub->file_path = $data['file_path'] ?? null;
        $sub->status = 'submitted';
        $sub->submitted_at = now();
        $sub->save();

        return response()->json($this->submissionRow($sub), $sub->wasRecentlyCreated ? 201 : 200);
    }

    /** Teacher checks: marks, feedback, or asks for it again. */
    public function check(Request $request, HomeworkSubmission $submission): JsonResponse
    {
        $entry = DiaryEntry::findOrFail($submission->diary_entry_id);
        abort_if(! $this->school->canTeach($request->user(), $entry->class_section_id), 403);
        $data = $request->validate([
            'status' => ['required', Rule::in(['checked', 'redo'])],
            'marks' => ['nullable', 'numeric', 'min:0', 'max:'.($entry->max_marks ?: 1000)],
            'feedback' => ['nullable', 'string', 'max:3000'],
        ]);
        $submission->forceFill($data + ['checked_by' => $request->user()->id, 'checked_at' => now()])->save();

        $title = $data['status'] === 'redo' ? "Please redo: {$entry->title}" : "Homework checked: {$entry->title}";
        $body = isset($data['marks']) ? "{$data['marks']}".($entry->max_marks ? "/{$entry->max_marks}" : '').(! empty($data['feedback']) ? ' · '.Str::limit($data['feedback'], 100) : '') : (! empty($data['feedback']) ? Str::limit($data['feedback'], 140) : null);
        $this->school->notify(array_merge([$submission->student_id], $this->school->guardianIds([$submission->student_id])), 'homework_checked', $title, $body, '/diary');

        return response()->json($this->submissionRow($submission));
    }

    protected function validated(Request $request, ?DiaryEntry $entry = null): array
    {
        $tenantId = $request->user()->tenant_id;
        $req = $entry ? 'sometimes' : 'required';

        $data = $request->validate([
            'class_section_id' => [$req, 'integer', Rule::exists('class_sections', 'id')->where('tenant_id', $tenantId)],
            'subject_id' => ['nullable', 'integer', Rule::exists('subjects', 'id')->where('tenant_id', $tenantId)],
            'kind' => [$req, Rule::in(self::KINDS)],
            'title' => [$req, 'string', 'max:200'],
            'body' => ['nullable', 'string', 'max:20000'],
            'attachment' => ['nullable', 'string', 'max:500', 'starts_with:/storage/,https://'],
            'date' => ['nullable', 'date'],
            'due_on' => ['nullable', 'date'],
            'accepts_submissions' => ['boolean'],
            'max_marks' => ['nullable', 'integer', 'min:1', 'max:1000'],
            'notify' => ['boolean'],
        ]);

        if (isset($data['class_section_id']) && $entry && $data['class_section_id'] !== $entry->class_section_id) {
            abort_if(! $this->school->canTeach($request->user(), $data['class_section_id']), 403);
        }

        return $data;
    }

    protected function authorizeEdit(User $user, DiaryEntry $entry): void
    {
        abort_if(! $this->school->isOffice($user) && $entry->teacher_id !== $user->id, 403);
    }

    protected function row(DiaryEntry $e): array
    {
        return [
            'id' => $e->id,
            'kind' => $e->kind,
            'title' => $e->title,
            'body' => $e->body,
            'attachment' => $e->attachment,
            'date' => $e->date?->toDateString(),
            'due_on' => $e->due_on?->toDateString(),
            'accepts_submissions' => $e->accepts_submissions,
            'max_marks' => $e->max_marks,
            'section' => $e->section ? ['id' => $e->section->id, 'label' => $e->section->label()] : null,
            'subject' => $e->subject?->only('id', 'name', 'color'),
            'teacher' => $e->teacher?->only('id', 'name'),
            'submissions_count' => $e->submissions_count ?? null,
            'checked_count' => $e->checked_count ?? null,
            'created_at' => $e->created_at?->toIso8601String(),
        ];
    }

    protected function submissionRow(HomeworkSubmission $s): array
    {
        return [
            'id' => $s->id,
            'student_id' => $s->student_id,
            'body' => $s->body,
            'file_path' => $s->file_path,
            'status' => $s->status,
            'marks' => $s->marks,
            'feedback' => $s->feedback,
            'submitted_at' => $s->submitted_at?->toIso8601String(),
            'checked_at' => $s->checked_at?->toIso8601String(),
        ];
    }

    /** Subjects a teacher may post for in a section (for the form). */
    public static function subjectsFor(int $sectionId): array
    {
        return SectionSubject::with('subject')->where('class_section_id', $sectionId)->get()
            ->map(fn ($s) => ['id' => $s->subject_id, 'name' => $s->subject?->name])->all();
    }
}

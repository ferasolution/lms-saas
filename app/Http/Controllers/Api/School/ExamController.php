<?php

namespace App\Http\Controllers\Api\School;

use App\Http\Controllers\Controller;
use App\Models\ActivityLog;
use App\Models\AttendanceRecord;
use App\Models\ClassSection;
use App\Models\Exam;
use App\Models\ExamMark;
use App\Models\ExamPaper;
use App\Models\GradeBand;
use App\Models\SectionSubject;
use App\Models\StudentProfile;
use App\Models\User;
use App\Services\School;
use App\Support\Csv;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\Rule;
use Symfony\Component\HttpFoundation\StreamedResponse;

/**
 * Exams: date sheets, marks entry, grading, results and report cards.
 * draft → scheduled (families see the date sheet) → published (families see results).
 */
class ExamController extends Controller
{
    public const KINDS = ['term', 'midterm', 'final', 'monthly', 'weekly', 'entrance', 'other'];

    public const DEFAULT_BANDS = [
        [90, 'A+', 4.0, 'Outstanding'], [80, 'A', 3.7, 'Excellent'], [70, 'B', 3.0, 'Very good'],
        [60, 'C', 2.0, 'Good'], [50, 'D', 1.0, 'Satisfactory'], [0, 'F', 0.0, 'Needs improvement'],
    ];

    public function __construct(protected School $school) {}

    // ── Grading scale ────────────────────────────────────────────────

    public function bands(): Collection
    {
        $bands = GradeBand::orderByDesc('min_percent')->get();
        if ($bands->isEmpty()) {
            foreach (self::DEFAULT_BANDS as [$min, $grade, $points, $remark]) {
                GradeBand::create(['min_percent' => $min, 'grade' => $grade, 'points' => $points, 'remark' => $remark]);
            }
            $bands = GradeBand::orderByDesc('min_percent')->get();
        }

        return $bands;
    }

    public function scale(): JsonResponse
    {
        return response()->json(['bands' => $this->bands()->map->only('min_percent', 'grade', 'points', 'remark')->values()]);
    }

    public function saveScale(Request $request): JsonResponse
    {
        $data = $request->validate([
            'bands' => ['required', 'array', 'min:2', 'max:15'],
            'bands.*.min_percent' => ['required', 'numeric', 'min:0', 'max:100', 'distinct'],
            'bands.*.grade' => ['required', 'string', 'max:10'],
            'bands.*.points' => ['nullable', 'numeric', 'min:0', 'max:10'],
            'bands.*.remark' => ['nullable', 'string', 'max:60'],
        ]);
        abort_if(! collect($data['bands'])->contains(fn ($b) => (float) $b['min_percent'] === 0.0), 422, 'One grade must start at 0%.');
        DB::transaction(function () use ($data) {
            GradeBand::query()->delete();
            foreach ($data['bands'] as $b) {
                GradeBand::create($b);
            }
        });

        return $this->scale();
    }

    protected function gradeFor(?float $percent, Collection $bands): ?array
    {
        if ($percent === null) {
            return null;
        }
        $b = $bands->first(fn ($b) => $percent >= $b->min_percent - 0.0001);

        return $b ? ['grade' => $b->grade, 'points' => $b->points, 'remark' => $b->remark] : null;
    }

    // ── Exams ────────────────────────────────────────────────────────

    public function index(Request $request): JsonResponse
    {
        $mine = $this->school->sectionIdsFor($request->user());
        $exams = Exam::withCount('papers')->orderByDesc('starts_on')->orderByDesc('id')->get();
        $progress = $this->progress($exams->pluck('id')->all(), $mine);

        return response()->json(['data' => $exams->map(fn (Exam $e) => $this->examRow($e) + ['progress' => $progress[$e->id] ?? ['papers' => 0, 'complete' => 0]])]);
    }

    public function store(Request $request): JsonResponse
    {
        $data = $this->examRules($request);
        $exam = Exam::create($data);
        ActivityLog::record('exam.created', "Created exam {$exam->name}");

        return response()->json($this->examRow($exam), 201);
    }

    public function update(Request $request, Exam $exam): JsonResponse
    {
        $data = $this->examRules($request, true);
        $wasPublished = $exam->status === 'published';
        $was = $exam->status;
        $exam->fill($data);
        if (($data['status'] ?? null) === 'published' && ! $wasPublished) {
            $exam->published_at = now();
        }
        $exam->save();

        $sections = ExamPaper::where('exam_id', $exam->id)->distinct()->pluck('class_section_id');
        if (($data['status'] ?? null) === 'scheduled' && $was === 'draft') {
            foreach ($sections as $sid) {
                $this->school->notifySection($sid, 'exam_scheduled', "Exam date sheet: {$exam->name}", $exam->starts_on ? 'Starts '.$exam->starts_on->format('M j') : null, '/exams');
            }
        }
        if (($data['status'] ?? null) === 'published' && ! $wasPublished) {
            foreach ($sections as $sid) {
                $this->school->notifySection($sid, 'exam_results', "Results published: {$exam->name}", 'Open the report card to see marks and grades.', '/exams');
            }
            ActivityLog::record('exam.published', "Published results for {$exam->name}");
        }

        return response()->json($this->examRow($exam));
    }

    public function destroy(Exam $exam): JsonResponse
    {
        abort_if($exam->status === 'published', 422, 'Published results are kept for the record. Move the exam back to draft first.');
        $exam->delete();

        return response()->json(['ok' => true]);
    }

    /** Exam detail: papers (date sheet) with marks-entry progress. Teachers see their own sections. */
    public function show(Request $request, Exam $exam): JsonResponse
    {
        $mine = $this->school->sectionIdsFor($request->user());
        $papers = ExamPaper::with(['section.schoolClass', 'subject'])->where('exam_id', $exam->id)
            ->when($mine !== null, fn ($q) => $q->whereIn('class_section_id', $mine ?: [0]))->get();
        $entered = ExamMark::whereIn('exam_paper_id', $papers->pluck('id'))
            ->where(fn ($q) => $q->whereNotNull('marks')->orWhere('is_absent', true))
            ->selectRaw('exam_paper_id, COUNT(*) as n')->groupBy('exam_paper_id')->pluck('n', 'exam_paper_id');
        $sizes = StudentProfile::where('status', 'active')->whereIn('class_section_id', $papers->pluck('class_section_id')->unique())
            ->selectRaw('class_section_id, COUNT(*) as n')->groupBy('class_section_id')->pluck('n', 'class_section_id');
        $teachers = SectionSubject::whereIn('class_section_id', $papers->pluck('class_section_id'))->get()
            ->mapWithKeys(fn ($s) => [$s->class_section_id.'-'.$s->subject_id => $s->teacher_id]);

        return response()->json($this->examRow($exam) + [
            'papers' => $papers->sortBy(fn ($p) => [$p->date?->toDateString() ?? '9999', $p->section?->label(), $p->subject?->name])->values()
                ->map(fn (ExamPaper $p) => $this->paperRow($p) + [
                    'entered' => (int) ($entered[$p->id] ?? 0),
                    'students' => (int) ($sizes[$p->class_section_id] ?? 0),
                    'can_enter' => $this->canEnter($request->user(), $p, $teachers),
                ]),
        ]);
    }

    /** Add papers for many sections at once: each section's own subjects, or the subjects given. */
    public function addPapers(Request $request, Exam $exam): JsonResponse
    {
        $tenantId = $request->user()->tenant_id;
        $data = $request->validate([
            'section_ids' => ['required', 'array', 'min:1'],
            'section_ids.*' => ['integer', Rule::exists('class_sections', 'id')->where('tenant_id', $tenantId)],
            'subject_ids' => ['nullable', 'array'],
            'subject_ids.*' => ['integer', Rule::exists('subjects', 'id')->where('tenant_id', $tenantId)],
            'max_marks' => ['required', 'numeric', 'min:1', 'max:1000'],
            'pass_marks' => ['nullable', 'numeric', 'min:0', 'lte:max_marks'],
        ]);

        $added = 0;
        DB::transaction(function () use ($data, $exam, &$added) {
            foreach ($data['section_ids'] as $sid) {
                $subjects = $data['subject_ids'] ?? SectionSubject::where('class_section_id', $sid)->pluck('subject_id')->all();
                foreach ($subjects as $subjectId) {
                    $paper = ExamPaper::firstOrNew(['exam_id' => $exam->id, 'class_section_id' => $sid, 'subject_id' => $subjectId]);
                    if (! $paper->exists) {
                        $paper->max_marks = $data['max_marks'];
                        $paper->pass_marks = $data['pass_marks'] ?? null;
                        $paper->save();
                        $added++;
                    }
                }
            }
        });

        return response()->json(['added' => $added], 201);
    }

    public function updatePaper(Request $request, ExamPaper $paper): JsonResponse
    {
        $data = $request->validate([
            'date' => ['nullable', 'date'],
            'starts_at' => ['nullable', 'date_format:H:i'],
            'duration_minutes' => ['nullable', 'integer', 'min:5', 'max:600'],
            'room' => ['nullable', 'string', 'max:60'],
            'max_marks' => ['sometimes', 'numeric', 'min:1', 'max:1000'],
            'pass_marks' => ['nullable', 'numeric', 'min:0'],
        ]);
        if (isset($data['max_marks'])) {
            abort_if(ExamMark::where('exam_paper_id', $paper->id)->where('marks', '>', $data['max_marks'])->exists(), 422, 'Some marks are already higher than that.');
        }
        $paper->update($data);

        return response()->json($this->paperRow($paper->load(['section.schoolClass', 'subject'])));
    }

    public function destroyPaper(ExamPaper $paper): JsonResponse
    {
        $paper->delete();

        return response()->json(['ok' => true]);
    }

    // ── Marks entry ──────────────────────────────────────────────────

    public function marks(Request $request, ExamPaper $paper): JsonResponse
    {
        $paper->load(['section.schoolClass', 'subject', 'exam']);
        abort_if(! $this->school->canTeach($request->user(), $paper->class_section_id), 403);
        $marks = ExamMark::where('exam_paper_id', $paper->id)->get()->keyBy('student_id');
        $students = StudentProfile::with('user')->where('class_section_id', $paper->class_section_id)->where('status', 'active')->get()
            ->sortBy(fn ($p) => [is_numeric($p->roll_no) ? (int) $p->roll_no : PHP_INT_MAX, $p->user?->name])->values();

        return response()->json([
            'paper' => $this->paperRow($paper) + ['exam' => $this->examRow($paper->exam), 'can_enter' => $this->canEnter($request->user(), $paper)],
            'students' => $students->map(fn ($p) => [
                'id' => $p->user_id, 'name' => $p->user?->name, 'roll_no' => $p->roll_no,
                'marks' => $marks[$p->user_id]->marks ?? null,
                'is_absent' => (bool) ($marks[$p->user_id]->is_absent ?? false),
                'remark' => $marks[$p->user_id]->remark ?? null,
            ]),
        ]);
    }

    public function saveMarks(Request $request, ExamPaper $paper): JsonResponse
    {
        $paper->load('exam');
        abort_if(! $this->canEnter($request->user(), $paper), 403);
        abort_if($paper->exam->status === 'published' && ! $this->school->isOffice($request->user()), 422, 'Results are published. Ask the school office to change marks.');
        $data = $request->validate([
            'marks' => ['required', 'array', 'max:500'],
            'marks.*.student_id' => ['required', 'integer'],
            'marks.*.marks' => ['nullable', 'numeric', 'min:0', 'max:'.$paper->max_marks],
            'marks.*.is_absent' => ['boolean'],
            'marks.*.remark' => ['nullable', 'string', 'max:200'],
        ], ['marks.*.marks.max' => 'Marks can’t be more than '.$paper->max_marks.'.']);

        $allowed = array_flip($this->school->studentIdsIn($paper->class_section_id));
        $saved = 0;
        DB::transaction(function () use ($data, $paper, $allowed, $request, &$saved) {
            foreach ($data['marks'] as $m) {
                if (! isset($allowed[$m['student_id']])) {
                    continue;
                }
                $row = ExamMark::firstOrNew(['exam_paper_id' => $paper->id, 'student_id' => $m['student_id']]);
                $row->is_absent = (bool) ($m['is_absent'] ?? false);
                $row->marks = $row->is_absent ? null : ($m['marks'] ?? null);
                $row->remark = $m['remark'] ?? null;
                $row->entered_by = $request->user()->id;
                $row->save();
                $saved++;
            }
        });

        return response()->json(['saved' => $saved]);
    }

    // ── Results ──────────────────────────────────────────────────────

    /** Class result sheet: students × subjects with totals, grades and positions. */
    public function results(Request $request, Exam $exam): JsonResponse
    {
        $data = $request->validate(['section_id' => ['required', 'integer']]);
        $section = ClassSection::with('schoolClass')->findOrFail($data['section_id']);
        abort_if(! $this->school->canTeach($request->user(), $section->id), 403);

        return response()->json($this->sheet($exam, $section));
    }

    public function exportResults(Request $request, Exam $exam): StreamedResponse
    {
        $sheet = $this->results($request, $exam)->getData(true);

        return Csv::download('results.csv',
            array_merge(['Position', 'Roll', 'Student'], array_map(fn ($p) => $p['subject'], $sheet['papers']), ['Total', 'Out of', '%', 'Grade', 'Result']),
            array_map(fn ($s) => array_merge([$s['position'], $s['roll_no'], $s['name']],
                array_map(fn ($p) => $s['marks'][$p['id']]['is_absent'] ?? false ? 'AB' : ($s['marks'][$p['id']]['marks'] ?? ''), $sheet['papers']),
                [$s['total'], $s['max'], $s['percent'], $s['grade']['grade'] ?? '', $s['passed'] === null ? '' : ($s['passed'] ? 'Pass' : 'Fail')]), $sheet['students']));
    }

    /** One student's report card. Families only once results are published. */
    public function report(Request $request, Exam $exam, User $student): JsonResponse
    {
        $viewer = $request->user();
        $profile = StudentProfile::with(['section.schoolClass', 'section.classTeacher'])->where('user_id', $student->id)->firstOrFail();
        $family = in_array($student->id, $this->school->familyStudentIds($viewer), true);
        if ($family) {
            abort_if($exam->status !== 'published', 404);
        } else {
            abort_if(! $profile->class_section_id || ! $this->school->canTeach($viewer, $profile->class_section_id), 403);
        }

        $sectionId = ExamPaper::where('exam_id', $exam->id)->whereIn('class_section_id', array_filter([$profile->class_section_id]))->exists()
            ? $profile->class_section_id
            : ExamMark::where('student_id', $student->id)->join('exam_papers', 'exam_papers.id', '=', 'exam_marks.exam_paper_id')->where('exam_papers.exam_id', $exam->id)->value('exam_papers.class_section_id');
        abort_if(! $sectionId, 404);
        $section = ClassSection::with('schoolClass')->findOrFail($sectionId);

        $sheet = $this->sheet($exam, $section);
        $row = collect($sheet['students'])->firstWhere('id', $student->id);
        abort_if(! $row, 404);

        $att = AttendanceRecord::where('student_id', $student->id)
            ->when($exam->ends_on, fn ($q) => $q->whereDate('date', '<=', $exam->ends_on))
            ->selectRaw('status, COUNT(*) as n')->groupBy('status')->pluck('n', 'status');
        $days = (int) $att->sum();
        $t = $this->school->tenant();

        return response()->json([
            'institute' => ['name' => $t->name, 'logo' => data_get($t->settings, 'logo_url'), 'address' => data_get($t->settings, 'address')],
            'exam' => $this->examRow($exam),
            'student' => ['id' => $student->id, 'name' => $student->name, 'admission_no' => $profile->admission_no, 'roll_no' => $profile->roll_no, 'section' => $section->label()],
            'class_teacher' => $profile->section?->classTeacher?->name,
            'subjects' => collect($sheet['papers'])->map(fn ($p) => [
                'subject' => $p['subject'], 'max' => $p['max_marks'], 'pass' => $p['pass_marks'],
                'marks' => $row['marks'][$p['id']]['marks'] ?? null, 'is_absent' => $row['marks'][$p['id']]['is_absent'] ?? false,
                'remark' => $row['marks'][$p['id']]['remark'] ?? null,
                'grade' => $row['marks'][$p['id']]['grade'] ?? null,
                'class_highest' => $p['highest'], 'class_average' => $p['average'],
            ])->values(),
            'total' => $row['total'], 'max' => $row['max'], 'percent' => $row['percent'], 'grade' => $row['grade'], 'passed' => $row['passed'],
            'position' => $exam->show_rank ? $row['position'] : null, 'class_size' => count($sheet['students']),
            'attendance' => ['days' => $days, 'present' => (int) (($att['present'] ?? 0) + ($att['late'] ?? 0)),
                'percent' => $days ? round((($att['present'] ?? 0) + ($att['late'] ?? 0)) / $days * 100) : null],
            'scale' => $this->bands()->map->only('min_percent', 'grade', 'remark')->values(),
        ]);
    }

    /** Families: exams with date sheets and (when published) result summaries per child. */
    public function mine(Request $request): JsonResponse
    {
        $ids = $this->school->familyStudentIds($request->user());
        $profiles = StudentProfile::with(['user', 'section.schoolClass'])->whereIn('user_id', $ids ?: [0])->get();
        $sectionIds = $profiles->pluck('class_section_id')->filter()->unique()->all();

        $exams = Exam::whereIn('status', ['scheduled', 'published'])
            ->whereIn('id', ExamPaper::whereIn('class_section_id', $sectionIds ?: [0])->select('exam_id'))
            ->orderByDesc('starts_on')->orderByDesc('id')->get();

        return response()->json(['data' => $exams->map(function (Exam $exam) use ($profiles) {
            return $this->examRow($exam) + ['children' => $profiles->filter(fn ($p) => $p->class_section_id)->map(function ($p) use ($exam) {
                $papers = ExamPaper::with('subject')->where('exam_id', $exam->id)->where('class_section_id', $p->class_section_id)->get()
                    ->sortBy(fn ($x) => [$x->date?->toDateString() ?? '9999', $x->starts_at]);
                if ($papers->isEmpty()) {
                    return null;
                }
                $summary = null;
                if ($exam->status === 'published') {
                    $marks = ExamMark::whereIn('exam_paper_id', $papers->pluck('id'))->where('student_id', $p->user_id)->get();
                    $max = $papers->sum('max_marks');
                    $got = $marks->sum('marks');
                    $pct = $max ? round($got / $max * 100, 1) : null;
                    $summary = ['total' => round($got, 2), 'max' => $max, 'percent' => $pct, 'grade' => $this->gradeFor($pct, $this->bands())];
                }

                return [
                    'student' => ['id' => $p->user_id, 'name' => $p->user?->name, 'section' => $p->section?->label()],
                    'date_sheet' => $papers->values()->map(fn ($x) => [
                        'subject' => $x->subject?->name, 'date' => $x->date?->toDateString(), 'starts_at' => $x->starts_at ? substr($x->starts_at, 0, 5) : null,
                        'duration_minutes' => $x->duration_minutes, 'room' => $x->room, 'max_marks' => $x->max_marks,
                    ]),
                    'summary' => $summary,
                ];
            })->filter()->values()];
        })->filter(fn ($e) => count($e['children']))->values()]);
    }

    // ── helpers ──────────────────────────────────────────────────────

    protected function sheet(Exam $exam, ClassSection $section): array
    {
        $bands = $this->bands();
        $papers = ExamPaper::with('subject')->where('exam_id', $exam->id)->where('class_section_id', $section->id)->get()->sortBy('subject.name')->values();
        $marks = ExamMark::whereIn('exam_paper_id', $papers->pluck('id'))->get()->groupBy('student_id');
        $students = StudentProfile::with('user')->where('class_section_id', $section->id)->where('status', 'active')->get();
        // Students who sat the exam but have since moved still appear.
        $extra = $marks->keys()->diff($students->pluck('user_id'));
        if ($extra->isNotEmpty()) {
            $students = $students->concat(StudentProfile::with('user')->whereIn('user_id', $extra)->get());
        }

        $rows = $students->map(function ($p) use ($papers, $marks, $bands) {
            $mine = ($marks[$p->user_id] ?? collect())->keyBy('exam_paper_id');
            $total = 0.0;
            $max = 0.0;
            $passed = true;
            $any = false;
            $cells = [];
            foreach ($papers as $paper) {
                $m = $mine[$paper->id] ?? null;
                $value = $m?->marks;
                $cells[$paper->id] = [
                    'marks' => $value, 'is_absent' => (bool) $m?->is_absent, 'remark' => $m?->remark,
                    'grade' => $value !== null ? $this->gradeFor($value / $paper->max_marks * 100, $bands)['grade'] ?? null : null,
                ];
                $max += $paper->max_marks;
                if ($value !== null || $m?->is_absent) {
                    $any = true;
                    $total += (float) $value;
                }
                if ($paper->pass_marks !== null && ($m?->is_absent || ($value !== null && $value < $paper->pass_marks))) {
                    $passed = false;
                }
            }
            $pct = $any && $max ? round($total / $max * 100, 1) : null;

            return [
                'id' => $p->user_id, 'name' => $p->user?->name, 'roll_no' => $p->roll_no,
                'marks' => $cells, 'total' => round($total, 2), 'max' => $max, 'percent' => $pct,
                'grade' => $this->gradeFor($pct, $bands), 'passed' => $any ? $passed : null,
            ];
        })->sortByDesc(fn ($r) => $r['percent'] ?? -1)->values();

        // Positions with ties sharing a place (1, 2, 2, 4).
        $pos = 0;
        $prev = null;
        $rows = $rows->map(function ($r, $i) use (&$pos, &$prev) {
            if ($r['percent'] === null) {
                return $r + ['position' => null];
            }
            if ($r['percent'] !== $prev) {
                $pos = $i + 1;
                $prev = $r['percent'];
            }

            return $r + ['position' => $pos];
        });

        return [
            'exam' => $this->examRow($exam),
            'section' => ['id' => $section->id, 'label' => $section->label()],
            'papers' => $papers->map(function ($p) use ($marks) {
                $vals = $marks->flatten()->where('exam_paper_id', $p->id)->pluck('marks')->filter(fn ($v) => $v !== null);

                return [
                    'id' => $p->id, 'subject' => $p->subject?->name, 'max_marks' => $p->max_marks, 'pass_marks' => $p->pass_marks,
                    'highest' => $vals->max(), 'average' => $vals->count() ? round($vals->avg(), 1) : null,
                ];
            })->values()->all(),
            'students' => $rows->values()->all(),
            'class_average' => $rows->whereNotNull('percent')->count() ? round($rows->whereNotNull('percent')->avg('percent'), 1) : null,
        ];
    }

    /** [exam_id => [papers, complete]] counting only the viewer's sections. */
    protected function progress(array $examIds, ?array $sections): array
    {
        if (! $examIds) {
            return [];
        }
        $papers = ExamPaper::whereIn('exam_id', $examIds)->when($sections !== null, fn ($q) => $q->whereIn('class_section_id', $sections ?: [0]))->get();
        $sizes = StudentProfile::where('status', 'active')->whereIn('class_section_id', $papers->pluck('class_section_id')->unique())
            ->selectRaw('class_section_id, COUNT(*) as n')->groupBy('class_section_id')->pluck('n', 'class_section_id');
        $entered = ExamMark::whereIn('exam_paper_id', $papers->pluck('id'))->where(fn ($q) => $q->whereNotNull('marks')->orWhere('is_absent', true))
            ->selectRaw('exam_paper_id, COUNT(*) as n')->groupBy('exam_paper_id')->pluck('n', 'exam_paper_id');

        return $papers->groupBy('exam_id')->map(fn ($ps) => [
            'papers' => $ps->count(),
            'complete' => $ps->filter(fn ($p) => ($sizes[$p->class_section_id] ?? 0) > 0 && ($entered[$p->id] ?? 0) >= ($sizes[$p->class_section_id] ?? 0))->count(),
        ])->all();
    }

    protected function canEnter(User $user, ExamPaper $paper, ?Collection $teachers = null): bool
    {
        if ($this->school->isOffice($user)) {
            return true;
        }
        $teacherId = $teachers
            ? ($teachers[$paper->class_section_id.'-'.$paper->subject_id] ?? null)
            : SectionSubject::where('class_section_id', $paper->class_section_id)->where('subject_id', $paper->subject_id)->value('teacher_id');
        if ($teacherId === $user->id) {
            return true;
        }

        // The class teacher can enter marks for subjects without a subject teacher.
        return ! $teacherId && ClassSection::whereKey($paper->class_section_id)->value('class_teacher_id') === $user->id;
    }

    protected function examRules(Request $request, bool $partial = false): array
    {
        $req = $partial ? 'sometimes' : 'required';

        return $request->validate([
            'name' => [$req, 'string', 'max:120'],
            'kind' => [$req, Rule::in(self::KINDS)],
            'academic_year_id' => ['nullable', 'integer', Rule::exists('academic_years', 'id')->where('tenant_id', $request->user()->tenant_id)],
            'starts_on' => ['nullable', 'date'],
            'ends_on' => ['nullable', 'date', 'after_or_equal:starts_on'],
            'status' => ['sometimes', Rule::in(['draft', 'scheduled', 'published'])],
            'show_rank' => ['sometimes', 'boolean'],
        ]);
    }

    protected function examRow(Exam $e): array
    {
        return [
            'id' => $e->id, 'name' => $e->name, 'kind' => $e->kind,
            'starts_on' => $e->starts_on?->toDateString(), 'ends_on' => $e->ends_on?->toDateString(),
            'status' => $e->status, 'published_at' => $e->published_at?->toIso8601String(), 'show_rank' => $e->show_rank,
            'papers_count' => $e->papers_count ?? null,
        ];
    }

    protected function paperRow(ExamPaper $p): array
    {
        return [
            'id' => $p->id,
            'section' => $p->section ? ['id' => $p->section->id, 'label' => $p->section->label()] : null,
            'subject' => $p->subject?->only('id', 'name', 'color'),
            'date' => $p->date?->toDateString(),
            'starts_at' => $p->starts_at ? substr($p->starts_at, 0, 5) : null,
            'duration_minutes' => $p->duration_minutes,
            'room' => $p->room,
            'max_marks' => $p->max_marks,
            'pass_marks' => $p->pass_marks,
        ];
    }
}

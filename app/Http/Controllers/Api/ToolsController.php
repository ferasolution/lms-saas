<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\ActivityLog;
use App\Models\Category;
use App\Models\Coupon;
use App\Models\Course;
use App\Models\CourseSection;
use App\Models\Enrollment;
use App\Models\Lesson;
use App\Models\Order;
use App\Models\Quiz;
use App\Models\QuizOption;
use App\Models\QuizQuestion;
use App\Models\User;
use App\Services\Billing;
use App\Services\Learning;
use App\Support\Csv;
use App\Support\Payments;
use App\Tenancy\TenantManager;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use Illuminate\Validation\Rule;
use Symfony\Component\HttpFoundation\StreamedResponse;

/**
 * Categories, coupons, course duplication, search, CSV import and exports.
 */
class ToolsController extends Controller
{
    public function __construct(protected Learning $learning, protected TenantManager $tenants) {}

    /* ============================================================ categories */

    public function categories(): JsonResponse
    {
        return response()->json(['data' => Category::withCount(['courses' => fn ($q) => $q->published()])->orderBy('name')->get(['id', 'name', 'slug'])]);
    }

    public function storeCategory(Request $request): JsonResponse
    {
        $data = $request->validate(['name' => ['required', 'string', 'max:80']]);
        $slug = Str::slug($data['name']) ?: 'category';
        abort_if(Category::where('slug', $slug)->exists(), 422, 'A category with this name already exists.');

        $c = Category::create(['name' => $data['name'], 'slug' => $slug]);

        return response()->json($c->only('id', 'name', 'slug') + ['courses_count' => 0], 201);
    }

    public function updateCategory(Request $request, Category $category): JsonResponse
    {
        $data = $request->validate(['name' => ['required', 'string', 'max:80']]);
        $category->update(['name' => $data['name'], 'slug' => Str::slug($data['name']) ?: $category->slug]);

        return response()->json($category->only('id', 'name', 'slug'));
    }

    public function destroyCategory(Category $category): JsonResponse
    {
        Course::where('category_id', $category->id)->update(['category_id' => null]);
        $category->delete();

        return response()->json(['message' => 'Category removed. Its courses are now uncategorised.']);
    }

    /* ============================================================ coupons */

    public function coupons(): JsonResponse
    {
        return response()->json(['data' => Coupon::with('course')->latest('id')->get()->map(fn ($c) => $this->couponRow($c))]);
    }

    public function storeCoupon(Request $request): JsonResponse
    {
        $tenantId = $this->tenants->id();
        $data = $request->validate([
            'code' => ['required', 'string', 'max:40', 'regex:/^[A-Za-z0-9_-]+$/', Rule::unique('coupons', 'code')->where('tenant_id', $tenantId)],
            'type' => ['required', Rule::in(['percent', 'fixed'])],
            'value' => ['required', 'numeric', 'min:0.01', $request->input('type') === 'percent' ? 'max:100' : 'max:1000000'],
            'course_id' => ['nullable', Rule::exists('courses', 'id')->where('tenant_id', $tenantId)],
            'max_uses' => ['nullable', 'integer', 'min:1'],
            'expires_at' => ['nullable', 'date', 'after:today'],
        ], ['code.regex' => 'Use letters, numbers, dashes and underscores only.', 'code.unique' => 'This code already exists.']);

        $coupon = Coupon::create(['code' => strtoupper($data['code']), 'is_active' => true] + $data);

        return response()->json($this->couponRow($coupon->load('course')), 201);
    }

    public function updateCoupon(Request $request, Coupon $coupon): JsonResponse
    {
        $data = $request->validate(['is_active' => ['required', 'boolean']]);
        $coupon->update($data);

        return response()->json($this->couponRow($coupon->load('course')));
    }

    public function destroyCoupon(Coupon $coupon): JsonResponse
    {
        abort_if($coupon->used_count > 0, 422, 'This code has been used, so it can only be turned off.');
        $coupon->delete();

        return response()->json(['message' => 'Coupon deleted.']);
    }

    /** Student: preview a code's discount on a course. */
    public function checkCoupon(Request $request, Course $course): JsonResponse
    {
        $code = $request->validate(['code' => ['required', 'string', 'max:40']])['code'];
        [$coupon, $error] = self::findCoupon($code, $course);
        abort_if($error, 422, $error);
        [$discount, $total] = self::applyCoupon($coupon, $course);

        return response()->json(['code' => $coupon->code, 'discount' => $discount, 'total' => $total, 'currency' => $course->currency]);
    }

    /** @return array{0: ?Coupon, 1: ?string} */
    public static function findCoupon(string $code, Course $course): array
    {
        $coupon = Coupon::where('code', strtoupper(trim($code)))->first();

        return match (true) {
            ! $coupon, ! $coupon->is_active => [null, 'This code isn’t valid.'],
            $coupon->course_id && (int) $coupon->course_id !== (int) $course->id => [null, 'This code doesn’t apply to this course.'],
            $coupon->expires_at && $coupon->expires_at->isPast() => [null, 'This code has expired.'],
            $coupon->max_uses && $coupon->used_count >= $coupon->max_uses => [null, 'This code has been fully used.'],
            default => [$coupon, null],
        };
    }

    /** @return array{0: float, 1: float} [discount off the current price, total to pay] */
    public static function applyCoupon(Coupon $coupon, Course $course): array
    {
        $price = $course->effectivePrice();
        $off = $coupon->type === 'percent' ? $price * (float) $coupon->value / 100 : (float) $coupon->value;
        $off = round(min($price, $off), 2);

        return [$off, round($price - $off, 2)];
    }

    protected function couponRow(Coupon $c): array
    {
        return [
            'id' => $c->id, 'code' => $c->code, 'type' => $c->type, 'value' => (float) $c->value,
            'max_uses' => $c->max_uses, 'used_count' => $c->used_count, 'expires_at' => $c->expires_at,
            'is_active' => (bool) $c->is_active, 'course' => $c->course?->only('id', 'title', 'currency'),
        ];
    }

    /* ============================================================ duplicate */

    public function duplicate(Request $request, Course $course): JsonResponse
    {
        $user = $request->user();
        $this->learning->authorizeManage($user, $course);
        app(Billing::class)->ensureCanAdd($this->tenants->current(), 'courses');

        $copy = DB::transaction(function () use ($course, $user) {
            $course->load('sections.lessons.quiz.questions.options');

            $copy = $course->replicate(['slug', 'published_at']);
            $copy->title = Str::limit($course->title, 190, '').' (copy)';
            $copy->slug = null;
            $copy->status = Course::STATUS_DRAFT;
            $copy->instructor_id = $user->hasRole(User::ROLE_ADMIN) ? $course->instructor_id : $user->id;
            $copy->save();

            foreach ($course->sections as $section) {
                $s = $section->replicate();
                $s->course_id = $copy->id;
                $s->save();

                foreach ($section->lessons as $lesson) {
                    $l = $lesson->replicate();
                    $l->course_id = $copy->id;
                    $l->section_id = $s->id;
                    $l->save();

                    if ($lesson->quiz) {
                        $q = $lesson->quiz->replicate();
                        $q->course_id = $copy->id;
                        $q->lesson_id = $l->id;
                        $q->save();
                        foreach ($lesson->quiz->questions as $question) {
                            $qq = $question->replicate();
                            $qq->quiz_id = $q->id;
                            $qq->save();
                            foreach ($question->options as $option) {
                                $o = $option->replicate();
                                $o->question_id = $qq->id;
                                $o->save();
                            }
                        }
                    }
                }
            }

            return $copy;
        });

        ActivityLog::record('course.created', "Duplicated “{$course->title}”", ['course_id' => $copy->id, 'from' => $course->id]);

        return response()->json(['id' => $copy->id, 'title' => $copy->title], 201);
    }

    /* ============================================================ search */

    public function search(Request $request): JsonResponse
    {
        $q = trim((string) $request->validate(['q' => ['required', 'string', 'min:1', 'max:100']])['q']);
        $user = $request->user();
        $like = '%'.$q.'%';
        $teaches = $user->hasRole(User::ROLE_ADMIN, User::ROLE_INSTRUCTOR);

        $courses = Course::query()
            ->when(! $teaches, fn ($x) => $x->published())
            ->when($user->hasRole(User::ROLE_INSTRUCTOR), fn ($x) => $x->where(fn ($y) => $y->where('instructor_id', $user->id)->orWhere('status', Course::STATUS_PUBLISHED)))
            ->where(fn ($x) => $x->where('title', 'like', $like)->orWhere('short_description', 'like', $like))
            ->limit(6)->get(['id', 'title', 'status']);

        $lessonCourseIds = $teaches
            ? Course::query()->when($user->hasRole(User::ROLE_INSTRUCTOR), fn ($x) => $x->where('instructor_id', $user->id))->pluck('id')
            : Enrollment::where('user_id', $user->id)->where('status', '!=', 'cancelled')->pluck('course_id');
        $lessons = Lesson::whereIn('course_id', $lessonCourseIds)->where('title', 'like', $like)->limit(6)->get(['id', 'title', 'course_id', 'type']);

        $people = $user->hasRole(User::ROLE_ADMIN)
            ? User::where(fn ($x) => $x->where('name', 'like', $like)->orWhere('email', 'like', $like))->limit(6)->get(['id', 'name', 'email', 'role'])
            : collect();

        return response()->json(compact('courses', 'lessons', 'people'));
    }

    /* ============================================================ import / export */

    /** Admin: add many people at once. Body: { rows: [{ name, email, role?, password? }] } */
    public function importPeople(Request $request): JsonResponse
    {
        $data = $request->validate([
            'rows' => ['required', 'array', 'min:1', 'max:1000'],
            'rows.*.name' => ['nullable', 'string', 'max:120'],
            'rows.*.email' => ['nullable', 'string', 'max:255'],
            'rows.*.role' => ['nullable', 'string', 'max:20'],
            'rows.*.password' => ['nullable', 'string', 'max:100'],
            'course_id' => ['nullable', 'integer'],
        ]);

        $tenant = $this->tenants->current();
        $billing = app(Billing::class);
        $course = ! empty($data['course_id']) ? Course::findOrFail($data['course_id']) : null;
        $existing = User::pluck('email')->map(fn ($e) => strtolower($e))->flip();
        $created = [];
        $skipped = [];

        foreach ($data['rows'] as $i => $row) {
            $line = $i + 2; // header is line 1
            $email = strtolower(trim((string) ($row['email'] ?? '')));
            $name = trim((string) ($row['name'] ?? ''));
            $role = strtolower(trim((string) ($row['role'] ?? ''))) ?: User::ROLE_STUDENT;
            $role = ['teacher' => 'instructor', 'students' => 'student'][$role] ?? $role;

            $reason = match (true) {
                $name === '' => 'Name is missing',
                ! filter_var($email, FILTER_VALIDATE_EMAIL) => 'Email is not valid',
                isset($existing[$email]) => 'Already has an account',
                ! in_array($role, User::TENANT_ROLES, true) => "Unknown role “{$role}”",
                default => null,
            };
            if (! $reason && $role === User::ROLE_STUDENT) {
                try {
                    $billing->ensureCanAdd($tenant, 'students');
                } catch (\Illuminate\Validation\ValidationException $e) {
                    $reason = 'Plan limit reached';
                }
            }
            if ($reason) {
                $skipped[] = ['line' => $line, 'email' => $email ?: '—', 'reason' => $reason];
                continue;
            }

            $password = trim((string) ($row['password'] ?? '')) ?: self::readablePassword();
            if (strlen($password) < 8) {
                $password = self::readablePassword();
            }
            $user = new User(['name' => $name, 'email' => $email, 'password' => $password]);
            $user->role = $role;
            $user->tenant_id = $tenant->id;
            $user->save();
            $existing[$email] = true;

            if ($course && $role === User::ROLE_STUDENT) {
                $this->learning->enrol($user, $course);
            }
            $created[] = ['name' => $name, 'email' => $email, 'role' => $role, 'password' => $password];
        }

        ActivityLog::record('user.imported', 'Imported '.count($created).' people from a spreadsheet', ['skipped' => count($skipped)]);

        return response()->json(['created' => $created, 'skipped' => $skipped]);
    }

    public function exportPeople(): StreamedResponse
    {
        $rows = User::orderBy('role')->orderBy('name')->get()->map(fn ($u) => [
            $u->name, $u->email, $u->role, $u->phone, $u->is_active ? 'active' : 'disabled',
            optional($u->last_login_at)->toDateTimeString(), $u->created_at?->toDateString(),
        ]);

        return Csv::download('people.csv', ['Name', 'Email', 'Role', 'Phone', 'Access', 'Last sign-in', 'Joined'], $rows);
    }

    public function exportPayments(): StreamedResponse
    {
        $rows = Order::with(['user', 'course' => fn ($q) => $q->withTrashed(), 'coupon'])->latest()->get()->map(fn ($o) => [
            $o->created_at?->toDateTimeString(), $o->user?->name, $o->user?->email, $o->course?->title,
            $o->amount, $o->discount, $o->total, $o->currency, Payments::label($o->gateway), $o->payment_reference,
            $o->coupon?->code, $o->status, optional($o->paid_at)->toDateTimeString(),
        ]);

        return Csv::download('payments.csv', ['Date', 'Student', 'Email', 'Course', 'Price', 'Discount', 'Paid', 'Currency', 'Method', 'Reference', 'Coupon', 'Status', 'Approved at'], $rows);
    }

    public function exportCourseStudents(Request $request, Course $course): StreamedResponse
    {
        $this->learning->authorizeManage($request->user(), $course);
        $rows = Enrollment::with('user')->where('course_id', $course->id)->get()->filter(fn ($e) => $e->user)->map(fn ($e) => [
            $e->user->name, $e->user->email, $e->status, $e->progress_percent.'%',
            optional($e->enrolled_at)->toDateString(), optional($e->completed_at)->toDateString(),
        ]);

        return Csv::download(Str::slug($course->title).'-students.csv', ['Name', 'Email', 'Status', 'Progress', 'Enrolled', 'Completed'], $rows);
    }

    public static function readablePassword(): string
    {
        $words = ['Maple', 'River', 'Cedar', 'Harbor', 'Summit', 'Willow', 'Falcon', 'Meadow', 'Canyon', 'Aspen', 'Orbit', 'Prairie'];

        return $words[random_int(0, 11)].'-'.$words[random_int(0, 11)].'-'.random_int(1000, 9999);
    }
}

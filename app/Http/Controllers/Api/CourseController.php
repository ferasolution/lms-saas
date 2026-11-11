<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Resources\CourseResource;
use App\Models\Course;
use App\Models\User;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\AnonymousResourceCollection;
use Illuminate\Validation\Rule;

class CourseController extends Controller
{
    /**
     * Admins see every course, instructors see their own, everyone else
     * sees only published courses.
     */
    public function index(Request $request): AnonymousResourceCollection
    {
        $user = $request->user();

        $courses = Course::query()
            ->with(['instructor', 'category'])
            ->withCount('enrollments')
            ->when($user->hasRole(User::ROLE_INSTRUCTOR), fn ($q) => $q->where('instructor_id', $user->id))
            ->when(! $user->hasRole(User::ROLE_ADMIN, User::ROLE_INSTRUCTOR), fn ($q) => $q->published())
            ->when($request->filled('status') && $user->hasRole(User::ROLE_ADMIN, User::ROLE_INSTRUCTOR),
                fn ($q) => $q->where('status', $request->string('status')))
            ->when($request->filled('search'), fn ($q) => $q->where('title', 'like', '%'.$request->string('search').'%'))
            ->latest()
            ->paginate(min((int) $request->integer('per_page', 15) ?: 15, 100));

        return CourseResource::collection($courses);
    }

    public function store(Request $request): JsonResponse
    {
        $user = $request->user();
        $data = $this->validated($request);

        $course = new Course($data);
        // Instructors always own what they create; admins may assign an instructor.
        $course->instructor_id = $user->hasRole(User::ROLE_ADMIN)
            ? ($data['instructor_id'] ?? $user->id)
            : $user->id;
        $course->save();

        return (new CourseResource($course->load(['instructor', 'category'])))
            ->response()
            ->setStatusCode(201);
    }

    public function show(Request $request, Course $course): CourseResource
    {
        $this->authorizeView($request->user(), $course);

        return new CourseResource($course->load(['instructor', 'category'])->loadCount('enrollments'));
    }

    public function update(Request $request, Course $course): CourseResource
    {
        $this->authorizeManage($request->user(), $course);

        $data = $this->validated($request, $course);

        if (! $request->user()->hasRole(User::ROLE_ADMIN)) {
            unset($data['instructor_id']);
        }

        $course->update($data);

        return new CourseResource($course->load(['instructor', 'category']));
    }

    public function destroy(Request $request, Course $course): JsonResponse
    {
        $this->authorizeManage($request->user(), $course);

        $course->delete();

        return response()->json(['message' => 'Course deleted.']);
    }

    protected function validated(Request $request, ?Course $course = null): array
    {
        $required = $course ? 'sometimes' : 'required';
        $tenantId = $request->user()->tenant_id;

        return $request->validate([
            'title' => [$required, 'string', 'max:200'],
            'short_description' => ['nullable', 'string', 'max:500'],
            'description' => ['nullable', 'string'],
            'thumbnail' => ['nullable', 'string', 'max:255'],
            'level' => ['sometimes', Rule::in(['beginner', 'intermediate', 'advanced'])],
            'language' => ['sometimes', 'string', 'max:10'],
            'is_free' => ['sometimes', 'boolean'],
            'price' => ['sometimes', 'numeric', 'min:0', 'max:9999999'],
            'sale_price' => ['nullable', 'numeric', 'min:0', 'lte:price'],
            'currency' => ['sometimes', 'string', 'size:3'],
            'status' => ['sometimes', Rule::in([Course::STATUS_DRAFT, Course::STATUS_PUBLISHED, Course::STATUS_ARCHIVED])],
            'category_id' => ['nullable', Rule::exists('categories', 'id')->where('tenant_id', $tenantId)],
            'instructor_id' => ['nullable', Rule::exists('users', 'id')
                ->where('tenant_id', $tenantId)
                ->whereIn('role', [User::ROLE_ADMIN, User::ROLE_INSTRUCTOR])],
        ]);
    }

    protected function authorizeView(User $user, Course $course): void
    {
        if ($course->status === Course::STATUS_PUBLISHED || $this->canManage($user, $course)) {
            return;
        }

        abort(404);
    }

    protected function authorizeManage(User $user, Course $course): void
    {
        abort_unless($this->canManage($user, $course), 403, 'You do not have permission to manage this course.');
    }

    protected function canManage(User $user, Course $course): bool
    {
        return $user->hasRole(User::ROLE_ADMIN)
            || ($user->hasRole(User::ROLE_INSTRUCTOR) && (int) $course->instructor_id === (int) $user->id);
    }
}

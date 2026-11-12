<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Resources\CourseResource;
use App\Models\Course;
use App\Models\Certificate;
use App\Models\Enrollment;
use App\Models\Order;
use App\Models\Plan;
use App\Models\User;
use App\Tenancy\TenantManager;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/**
 * Small read-only endpoints the web app needs for its public pages and dashboard.
 */
class MetaController extends Controller
{
    /** Public: plans for the pricing section. */
    public function plans(): JsonResponse
    {
        $plans = Plan::where('is_active', true)
            ->orderBy('price_monthly')
            ->get(['name', 'slug', 'price_monthly', 'currency', 'max_students', 'max_courses', 'storage_mb']);

        return response()->json(['data' => $plans]);
    }

    /** Public (inside tenant middleware): name and type for the institute's sign-in page. */
    public function tenant(TenantManager $tenants): JsonResponse
    {
        $tenant = $tenants->current();

        return response()->json([
            'name' => $tenant->name,
            'slug' => $tenant->slug,
            'type' => $tenant->type,
            'settings' => (object) collect($tenant->settings ?? [])->only(['brand', 'logo_url', 'welcome_message'])->all(),
        ]);
    }

    /** Signed in: numbers for the overview screen, scoped to what the user may see. */
    public function dashboard(Request $request): JsonResponse
    {
        $user = $request->user();
        $teaches = $user->hasRole(User::ROLE_ADMIN, User::ROLE_INSTRUCTOR);

        $courses = Course::query()
            ->when($user->hasRole(User::ROLE_INSTRUCTOR), fn ($q) => $q->where('instructor_id', $user->id))
            ->when(! $teaches, fn ($q) => $q->published());

        $byStatus = (clone $courses)->selectRaw('status, count(*) as total')->groupBy('status')->pluck('total', 'status');

        $courseIds = $user->hasRole(User::ROLE_INSTRUCTOR) ? (clone $courses)->pluck('id') : null;

        $data = [
            'courses' => [
                'total' => (int) $byStatus->sum(),
                'published' => (int) ($byStatus[Course::STATUS_PUBLISHED] ?? 0),
                'draft' => (int) ($byStatus[Course::STATUS_DRAFT] ?? 0),
                'archived' => (int) ($byStatus[Course::STATUS_ARCHIVED] ?? 0),
            ],
            'enrollments' => $teaches
                ? Enrollment::query()->when($courseIds, fn ($q) => $q->whereIn('course_id', $courseIds))->count()
                : Enrollment::where('user_id', $user->id)->count(),
            'recent_courses' => CourseResource::collection(
                (clone $courses)->with(['instructor', 'category'])->withCount('enrollments')->latest()->limit(5)->get()
            ),
        ];

        if (! $teaches) {
            $data['certificates'] = Certificate::where('user_id', $user->id)->count();
            $data['completed'] = Enrollment::where('user_id', $user->id)->where('status', 'completed')->count();
        }

        if ($user->hasRole(User::ROLE_ADMIN)) {
            $data['pending_payments'] = Order::where('status', 'pending')->count();
            $data['revenue'] = (float) Order::where('status', 'paid')->sum('total');
            $data['completions'] = Enrollment::where('status', 'completed')->count();
            $data['people'] = User::query()
                ->selectRaw('role, count(*) as total')
                ->groupBy('role')
                ->pluck('total', 'role')
                ->map(fn ($n) => (int) $n);
        }

        return response()->json($data);
    }
}

<?php

namespace App\Http\Controllers\Api\School;

use App\Http\Controllers\Controller;
use App\Models\ActivityLog;
use App\Models\User;
use App\Services\Notifier;
use App\Services\School;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

/**
 * Institute-wide switches: which modules are on, remote-learning mode,
 * and the audit trail of who did what.
 */
class AdminController extends Controller
{
    public const MODULES = ['admissions', 'attendance', 'diary', 'timetable', 'exams', 'fees', 'hr', 'accounts', 'library', 'campus', 'meetings', 'events', 'messages', 'helpdesk', 'courses', 'live', 'ai'];

    public function __construct(protected School $school) {}

    public function modules(Request $request): JsonResponse
    {
        $data = $request->validate(['modules' => ['required', 'array'], 'modules.*' => ['boolean']]);
        $tenant = $this->school->tenant();
        $settings = $tenant->settings ?? [];
        $settings['modules'] = array_intersect_key(array_merge($settings['modules'] ?? [], $data['modules']), array_flip(self::MODULES));
        $tenant->settings = $settings;
        $tenant->save();
        ActivityLog::record('settings.modules', 'Changed which modules are on', $data['modules']);

        return response()->json(['modules' => $settings['modules']]);
    }

    /** Switch the whole school to remote learning (or back). */
    public function remoteMode(Request $request): JsonResponse
    {
        $data = $request->validate([
            'active' => ['required', 'boolean'],
            'message' => ['nullable', 'string', 'max:500'],
            'until' => ['nullable', 'date'],
        ]);
        $tenant = $this->school->tenant();
        $settings = $tenant->settings ?? [];
        $settings['remote_mode'] = $data['active']
            ? ['active' => true, 'message' => $data['message'] ?? null, 'until' => $data['until'] ?? null, 'since' => now()->toIso8601String(), 'by' => $request->user()->name]
            : ['active' => false];
        $tenant->settings = $settings;
        $tenant->save();

        $everyone = User::where('is_active', true)->where('id', '!=', $request->user()->id)->pluck('id')->all();
        app(Notifier::class)->send($everyone, 'remote_mode',
            $data['active'] ? 'School is moving to remote learning' : 'School is back to normal classes',
            $data['active'] ? ($data['message'] ?? 'Classes continue online. Check your timetable for links.') : ($data['message'] ?? null),
            '/timetable', $tenant->id);
        ActivityLog::record('school.remote_mode', $data['active'] ? 'Switched to remote learning' : 'Ended remote learning');

        return response()->json(['remote_mode' => $settings['remote_mode']]);
    }

    public function audit(Request $request): JsonResponse
    {
        $q = ActivityLog::with('user')->where('tenant_id', $this->school->tenant()->id)
            ->when($request->filled('action'), fn ($q) => $q->where('action', 'like', $request->string('action').'%'))
            ->when($request->filled('user_id'), fn ($q) => $q->where('user_id', $request->integer('user_id')))
            ->when($request->filled('search'), fn ($q) => $q->where('description', 'like', '%'.$request->string('search').'%'))
            ->latest('id');
        $page = $q->paginate(50);

        return response()->json([
            'data' => $page->getCollection()->map(fn ($a) => [
                'id' => $a->id, 'action' => $a->action, 'description' => $a->description, 'meta' => $a->meta,
                'user' => $a->user?->only('id', 'name', 'role'), 'ip' => $a->ip, 'at' => $a->created_at?->toIso8601String(),
            ]),
            'meta' => ['total' => $page->total(), 'current_page' => $page->currentPage(), 'last_page' => $page->lastPage()],
        ]);
    }
}

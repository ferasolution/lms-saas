<?php

namespace App\Http\Controllers\Api\Central;

use App\Http\Controllers\Controller;
use App\Models\ActivityLog;
use App\Models\Certificate;
use App\Models\Course;
use App\Models\Enrollment;
use App\Models\Order;
use App\Models\Plan;
use App\Models\PlatformSetting;
use App\Models\Subscription;
use App\Models\Tenant;
use App\Models\User;
use App\Services\Billing;
use Carbon\CarbonPeriod;
use Illuminate\Foundation\Application;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\File;
use Illuminate\Support\Facades\Storage;
use Illuminate\Validation\Rule;
use Throwable;

/**
 * Everything the platform owner sees. These routes run without a tenant, so
 * tenant-scoped models return rows from every institute.
 */
class ConsoleController extends Controller
{
    public function __construct(protected Billing $billing) {}

    /* ------------------------------------------------------------ overview */

    public function overview(): JsonResponse
    {
        $byStatus = Tenant::query()->selectRaw('status, count(*) as total')->groupBy('status')->pluck('total', 'status');
        $monthStart = now()->startOfMonth();

        // Sign-ups per day for the last 30 days (grouped in PHP so it works on any database).
        $since = now()->subDays(29)->startOfDay();
        $signups = Tenant::where('created_at', '>=', $since)->pluck('created_at')
            ->countBy(fn ($d) => $d->toDateString());
        $signupSeries = collect(CarbonPeriod::create($since, now()))
            ->map(fn ($d) => ['date' => $d->toDateString(), 'count' => (int) ($signups[$d->toDateString()] ?? 0)])->values();

        // Subscription revenue per month, last 6 months.
        $from = now()->subMonths(5)->startOfMonth();
        $subs = Subscription::where('status', 'active')->where('reviewed_at', '>=', $from)->get(['amount', 'reviewed_at']);
        $revenueSeries = collect(range(5, 0))->map(function ($ago) use ($subs) {
            $m = now()->subMonths($ago);
            return [
                'month' => $m->format('Y-m'),
                'label' => $m->format('M'),
                'amount' => round((float) $subs->filter(fn ($s) => $s->reviewed_at->format('Y-m') === $m->format('Y-m'))->sum('amount'), 2),
            ];
        })->values();

        $trialsEnding = Tenant::where('status', Tenant::STATUS_TRIAL)
            ->whereBetween('trial_ends_at', [now(), now()->addDays(7)])
            ->orderBy('trial_ends_at')->limit(8)
            ->get(['id', 'name', 'slug', 'type', 'trial_ends_at']);

        $topTenants = Tenant::query()
            ->withCount(['users as students_count' => fn ($q) => $q->where('role', User::ROLE_STUDENT)])
            ->withCount('courses')
            ->orderByDesc('students_count')->limit(5)
            ->get(['id', 'name', 'slug', 'type', 'status']);

        return response()->json([
            'tenants' => [
                'total' => (int) $byStatus->sum(),
                'trial' => (int) ($byStatus['trial'] ?? 0),
                'active' => (int) ($byStatus['active'] ?? 0),
                'suspended' => (int) ($byStatus['suspended'] ?? 0),
                'new_30_days' => (int) $signupSeries->sum('count'),
                'paying' => Tenant::whereNotNull('plan_id')->where('plan_ends_at', '>', now())
                    ->whereIn('plan_id', Plan::where('price_monthly', '>', 0)->select('id'))->count(),
            ],
            'people' => [
                'users' => User::whereNotNull('tenant_id')->count(),
                'students' => User::where('role', User::ROLE_STUDENT)->count(),
                'teachers' => User::where('role', User::ROLE_INSTRUCTOR)->count(),
                'active_7_days' => User::whereNotNull('tenant_id')->where('last_login_at', '>=', now()->subDays(7))->count(),
            ],
            'learning' => [
                'courses' => Course::count(),
                'published' => Course::where('status', Course::STATUS_PUBLISHED)->count(),
                'enrollments' => Enrollment::count(),
                'certificates' => Certificate::count(),
            ],
            'revenue' => [
                'subscriptions_total' => (float) Subscription::where('status', 'active')->sum('amount'),
                'subscriptions_month' => (float) Subscription::where('status', 'active')->where('reviewed_at', '>=', $monthStart)->sum('amount'),
                'pending_subscriptions' => Subscription::where('status', 'pending')->count(),
                'institute_fees_total' => (float) Order::where('status', 'paid')->sum('total'),
                'institute_fees_month' => (float) Order::where('status', 'paid')->where('paid_at', '>=', $monthStart)->sum('total'),
                'pending_orders' => Order::where('status', 'pending')->count(),
            ],
            'signups' => $signupSeries,
            'revenue_series' => $revenueSeries,
            'trials_ending' => $trialsEnding,
            'top_tenants' => $topTenants,
            'activity' => $this->activityRows(ActivityLog::with(['tenant', 'user'])->latest('id')->limit(12)->get()),
        ]);
    }

    /* ------------------------------------------------------------ institutes */

    public function tenants(Request $request): JsonResponse
    {
        $tenants = Tenant::query()
            ->with('plan')
            ->withCount(['users', 'courses', 'users as students_count' => fn ($q) => $q->where('role', User::ROLE_STUDENT)])
            ->withMax('users as last_login_at', 'last_login_at')
            ->when($request->filled('status'), fn ($q) => $q->where('status', $request->string('status')))
            ->when($request->filled('type'), fn ($q) => $q->where('type', $request->string('type')))
            ->when($request->filled('search'), fn ($q) => $q->where(function ($q) use ($request) {
                $term = '%'.$request->string('search').'%';
                $q->where('name', 'like', $term)->orWhere('slug', 'like', $term);
            }))
            ->latest()
            ->paginate(30);

        return response()->json([
            'data' => collect($tenants->items())->map(fn (Tenant $t) => $this->tenantRow($t)),
            'meta' => ['total' => $tenants->total(), 'page' => $tenants->currentPage(), 'last_page' => $tenants->lastPage()],
        ]);
    }

    public function tenant(Tenant $tenant): JsonResponse
    {
        $tenant->load('plan')->loadCount(['users', 'courses']);
        $effective = $this->billing->effective($tenant);
        $roles = User::where('tenant_id', $tenant->id)->selectRaw('role, count(*) as total')->groupBy('role')->pluck('total', 'role');

        return response()->json([
            'tenant' => $this->tenantRow($tenant) + [
                'settings' => $tenant->settings ?? (object) [],
                'plan_ends_at' => $tenant->plan_ends_at,
            ],
            'effective' => [
                'plan' => $effective['plan']?->only('id', 'name', 'slug', 'max_students', 'max_courses', 'storage_mb'),
                'source' => $effective['source'],
                'ends_at' => $effective['ends_at'],
            ],
            'usage' => $this->billing->usage($tenant),
            'roles' => $roles,
            'admins' => User::where('tenant_id', $tenant->id)->where('role', User::ROLE_ADMIN)
                ->get(['id', 'name', 'email', 'phone', 'is_active', 'last_login_at', 'created_at']),
            'courses' => Course::where('tenant_id', $tenant->id)->withCount('enrollments')->latest()->limit(50)
                ->get(['id', 'title', 'status', 'is_free', 'price', 'sale_price', 'currency', 'created_at']),
            'orders' => [
                'paid_total' => (float) Order::where('tenant_id', $tenant->id)->where('status', 'paid')->sum('total'),
                'pending' => Order::where('tenant_id', $tenant->id)->where('status', 'pending')->count(),
                'recent' => Order::with(['user', 'course' => fn ($q) => $q->withTrashed()])->where('tenant_id', $tenant->id)->latest()->limit(10)->get()
                    ->map(fn ($o) => $this->orderRow($o)),
            ],
            'subscriptions' => Subscription::with('plan')->where('tenant_id', $tenant->id)->latest()->get()
                ->map(fn ($s) => $this->subscriptionRow($s)),
            'enrollments' => Enrollment::where('tenant_id', $tenant->id)->count(),
            'certificates' => Certificate::where('tenant_id', $tenant->id)->count(),
            'activity' => $this->activityRows(ActivityLog::with(['tenant', 'user'])->where('tenant_id', $tenant->id)->latest('id')->limit(25)->get()),
            'plans' => Plan::orderBy('price_monthly')->get(['id', 'name', 'slug', 'price_monthly']),
        ]);
    }

    public function updateTenant(Request $request, Tenant $tenant): JsonResponse
    {
        $data = $request->validate([
            'name' => ['sometimes', 'string', 'max:120'],
            'status' => ['sometimes', Rule::in([Tenant::STATUS_TRIAL, Tenant::STATUS_ACTIVE, Tenant::STATUS_SUSPENDED])],
            'plan_id' => ['sometimes', 'nullable', 'exists:plans,id'],
            'plan_ends_at' => ['sometimes', 'nullable', 'date'],
            'trial_ends_at' => ['sometimes', 'nullable', 'date'],
        ]);

        $before = $tenant->only(array_keys($data));
        $tenant->update($data);

        $changes = collect($data)->keys()->map(fn ($k) => $k.': '.(is_scalar($before[$k] ?? null) ? $before[$k] : ($before[$k] ?? '—')).' → '.($tenant->{$k} instanceof \DateTimeInterface ? $tenant->{$k}->toDateString() : ($tenant->{$k} ?? '—')))->implode(', ');
        ActivityLog::record('tenant.updated', "Platform changed {$tenant->name}: {$changes}", $data, $tenant->id);

        return $this->tenant($tenant->refresh());
    }

    /** Sign in as the institute's admin to help them. Short-lived and logged. */
    public function impersonate(Request $request, Tenant $tenant): JsonResponse
    {
        $admin = User::where('tenant_id', $tenant->id)->where('role', User::ROLE_ADMIN)->where('is_active', true)->orderBy('id')->first();
        abort_unless($admin, 422, 'This institute has no active admin to sign in as.');

        $token = $admin->createToken('support:'.$request->user()->email, ['*'], now()->addHours(2))->plainTextToken;
        ActivityLog::record('support.impersonate', "{$request->user()->email} opened {$tenant->name} as {$admin->name} for support", ['admin_id' => $admin->id], $tenant->id, $request->user());

        return response()->json(['slug' => $tenant->slug, 'token' => $token, 'admin' => $admin->only('id', 'name', 'email')]);
    }

    /* ------------------------------------------------------------ subscriptions */

    public function subscriptions(Request $request): JsonResponse
    {
        $status = $request->validate(['status' => ['nullable', Rule::in(['pending', 'active', 'rejected'])]])['status'] ?? null;

        $subs = Subscription::with(['tenant', 'plan', 'requester', 'reviewer'])
            ->when($status, fn ($q) => $q->where('status', $status))
            ->latest()->paginate(50);

        return response()->json([
            'data' => collect($subs->items())->map(fn ($s) => $this->subscriptionRow($s, true)),
            'meta' => ['total' => $subs->total()],
            'summary' => [
                'pending' => Subscription::where('status', 'pending')->count(),
                'active' => Subscription::where('status', 'active')->count(),
                'revenue' => (float) Subscription::where('status', 'active')->sum('amount'),
            ],
        ]);
    }

    public function approveSubscription(Request $request, Subscription $subscription): JsonResponse
    {
        abort_unless($subscription->status === 'pending', 422, 'Only pending payments can be approved.');

        DB::transaction(function () use ($request, $subscription) {
            $tenant = Tenant::findOrFail($subscription->tenant_id);
            $plan = Plan::findOrFail($subscription->plan_id);
            $this->billing->activate($tenant, $plan, $subscription->months);

            $subscription->status = 'active';
            $subscription->starts_at = now();
            $subscription->ends_at = $tenant->plan_ends_at;
            $subscription->reviewed_by = $request->user()->id;
            $subscription->reviewed_at = now();
            $subscription->save();

            ActivityLog::record('subscription.approved', "Approved {$plan->name} × {$subscription->months} ".($subscription->months === 1 ? 'month' : 'months')." for {$tenant->name}", ['subscription_id' => $subscription->id], $tenant->id, $request->user());
        });

        return response()->json($this->subscriptionRow($subscription->load(['tenant', 'plan', 'requester', 'reviewer']), true));
    }

    public function rejectSubscription(Request $request, Subscription $subscription): JsonResponse
    {
        abort_unless($subscription->status === 'pending', 422, 'Only pending payments can be rejected.');
        $data = $request->validate(['note' => ['nullable', 'string', 'max:500']]);

        $subscription->status = 'rejected';
        $subscription->note = $data['note'] ?? $subscription->note;
        $subscription->reviewed_by = $request->user()->id;
        $subscription->reviewed_at = now();
        $subscription->save();

        $reason = ! empty($data['note']) ? ": {$data['note']}" : '';
        ActivityLog::record('subscription.rejected', "Rejected a plan payment{$reason}", ['subscription_id' => $subscription->id], $subscription->tenant_id, $request->user());

        return response()->json($this->subscriptionRow($subscription->load(['tenant', 'plan', 'requester', 'reviewer']), true));
    }

    /* ------------------------------------------------------------ student payments, users, activity */

    public function payments(Request $request): JsonResponse
    {
        $data = $request->validate([
            'status' => ['nullable', Rule::in(['pending', 'paid', 'failed'])],
            'tenant_id' => ['nullable', 'integer'],
            'search' => ['nullable', 'string', 'max:100'],
        ]);

        $orders = Order::with(['tenant', 'user', 'course' => fn ($q) => $q->withTrashed()])
            ->when($data['status'] ?? null, fn ($q, $s) => $q->where('status', $s))
            ->when($data['tenant_id'] ?? null, fn ($q, $t) => $q->where('tenant_id', $t))
            ->when($data['search'] ?? null, fn ($q, $s) => $q->where(fn ($q) => $q
                ->where('payment_reference', 'like', "%{$s}%")
                ->orWhereIn('user_id', User::where('name', 'like', "%{$s}%")->orWhere('email', 'like', "%{$s}%")->select('id'))))
            ->latest()->paginate(50);

        return response()->json([
            'data' => collect($orders->items())->map(fn ($o) => $this->orderRow($o) + ['tenant' => $o->tenant?->only('id', 'name', 'slug')]),
            'meta' => ['total' => $orders->total()],
            'summary' => [
                'pending' => Order::where('status', 'pending')->count(),
                'paid' => Order::where('status', 'paid')->count(),
                'volume' => (float) Order::where('status', 'paid')->sum('total'),
            ],
        ]);
    }

    public function users(Request $request): JsonResponse
    {
        $data = $request->validate([
            'search' => ['nullable', 'string', 'max:100'],
            'role' => ['nullable', Rule::in(User::TENANT_ROLES)],
            'tenant_id' => ['nullable', 'integer'],
        ]);

        $users = User::with('tenant')
            ->whereNotNull('tenant_id')
            ->when($data['role'] ?? null, fn ($q, $r) => $q->where('role', $r))
            ->when($data['tenant_id'] ?? null, fn ($q, $t) => $q->where('tenant_id', $t))
            ->when($data['search'] ?? null, fn ($q, $s) => $q->where(fn ($q) => $q->where('name', 'like', "%{$s}%")->orWhere('email', 'like', "%{$s}%")))
            ->latest()->paginate(50);

        $roles = User::whereNotNull('tenant_id')->selectRaw('role, count(*) as total')->groupBy('role')->pluck('total', 'role');

        return response()->json([
            'data' => collect($users->items())->map(fn (User $u) => [
                'id' => $u->id, 'name' => $u->name, 'email' => $u->email, 'phone' => $u->phone, 'role' => $u->role,
                'is_active' => (bool) $u->is_active, 'last_login_at' => $u->last_login_at, 'created_at' => $u->created_at,
                'tenant' => $u->tenant?->only('id', 'name', 'slug'),
            ]),
            'meta' => ['total' => $users->total()],
            'roles' => $roles,
        ]);
    }

    public function activity(Request $request): JsonResponse
    {
        $data = $request->validate([
            'tenant_id' => ['nullable', 'integer'],
            'action' => ['nullable', 'string', 'max:40'],
            'page' => ['nullable', 'integer', 'min:1'],
        ]);

        $logs = ActivityLog::with(['tenant', 'user'])
            ->when($data['tenant_id'] ?? null, fn ($q, $t) => $q->where('tenant_id', $t))
            ->when($data['action'] ?? null, fn ($q, $a) => $q->where('action', 'like', "{$a}%"))
            ->latest('id')->paginate(50);

        return response()->json([
            'data' => $this->activityRows(collect($logs->items())),
            'meta' => ['total' => $logs->total(), 'page' => $logs->currentPage(), 'last_page' => $logs->lastPage()],
        ]);
    }

    /* ------------------------------------------------------------ system health */

    public function health(): JsonResponse
    {
        $checks = [];

        // Database
        try {
            $t = microtime(true);
            DB::select('select 1');
            $ms = round((microtime(true) - $t) * 1000, 1);
            $driver = DB::connection()->getDriverName();
            $size = null;
            if ($driver === 'mysql' || $driver === 'mariadb') {
                $size = (float) (DB::selectOne('select sum(data_length + index_length) as s from information_schema.tables where table_schema = database()')->s ?? 0);
            } elseif ($driver === 'sqlite') {
                $path = DB::connection()->getDatabaseName();
                $size = is_file($path) ? filesize($path) : null;
            }
            $checks['database'] = ['ok' => true, 'driver' => $driver, 'latency_ms' => $ms, 'size_mb' => $size !== null ? round($size / 1048576, 1) : null];
        } catch (Throwable $e) {
            $checks['database'] = ['ok' => false, 'error' => $e->getMessage()];
        }

        // Migrations
        try {
            $ran = app('migrator')->getRepository()->getRan();
            $files = collect(File::glob(database_path('migrations/*.php')))->map(fn ($f) => basename($f, '.php'));
            $pending = $files->diff($ran)->values();
            $checks['migrations'] = ['ok' => $pending->isEmpty(), 'ran' => count($ran), 'pending' => $pending, 'latest' => collect($ran)->sort()->last()];
        } catch (Throwable $e) {
            $checks['migrations'] = ['ok' => false, 'error' => $e->getMessage()];
        }

        // Cache
        try {
            Cache::put('health:ping', 'pong', 10);
            $checks['cache'] = ['ok' => Cache::get('health:ping') === 'pong', 'store' => config('cache.default')];
        } catch (Throwable $e) {
            $checks['cache'] = ['ok' => false, 'error' => $e->getMessage()];
        }

        // Storage and disk
        $free = @disk_free_space(storage_path());
        $total = @disk_total_space(storage_path());
        $uploads = Cache::remember('health:uploads', 600, function () {
            $dir = Storage::disk('public')->path('tenants');
            if (! is_dir($dir)) {
                return ['files' => 0, 'mb' => 0];
            }
            $bytes = 0;
            $count = 0;
            foreach (File::allFiles($dir) as $f) {
                $bytes += $f->getSize();
                $count++;
            }

            return ['files' => $count, 'mb' => round($bytes / 1048576, 1)];
        });
        $writable = collect(['storage/app', 'storage/framework/cache', 'storage/framework/views', 'storage/logs', 'bootstrap/cache'])
            ->mapWithKeys(fn ($d) => [$d => is_writable(base_path($d))]);
        $checks['storage'] = [
            'ok' => $writable->every(fn ($w) => $w) && file_exists(public_path('storage')),
            'uploads' => $uploads,
            'disk_free_gb' => $free ? round($free / 1073741824, 1) : null,
            'disk_total_gb' => $total ? round($total / 1073741824, 1) : null,
            'public_link' => file_exists(public_path('storage')),
            'writable' => $writable,
        ];

        // Queue
        try {
            $checks['queue'] = [
                'ok' => true,
                'connection' => config('queue.default'),
                'waiting' => DB::table('jobs')->count(),
                'failed' => DB::table('failed_jobs')->count(),
            ];
            $checks['queue']['ok'] = $checks['queue']['failed'] === 0;
        } catch (Throwable $e) {
            $checks['queue'] = ['ok' => false, 'error' => $e->getMessage()];
        }

        // Recent errors from the log
        $errors = [];
        $log = storage_path('logs/laravel.log');
        if (is_file($log)) {
            $fh = fopen($log, 'r');
            $size = filesize($log);
            fseek($fh, max(0, $size - 131072));
            $tail = stream_get_contents($fh);
            fclose($fh);
            preg_match_all('/^\[(\d{4}-\d{2}-\d{2}[ T][\d:]+)[^\]]*\] \w+\.(ERROR|CRITICAL|ALERT|EMERGENCY): (.+)$/m', $tail, $m, PREG_SET_ORDER);
            foreach (array_slice(array_reverse($m), 0, 10) as $row) {
                $errors[] = ['at' => $row[1], 'level' => $row[2], 'message' => mb_substr($row[3], 0, 300)];
            }
        }
        $latest = $errors ? \Illuminate\Support\Carbon::parse($errors[0]['at']) : null;
        $checks['errors'] = ['ok' => ! $latest || $latest->lt(now()->subDay()), 'recent' => $errors];

        // Environment
        $exts = collect(['pdo_mysql', 'mbstring', 'openssl', 'fileinfo', 'gd', 'curl', 'zip'])->mapWithKeys(fn ($e) => [$e => extension_loaded($e)]);
        $checks['app'] = [
            'ok' => ! config('app.debug') && app()->isProduction(),
            'php' => PHP_VERSION,
            'laravel' => Application::VERSION,
            'environment' => app()->environment(),
            'debug' => (bool) config('app.debug'),
            'url' => config('app.url'),
            'timezone' => config('app.timezone'),
            'extensions' => $exts,
            'deploy_hook' => strlen((string) config('app.deploy_token')) >= 32,
        ];

        return response()->json(['checks' => $checks, 'checked_at' => now()]);
    }

    /* ------------------------------------------------------------ platform settings */

    public function settings(): JsonResponse
    {
        return response()->json([
            'payments' => PlatformSetting::get('payments', (object) []),
            'support' => PlatformSetting::get('support', (object) []),
        ]);
    }

    public function updateSettings(Request $request): JsonResponse
    {
        $data = $request->validate([
            'payments' => ['sometimes', 'array'],
            'payments.jazzcash' => ['nullable', 'string', 'max:120'],
            'payments.easypaisa' => ['nullable', 'string', 'max:120'],
            'payments.bank' => ['nullable', 'string', 'max:500'],
            'payments.instructions' => ['nullable', 'string', 'max:1000'],
            'support' => ['sometimes', 'array'],
            'support.email' => ['nullable', 'email', 'max:255'],
            'support.phone' => ['nullable', 'string', 'max:30'],
        ]);

        foreach (['payments', 'support'] as $key) {
            if (array_key_exists($key, $data)) {
                PlatformSetting::put($key, $data[$key]);
            }
        }
        ActivityLog::record('platform.settings', 'Updated platform settings', [], null, $request->user());

        return $this->settings();
    }

    /* ------------------------------------------------------------ helpers */

    protected function tenantRow(Tenant $t): array
    {
        $effective = $this->billing->effective($t);

        return [
            'id' => $t->id,
            'name' => $t->name,
            'slug' => $t->slug,
            'type' => $t->type,
            'status' => $t->status,
            'trial_ends_at' => $t->trial_ends_at,
            'plan' => $t->relationLoaded('plan') ? $t->plan?->only('id', 'name', 'slug') : null,
            'plan_ends_at' => $t->plan_ends_at,
            'effective_plan' => $effective['plan']?->name,
            'plan_source' => $effective['source'],
            'users_count' => $t->users_count ?? null,
            'students_count' => $t->students_count ?? null,
            'courses_count' => $t->courses_count ?? null,
            'last_login_at' => $t->last_login_at ?? null,
            'created_at' => $t->created_at,
        ];
    }

    protected function orderRow(Order $o): array
    {
        return [
            'id' => $o->id, 'status' => $o->status, 'total' => $o->total, 'currency' => $o->currency,
            'payment_method' => $o->gateway, 'payment_reference' => $o->payment_reference, 'note' => $o->note,
            'created_at' => $o->created_at, 'paid_at' => $o->paid_at,
            'user' => $o->user?->only('id', 'name', 'email'),
            'course' => $o->course?->only('id', 'title'),
        ];
    }

    protected function subscriptionRow(Subscription $s, bool $withTenant = false): array
    {
        return array_filter([
            'id' => $s->id, 'status' => $s->status, 'months' => $s->months, 'amount' => $s->amount, 'currency' => $s->currency,
            'payment_method' => $s->gateway, 'payment_reference' => $s->payment_reference, 'note' => $s->note,
            'created_at' => $s->created_at, 'reviewed_at' => $s->reviewed_at, 'ends_at' => $s->ends_at,
            'plan' => $s->plan?->only('id', 'name', 'slug'),
            'requester' => $s->relationLoaded('requester') ? $s->requester?->only('id', 'name', 'email') : null,
            'reviewer' => $s->relationLoaded('reviewer') ? $s->reviewer?->only('id', 'name') : null,
            'tenant' => $withTenant ? $s->tenant?->only('id', 'name', 'slug') : null,
        ], fn ($v, $k) => $v !== null || ! in_array($k, ['tenant', 'requester', 'reviewer'], true), ARRAY_FILTER_USE_BOTH);
    }

    protected function activityRows($logs): array
    {
        return collect($logs)->map(fn (ActivityLog $l) => [
            'id' => $l->id,
            'action' => $l->action,
            'description' => $l->description,
            'created_at' => $l->created_at,
            'ip' => $l->ip,
            'tenant' => $l->tenant?->only('id', 'name', 'slug'),
            'user' => $l->user?->only('id', 'name', 'role'),
        ])->values()->all();
    }
}

<?php

use App\Http\Controllers\Api\AuthController;
use App\Http\Controllers\Api\BillingController;
use App\Http\Controllers\Api\Central\ConsoleController;
use App\Http\Controllers\Api\Central\PlatformController;
use App\Http\Controllers\Api\CourseController;
use App\Http\Controllers\Api\CurriculumController;
use App\Http\Controllers\Api\EngagementController;
use App\Http\Controllers\Api\ToolsController;
use App\Http\Controllers\Api\LearningController;
use App\Http\Controllers\Api\OrderController;
use App\Http\Controllers\Api\QuizController;
use App\Http\Controllers\Api\SettingsController;
use App\Http\Controllers\Api\UploadController;
use App\Http\Controllers\Api\MetaController;
use App\Http\Controllers\Api\TenantRegistrationController;
use App\Http\Controllers\Api\UserController;
use App\Http\Controllers\DeployController;
use App\Http\Controllers\InstallController;
use Illuminate\Support\Facades\Route;

// First-run web installer (works only while the server has no .env). No
// throttle here: the cache table it would need does not exist yet.
Route::get('install', [InstallController::class, 'status']);
Route::post('install', [InstallController::class, 'install']);

// Post-deploy hook for FTP deploys (see DeployController). Needs DEPLOY_TOKEN.
Route::post('deploy-hook', DeployController::class);

/*
|--------------------------------------------------------------------------
| Central (platform) routes — no tenant
|--------------------------------------------------------------------------
*/
Route::get('plans', [MetaController::class, 'plans']);
Route::get('certificates/{code}', [LearningController::class, 'verifyCertificate'])
    ->where('code', '[0-9a-fA-F-]{36}')->middleware('throttle:60,1');

Route::post('register-institute', [TenantRegistrationController::class, 'store'])
    ->middleware('throttle:5,1');

Route::prefix('platform')->group(function () {
    Route::get('setup', [PlatformController::class, 'setupStatus']);
    Route::post('setup', [PlatformController::class, 'setup'])->middleware('throttle:5,1');
    Route::post('login', [PlatformController::class, 'login'])->middleware('throttle:10,1');

    Route::middleware(['auth:sanctum', 'role:super_admin'])->group(function () {
        Route::get('me', [PlatformController::class, 'me']);
        Route::get('stats', [PlatformController::class, 'stats']);
        Route::get('overview', [ConsoleController::class, 'overview']);
        Route::get('tenants', [ConsoleController::class, 'tenants']);
        Route::get('tenants/{tenant}', [ConsoleController::class, 'tenant']);
        Route::patch('tenants/{tenant}', [ConsoleController::class, 'updateTenant']);
        Route::post('tenants/{tenant}/impersonate', [ConsoleController::class, 'impersonate']);
        Route::get('subscriptions', [ConsoleController::class, 'subscriptions']);
        Route::post('subscriptions/{subscription}/approve', [ConsoleController::class, 'approveSubscription']);
        Route::post('subscriptions/{subscription}/reject', [ConsoleController::class, 'rejectSubscription']);
        Route::get('payments', [ConsoleController::class, 'payments']);
        Route::get('users', [ConsoleController::class, 'users']);
        Route::post('users/{user}/reset-password', [ConsoleController::class, 'resetPassword']);
        Route::patch('users/{user}', [ConsoleController::class, 'updateUser']);
        Route::get('activity', [ConsoleController::class, 'activity']);
        Route::get('health', [ConsoleController::class, 'health']);
        Route::get('plans', [ConsoleController::class, 'plans']);
        Route::post('plans', [ConsoleController::class, 'createPlan']);
        Route::patch('plans/{plan}', [ConsoleController::class, 'updatePlan']);
        Route::get('announcements', [ConsoleController::class, 'announcements']);
        Route::post('announcements', [ConsoleController::class, 'broadcast']);
        Route::get('exports/institutes.csv', [ConsoleController::class, 'exportTenants']);
        Route::get('exports/users.csv', [ConsoleController::class, 'exportUsers']);
        Route::get('settings', [ConsoleController::class, 'settings']);
        Route::put('settings', [ConsoleController::class, 'updateSettings']);
    });
});

/*
|--------------------------------------------------------------------------
| Tenant routes — tenant resolved from subdomain, custom domain or X-Tenant
|--------------------------------------------------------------------------
*/
Route::middleware('tenant')->group(function () {
    Route::get('tenant', [MetaController::class, 'tenant']);
    Route::post('auth/login', [AuthController::class, 'login'])->middleware('throttle:10,1');

    Route::middleware(['auth:sanctum', 'role'])->group(function () {
        Route::get('auth/me', [AuthController::class, 'me']);
        Route::post('auth/logout', [AuthController::class, 'logout']);
        Route::get('dashboard', [MetaController::class, 'dashboard']);

        Route::patch('auth/me', [SettingsController::class, 'updateProfile']);

        Route::get('courses', [CourseController::class, 'index']);
        Route::get('courses/{course}', [CourseController::class, 'show']);
        Route::get('courses/{course}/curriculum', [CurriculumController::class, 'show']);

        // Notifications, announcements, search
        Route::get('notifications', [EngagementController::class, 'notifications']);
        Route::post('notifications/read', [EngagementController::class, 'readNotifications']);
        Route::get('announcements', [EngagementController::class, 'announcements']);
        Route::post('announcements', [EngagementController::class, 'storeAnnouncement'])->middleware('role:admin,instructor');
        Route::delete('announcements/{announcement}', [EngagementController::class, 'destroyAnnouncement']);
        Route::get('search', [ToolsController::class, 'search']);
        Route::get('categories', [ToolsController::class, 'categories']);

        // Reviews and discussion
        Route::get('courses/{course}/reviews', [EngagementController::class, 'reviews']);
        Route::post('courses/{course}/reviews', [EngagementController::class, 'storeReview']);
        Route::delete('reviews/{review}', [EngagementController::class, 'destroyReview']);
        Route::get('lessons/{lesson}/comments', [EngagementController::class, 'comments']);
        Route::post('lessons/{lesson}/comments', [EngagementController::class, 'storeComment'])->middleware('throttle:30,1');
        Route::delete('comments/{comment}', [EngagementController::class, 'destroyComment']);

        // Assignments (student side) and coupons at checkout
        Route::get('lessons/{lesson}/submission', [EngagementController::class, 'mySubmission']);
        Route::post('lessons/{lesson}/submission', [EngagementController::class, 'submit']);
        Route::post('courses/{course}/coupon-check', [ToolsController::class, 'checkCoupon'])->middleware('throttle:20,1');

        // Learning
        Route::post('courses/{course}/enrol', [LearningController::class, 'enrol'])->middleware('throttle:20,1');
        Route::get('my/courses', [LearningController::class, 'myCourses']);
        Route::get('my/certificates', [LearningController::class, 'myCertificates']);
        Route::post('lessons/{lesson}/complete', [LearningController::class, 'completeLesson']);
        Route::get('quizzes/{quiz}', [QuizController::class, 'show']);
        Route::post('quizzes/{quiz}/start', [QuizController::class, 'start']);
        Route::post('quiz-attempts/{attempt}/submit', [QuizController::class, 'submit']);

        Route::middleware('role:admin,instructor')->group(function () {
            Route::post('courses', [CourseController::class, 'store']);
            Route::match(['put', 'patch'], 'courses/{course}', [CourseController::class, 'update']);
            Route::delete('courses/{course}', [CourseController::class, 'destroy']);

            // Course builder
            Route::post('courses/{course}/sections', [CurriculumController::class, 'storeSection']);
            Route::patch('sections/{section}', [CurriculumController::class, 'updateSection']);
            Route::delete('sections/{section}', [CurriculumController::class, 'destroySection']);
            Route::post('sections/{section}/lessons', [CurriculumController::class, 'storeLesson']);
            Route::patch('lessons/{lesson}', [CurriculumController::class, 'updateLesson']);
            Route::delete('lessons/{lesson}', [CurriculumController::class, 'destroyLesson']);
            Route::put('courses/{course}/order', [CurriculumController::class, 'reorder']);
            Route::put('quizzes/{quiz}', [QuizController::class, 'update']);
            Route::post('uploads', [UploadController::class, 'store'])->middleware('throttle:30,1');
            Route::post('courses/{course}/duplicate', [ToolsController::class, 'duplicate']);
            Route::get('submissions', [EngagementController::class, 'submissions']);
            Route::patch('submissions/{submission}', [EngagementController::class, 'grade']);
            Route::get('exports/courses/{course}/students.csv', [ToolsController::class, 'exportCourseStudents']);

            // Who is enrolled
            Route::get('courses/{course}/students', [LearningController::class, 'students']);
            Route::post('courses/{course}/students', [LearningController::class, 'addStudents']);
            Route::delete('courses/{course}/students/{user}', [LearningController::class, 'removeStudent']);
        });

        Route::middleware('role:admin')->group(function () {
            Route::get('users', [UserController::class, 'index']);
            Route::post('users', [UserController::class, 'store']);
            Route::patch('users/{user}', [UserController::class, 'update']);

            Route::patch('settings', [SettingsController::class, 'update']);
            Route::post('categories', [ToolsController::class, 'storeCategory']);
            Route::patch('categories/{category}', [ToolsController::class, 'updateCategory']);
            Route::delete('categories/{category}', [ToolsController::class, 'destroyCategory']);
            Route::get('coupons', [ToolsController::class, 'coupons']);
            Route::post('coupons', [ToolsController::class, 'storeCoupon']);
            Route::patch('coupons/{coupon}', [ToolsController::class, 'updateCoupon']);
            Route::delete('coupons/{coupon}', [ToolsController::class, 'destroyCoupon']);
            Route::post('users/import', [ToolsController::class, 'importPeople'])->middleware('throttle:10,1');
            Route::get('exports/people.csv', [ToolsController::class, 'exportPeople']);
            Route::get('exports/payments.csv', [ToolsController::class, 'exportPayments']);
            Route::get('billing', [BillingController::class, 'show']);
            Route::post('billing/subscribe', [BillingController::class, 'subscribe'])->middleware('throttle:10,1');
            Route::get('orders', [OrderController::class, 'index']);
            Route::post('orders/{order}/approve', [OrderController::class, 'approve']);
            Route::post('orders/{order}/reject', [OrderController::class, 'reject']);
        });
    });
});

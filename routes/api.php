<?php

use App\Http\Controllers\Api\AuthController;
use App\Http\Controllers\Api\Central\PlatformController;
use App\Http\Controllers\Api\CourseController;
use App\Http\Controllers\Api\TenantRegistrationController;
use App\Http\Controllers\Api\UserController;
use App\Http\Controllers\DeployController;
use Illuminate\Support\Facades\Route;

// Post-deploy hook for FTP deploys (see DeployController). Needs DEPLOY_TOKEN.
Route::post('_deploy', DeployController::class);

/*
|--------------------------------------------------------------------------
| Central (platform) routes — no tenant
|--------------------------------------------------------------------------
*/
Route::post('register-institute', [TenantRegistrationController::class, 'store'])
    ->middleware('throttle:5,1');

Route::prefix('platform')->group(function () {
    Route::get('setup', [PlatformController::class, 'setupStatus']);
    Route::post('setup', [PlatformController::class, 'setup'])->middleware('throttle:5,1');
    Route::post('login', [PlatformController::class, 'login'])->middleware('throttle:10,1');

    Route::middleware(['auth:sanctum', 'role:super_admin'])->group(function () {
        Route::get('tenants', [PlatformController::class, 'tenants']);
        Route::patch('tenants/{tenant}', [PlatformController::class, 'updateTenant']);
    });
});

/*
|--------------------------------------------------------------------------
| Tenant routes — tenant resolved from subdomain, custom domain or X-Tenant
|--------------------------------------------------------------------------
*/
Route::middleware('tenant')->group(function () {
    Route::post('auth/login', [AuthController::class, 'login'])->middleware('throttle:10,1');

    Route::middleware(['auth:sanctum', 'role'])->group(function () {
        Route::get('auth/me', [AuthController::class, 'me']);
        Route::post('auth/logout', [AuthController::class, 'logout']);

        Route::get('courses', [CourseController::class, 'index']);
        Route::get('courses/{course}', [CourseController::class, 'show']);

        Route::middleware('role:admin,instructor')->group(function () {
            Route::post('courses', [CourseController::class, 'store']);
            Route::match(['put', 'patch'], 'courses/{course}', [CourseController::class, 'update']);
            Route::delete('courses/{course}', [CourseController::class, 'destroy']);
        });

        Route::middleware('role:admin')->group(function () {
            Route::get('users', [UserController::class, 'index']);
            Route::post('users', [UserController::class, 'store']);
            Route::patch('users/{user}', [UserController::class, 'update']);
        });
    });
});

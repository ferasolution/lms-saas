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
use App\Http\Controllers\Api\School\AdmissionController;
use App\Http\Controllers\Api\School\AttendanceController;
use App\Http\Controllers\Api\School\DiaryController;
use App\Http\Controllers\Api\School\ExamController;
use App\Http\Controllers\Api\School\FeeController;
use App\Http\Controllers\Api\School\HrController;
use App\Http\Controllers\Api\School\AccountsController;
use App\Http\Controllers\Api\School\AdminController;
use App\Http\Controllers\Api\School\AiController;
use App\Http\Controllers\Api\School\CommunityController;
use App\Http\Controllers\Api\School\OperationsController;
use App\Http\Controllers\Api\School\OverviewController;
use App\Http\Controllers\Api\School\StructureController;
use App\Http\Controllers\Api\School\StudentController;
use App\Http\Controllers\Api\School\TimetableController;
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

    // Public admission form
    Route::get('admissions/form', [AdmissionController::class, 'form']);
    Route::post('admissions/apply', [AdmissionController::class, 'apply'])->middleware(['throttle:5,1', 'module:admissions']);

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
        // Anyone signed in can upload an image or PDF (course covers, lesson files, assignment work).
        Route::post('uploads', [UploadController::class, 'store'])->middleware('throttle:20,1');

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

        /*
        | School: families (parents and students)
        */
        Route::prefix('school')->group(function () {
            Route::get('family', [OverviewController::class, 'family'])->middleware('role:parent,student');
            Route::get('diary', [DiaryController::class, 'index'])->middleware('module:diary');
            Route::post('diary/{entry}/submit', [DiaryController::class, 'submit'])->middleware(['role:parent,student', 'throttle:30,1'])->middleware('module:diary');
            Route::get('timetable/mine', [TimetableController::class, 'mine'])->middleware('module:timetable');
            Route::get('timetable/sections/{section}', [TimetableController::class, 'section'])->middleware('module:timetable');
            Route::get('leave', [AttendanceController::class, 'leaves'])->middleware('module:attendance');
            Route::post('leave', [AttendanceController::class, 'requestLeave'])->middleware(['role:parent,student', 'throttle:10,1'])->middleware('module:attendance');
            Route::get('students/{student}', [StudentController::class, 'show']);
            Route::get('fees/mine', [FeeController::class, 'family'])->middleware('role:parent,student')->middleware('module:fees');
            Route::get('exams/mine', [ExamController::class, 'mine'])->middleware('role:parent,student')->middleware('module:exams');

            // Everyone: messages, helpdesk, meetings, events, library, transport
            Route::get('messages/contacts', [CommunityController::class, 'contacts'])->middleware('module:messages');
            Route::get('messages', [CommunityController::class, 'conversations'])->middleware('module:messages');
            Route::post('messages', [CommunityController::class, 'start'])->middleware('throttle:20,1')->middleware('module:messages');
            Route::get('messages/{conversation}', [CommunityController::class, 'thread'])->middleware('module:messages');
            Route::post('messages/{conversation}', [CommunityController::class, 'reply'])->middleware('throttle:60,1')->middleware('module:messages');
            Route::get('helpdesk', [CommunityController::class, 'tickets'])->middleware('module:helpdesk');
            Route::post('helpdesk', [CommunityController::class, 'openTicket'])->middleware('throttle:10,1')->middleware('module:helpdesk');
            Route::get('helpdesk/{ticket}', [CommunityController::class, 'ticket'])->middleware('module:helpdesk');
            Route::post('helpdesk/{ticket}/replies', [CommunityController::class, 'replyTicket'])->middleware('throttle:30,1')->middleware('module:helpdesk');
            Route::get('meetings', [CommunityController::class, 'ptmEvents'])->middleware('module:meetings');
            Route::post('meetings/{event}/book', [CommunityController::class, 'book'])->middleware('role:parent')->middleware('module:meetings');
            Route::patch('meeting-bookings/{booking}', [CommunityController::class, 'updateBooking'])->middleware('module:meetings');
            Route::get('events', [CommunityController::class, 'events'])->middleware('module:events');
            Route::post('events/{event}/respond', [CommunityController::class, 'respond'])->middleware('role:parent')->middleware('module:events');
            Route::get('library/books', [OperationsController::class, 'books'])->middleware('module:library');
            Route::get('library/mine', [OperationsController::class, 'myLoans'])->middleware('module:library');
            Route::get('transport/mine', [OperationsController::class, 'myTransport'])->middleware('module:campus');
            Route::get('ai', [AiController::class, 'status']);
            Route::post('ai', [AiController::class, 'generate'])->middleware(['module:ai', 'throttle:15,1']);
            Route::get('exams/{exam}/report/{student}', [ExamController::class, 'report'])->middleware('module:exams');
            Route::get('fees/invoices/{invoice}', [FeeController::class, 'show'])->middleware('module:fees');
            Route::post('fees/invoices/{invoice}/report-payment', [FeeController::class, 'reportPayment'])->middleware(['role:parent,student', 'throttle:10,1'])->middleware('module:fees');

            // Staff (teachers and the office)
            Route::middleware('role:admin,manager,instructor')->group(function () {
                Route::get('structure', [StructureController::class, 'index']);
                Route::get('teacher-day', [OverviewController::class, 'teacher']);
                Route::get('students', [StudentController::class, 'index']);
                Route::get('attendance', [AttendanceController::class, 'sheet'])->middleware('module:attendance');
                Route::post('attendance', [AttendanceController::class, 'save'])->middleware('module:attendance');
                Route::get('attendance/month', [AttendanceController::class, 'month'])->middleware('module:attendance');
                Route::get('attendance/month.csv', [AttendanceController::class, 'exportMonth'])->middleware('module:attendance');
                Route::get('attendance/today', [AttendanceController::class, 'today'])->middleware('module:attendance');
                Route::post('leave/{leave}/review', [AttendanceController::class, 'reviewLeave'])->middleware('module:attendance');
                Route::post('diary', [DiaryController::class, 'store'])->middleware('module:diary');
                Route::patch('diary/{entry}', [DiaryController::class, 'update'])->middleware('module:diary');
                Route::delete('diary/{entry}', [DiaryController::class, 'destroy'])->middleware('module:diary');
                Route::get('diary/{entry}/submissions', [DiaryController::class, 'submissions'])->middleware('module:diary');
                Route::patch('homework/{submission}', [DiaryController::class, 'check'])->middleware('module:diary');

                Route::post('events', [CommunityController::class, 'storeEvent'])->middleware('module:events');
                Route::get('events/{event}/responses', [CommunityController::class, 'eventResponses'])->middleware('module:events');
                Route::get('hr/me', [HrController::class, 'me'])->middleware('module:hr');
                Route::post('hr/me/leave', [HrController::class, 'requestLeave'])->middleware('throttle:10,1')->middleware('module:hr');
                Route::get('hr/payslips/{payslip}', [HrController::class, 'payslip'])->middleware('module:hr');

                Route::get('grade-scale', [ExamController::class, 'scale'])->middleware('module:exams');
                Route::get('exams', [ExamController::class, 'index'])->middleware('module:exams');
                Route::get('exams/{exam}', [ExamController::class, 'show'])->middleware('module:exams');
                Route::get('exams/{exam}/results', [ExamController::class, 'results'])->middleware('module:exams');
                Route::get('exams/{exam}/results.csv', [ExamController::class, 'exportResults'])->middleware('module:exams');
                Route::get('exam-papers/{paper}/marks', [ExamController::class, 'marks'])->middleware('module:exams');
                Route::put('exam-papers/{paper}/marks', [ExamController::class, 'saveMarks'])->middleware('module:exams');
            });

            // The school office
            Route::middleware('role:admin,manager')->group(function () {
                Route::get('overview', [OverviewController::class, 'office']);
                Route::post('years', [StructureController::class, 'storeYear']);
                Route::patch('years/{year}', [StructureController::class, 'updateYear']);
                Route::delete('years/{year}', [StructureController::class, 'destroyYear']);
                Route::post('classes', [StructureController::class, 'storeClass']);
                Route::patch('classes/{class}', [StructureController::class, 'updateClass']);
                Route::delete('classes/{class}', [StructureController::class, 'destroyClass']);
                Route::post('classes/{class}/sections', [StructureController::class, 'storeSection']);
                Route::patch('sections/{section}', [StructureController::class, 'updateSection']);
                Route::delete('sections/{section}', [StructureController::class, 'destroySection']);
                Route::put('sections/{section}/subjects', [StructureController::class, 'allocate']);
                Route::put('timetable/sections/{section}', [TimetableController::class, 'save'])->middleware('module:timetable');
                Route::post('subjects', [StructureController::class, 'storeSubject']);
                Route::patch('subjects/{subject}', [StructureController::class, 'updateSubject']);
                Route::delete('subjects/{subject}', [StructureController::class, 'destroySubject']);

                Route::post('students', [StudentController::class, 'store']);
                Route::patch('students/{student}', [StudentController::class, 'update']);
                Route::post('students/promote', [StudentController::class, 'promote']);
                Route::post('students/{student}/guardians', [StudentController::class, 'addGuardian']);
                Route::delete('students/{student}/guardians/{guardian}', [StudentController::class, 'removeGuardian']);
                Route::get('exports/students.csv', [StudentController::class, 'export']);

                // Institute switches
                Route::put('modules', [AdminController::class, 'modules']);
                Route::post('remote-mode', [AdminController::class, 'remoteMode']);
                Route::get('audit', [AdminController::class, 'audit']);

                // Operations
                Route::get('people-search', [OperationsController::class, 'people']);
                Route::post('library/books', [OperationsController::class, 'storeBook'])->middleware('module:library');
                Route::patch('library/books/{book}', [OperationsController::class, 'updateBook'])->middleware('module:library');
                Route::delete('library/books/{book}', [OperationsController::class, 'destroyBook'])->middleware('module:library');
                Route::get('library/loans', [OperationsController::class, 'loans'])->middleware('module:library');
                Route::post('library/loans', [OperationsController::class, 'issue'])->middleware('module:library');
                Route::post('library/loans/{loan}/return', [OperationsController::class, 'returnLoan'])->middleware('module:library');
                Route::get('transport/routes', [OperationsController::class, 'routes'])->middleware('module:campus');
                Route::post('transport/routes', [OperationsController::class, 'storeRoute'])->middleware('module:campus');
                Route::patch('transport/routes/{transportRoute}', [OperationsController::class, 'updateRoute'])->middleware('module:campus');
                Route::delete('transport/routes/{transportRoute}', [OperationsController::class, 'destroyRoute'])->middleware('module:campus');
                Route::post('transport/routes/{transportRoute}/students', [OperationsController::class, 'assign'])->middleware('module:campus');
                Route::delete('transport/routes/{transportRoute}/students/{student}', [OperationsController::class, 'unassign'])->middleware('module:campus');
                Route::get('inventory', [OperationsController::class, 'items'])->middleware('module:campus');
                Route::post('inventory', [OperationsController::class, 'storeItem'])->middleware('module:campus');
                Route::patch('inventory/{item}', [OperationsController::class, 'updateItem'])->middleware('module:campus');
                Route::delete('inventory/{item}', [OperationsController::class, 'destroyItem'])->middleware('module:campus');
                Route::post('inventory/{item}/move', [OperationsController::class, 'move'])->middleware('module:campus');
                Route::get('inventory/{item}/movements', [OperationsController::class, 'movements'])->middleware('module:campus');
                Route::get('visitors', [OperationsController::class, 'visitors'])->middleware('module:campus');
                Route::post('visitors', [OperationsController::class, 'checkIn'])->middleware('module:campus');
                Route::post('visitors/{visitor}/out', [OperationsController::class, 'checkOut'])->middleware('module:campus');
                Route::get('visitors/export.csv', [OperationsController::class, 'exportVisitors'])->middleware('module:campus');
                Route::patch('helpdesk/{ticket}', [CommunityController::class, 'updateTicket'])->middleware('module:helpdesk');
                Route::post('meetings', [CommunityController::class, 'storePtm'])->middleware('module:meetings');
                Route::delete('meetings/{event}', [CommunityController::class, 'destroyPtm'])->middleware('module:meetings');
                Route::patch('events/{event}', [CommunityController::class, 'updateEvent'])->middleware('module:events');
                Route::delete('events/{event}', [CommunityController::class, 'destroyEvent'])->middleware('module:events');

                // HR and payroll
                Route::get('hr/employees', [HrController::class, 'employees'])->middleware('module:hr');
                Route::post('hr/employees', [HrController::class, 'storeEmployee'])->middleware('module:hr');
                Route::patch('hr/employees/{employee}', [HrController::class, 'updateEmployee'])->middleware('module:hr');
                Route::post('hr/employees/import-accounts', [HrController::class, 'importAccounts'])->middleware('module:hr');
                Route::get('hr/exports/employees.csv', [HrController::class, 'export'])->middleware('module:hr');
                Route::get('hr/attendance', [HrController::class, 'attendance'])->middleware('module:hr');
                Route::post('hr/attendance', [HrController::class, 'saveAttendance'])->middleware('module:hr');
                Route::get('hr/leaves', [HrController::class, 'leaves'])->middleware('module:hr');
                Route::post('hr/leaves', [HrController::class, 'storeLeave'])->middleware('module:hr');
                Route::post('hr/leaves/{leave}/review', [HrController::class, 'reviewLeave'])->middleware('module:hr');
                Route::get('hr/payroll', [HrController::class, 'payrollRuns'])->middleware('module:hr');
                Route::post('hr/payroll', [HrController::class, 'createRun'])->middleware('module:hr');
                Route::get('hr/payroll/{run}', [HrController::class, 'showRun'])->middleware('module:hr');
                Route::post('hr/payroll/{run}/recalculate', [HrController::class, 'recalculate'])->middleware('module:hr');
                Route::post('hr/payroll/{run}/status', [HrController::class, 'advanceRun'])->middleware('module:hr');
                Route::delete('hr/payroll/{run}', [HrController::class, 'destroyRun'])->middleware('module:hr');
                Route::get('hr/payroll/{run}/export.csv', [HrController::class, 'exportRun'])->middleware('module:hr');
                Route::patch('hr/payslips/{payslip}', [HrController::class, 'updateSlip'])->middleware('module:hr');

                // Accounts
                Route::get('accounts/summary', [AccountsController::class, 'summary'])->middleware('module:accounts');
                Route::get('accounts/entries', [AccountsController::class, 'index'])->middleware('module:accounts');
                Route::post('accounts/entries', [AccountsController::class, 'store'])->middleware('module:accounts');
                Route::patch('accounts/entries/{entry}', [AccountsController::class, 'update'])->middleware('module:accounts');
                Route::delete('accounts/entries/{entry}', [AccountsController::class, 'destroy'])->middleware('module:accounts');
                Route::get('accounts/export.csv', [AccountsController::class, 'export'])->middleware('module:accounts');

                // Exams
                Route::put('grade-scale', [ExamController::class, 'saveScale'])->middleware('module:exams');
                Route::post('exams', [ExamController::class, 'store'])->middleware('module:exams');
                Route::patch('exams/{exam}', [ExamController::class, 'update'])->middleware('module:exams');
                Route::delete('exams/{exam}', [ExamController::class, 'destroy'])->middleware('module:exams');
                Route::post('exams/{exam}/papers', [ExamController::class, 'addPapers'])->middleware('module:exams');
                Route::patch('exam-papers/{paper}', [ExamController::class, 'updatePaper'])->middleware('module:exams');
                Route::delete('exam-papers/{paper}', [ExamController::class, 'destroyPaper'])->middleware('module:exams');

                // Fees
                Route::get('fees/setup', [FeeController::class, 'setup'])->middleware('module:fees');
                Route::post('fees/heads', [FeeController::class, 'storeHead'])->middleware('module:fees');
                Route::patch('fees/heads/{head}', [FeeController::class, 'updateHead'])->middleware('module:fees');
                Route::delete('fees/heads/{head}', [FeeController::class, 'destroyHead'])->middleware('module:fees');
                Route::put('fees/plans/{class}', [FeeController::class, 'savePlan'])->middleware('module:fees');
                Route::get('fees/discounts', [FeeController::class, 'discounts'])->middleware('module:fees');
                Route::post('fees/discounts', [FeeController::class, 'storeDiscount'])->middleware('module:fees');
                Route::delete('fees/discounts/{discount}', [FeeController::class, 'destroyDiscount'])->middleware('module:fees');
                Route::post('fees/generate', [FeeController::class, 'generate'])->middleware('throttle:10,1')->middleware('module:fees');
                Route::get('fees/invoices', [FeeController::class, 'index'])->middleware('module:fees');
                Route::post('fees/invoices', [FeeController::class, 'store'])->middleware('module:fees');
                Route::patch('fees/invoices/{invoice}', [FeeController::class, 'update'])->middleware('module:fees');
                Route::post('fees/invoices/{invoice}/payments', [FeeController::class, 'recordPayment'])->middleware('module:fees');
                Route::get('fees/payments', [FeeController::class, 'payments'])->middleware('module:fees');
                Route::post('fees/payments/{payment}/review', [FeeController::class, 'reviewPayment'])->middleware('module:fees');
                Route::post('fees/reminders', [FeeController::class, 'remind'])->middleware('throttle:5,1')->middleware('module:fees');
                Route::get('fees/summary', [FeeController::class, 'summary'])->middleware('module:fees');
                Route::get('fees/exports/invoices.csv', [FeeController::class, 'exportInvoices'])->middleware('module:fees');
                Route::get('fees/exports/payments.csv', [FeeController::class, 'exportPayments'])->middleware('module:fees');

                Route::get('admissions', [AdmissionController::class, 'index'])->middleware('module:admissions');
                Route::post('admissions', [AdmissionController::class, 'store'])->middleware('module:admissions');
                Route::patch('admissions/{application}', [AdmissionController::class, 'update'])->middleware('module:admissions');
                Route::post('admissions/{application}/enrol', [AdmissionController::class, 'enrol'])->middleware('module:admissions');
                Route::delete('admissions/{application}', [AdmissionController::class, 'destroy'])->middleware('module:admissions');
            });
        });

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

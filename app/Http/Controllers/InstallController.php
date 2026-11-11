<?php

namespace App\Http\Controllers;

use App\Models\User;
use Illuminate\Encryption\Encrypter;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Artisan;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\File;
use Illuminate\Validation\Rules\Password;
use Illuminate\Validation\ValidationException;
use PDO;
use Throwable;

/**
 * First-run web installer for hosting without a terminal.
 *
 * Works only while the server has no .env file. To stop strangers from using it
 * in that window, it asks for the FTP password: the deploy workflow uploads a
 * hash of it to storage/app/install.key (outside the public web root).
 *
 * On success it migrates the database, creates the platform owner, and writes
 * .env with a fresh APP_KEY and DEPLOY_TOKEN. The token is shown once so it can
 * be added to GitHub; from then on deploys use it.
 */
class InstallController extends Controller
{
    public const KEY_PREFIX = 'lms-install:';

    public function status(): JsonResponse
    {
        return response()->json([
            'installed' => $this->installed(),
            'ready' => is_file($this->keyPath()),
        ]);
    }

    public function install(Request $request): JsonResponse
    {
        if ($this->installed()) {
            return response()->json(['message' => 'Already installed.'], 409);
        }

        if (! is_file($this->keyPath())) {
            return response()->json([
                'message' => 'Installer is not ready. Run a deploy from GitHub first.',
            ], 423);
        }

        $data = $request->validate([
            'install_key' => ['required', 'string'],
            'app_url' => ['required', 'url:https,http', 'max:255'],
            'db_host' => ['required', 'string', 'max:255'],
            'db_port' => ['required', 'integer', 'between:1,65535'],
            'db_database' => ['required', 'string', 'max:64', 'regex:/^[A-Za-z0-9_\-]+$/'],
            'db_username' => ['required', 'string', 'max:64', 'regex:/^[A-Za-z0-9_\-.@]+$/'],
            'db_password' => ['nullable', 'string', 'max:255', 'not_regex:/[\'\r\n]/'],
            'admin_name' => ['required', 'string', 'max:120'],
            'admin_email' => ['required', 'email', 'max:255'],
            'admin_password' => ['required', 'confirmed', Password::min(10)],
        ], [
            'db_password.not_regex' => "The database password cannot contain a single quote (') or line break. Change it in cPanel and try again.",
        ]);

        $expected = trim((string) file_get_contents($this->keyPath()));

        if (! hash_equals($expected, hash('sha256', self::KEY_PREFIX.$data['install_key']))) {
            throw ValidationException::withMessages(['install_key' => 'This is not the FTP password for this site.']);
        }

        $db = [
            'driver' => 'mysql',
            'host' => $data['db_host'],
            'port' => (int) $data['db_port'],
            'database' => $data['db_database'],
            'username' => $data['db_username'],
            'password' => $data['db_password'] ?? '',
            'charset' => 'utf8mb4',
            'collation' => 'utf8mb4_unicode_ci',
            'prefix' => '',
            'strict' => true,
            'engine' => null,
        ];

        // 1. Can we reach the database at all?
        try {
            new PDO(
                "mysql:host={$db['host']};port={$db['port']};dbname={$db['database']};charset=utf8mb4",
                $db['username'],
                $db['password'],
                [PDO::ATTR_TIMEOUT => 5, PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION],
            );
        } catch (Throwable $e) {
            throw ValidationException::withMessages([
                'db_database' => 'Could not connect to the database: '.$this->cleanDbError($e->getMessage()),
            ]);
        }

        $appKey = 'base64:'.base64_encode(Encrypter::generateKey('aes-256-cbc'));
        $deployToken = bin2hex(random_bytes(32));

        // 2. Use the new settings for the rest of this request.
        config([
            'app.key' => $appKey,
            'database.connections.mysql' => array_merge(config('database.connections.mysql', []), $db),
            'database.default' => 'mysql',
            'cache.default' => 'array',
        ]);
        DB::purge('mysql');

        // 3. Create tables, plans and the owner account. Safe to repeat if a
        //    previous attempt failed half way, because .env is written last.
        try {
            Artisan::call('migrate', ['--force' => true]);
            Artisan::call('db:seed', ['--force' => true]);
        } catch (Throwable $e) {
            return response()->json([
                'message' => 'Database setup failed: '.$this->cleanDbError($e->getMessage()),
            ], 500);
        }

        $owner = User::withoutGlobalScope('tenant')
            ->whereNull('tenant_id')
            ->where('email', strtolower($data['admin_email']))
            ->first() ?? new User(['email' => strtolower($data['admin_email'])]);
        $owner->name = $data['admin_name'];
        $owner->password = $data['admin_password'];
        $owner->role = User::ROLE_SUPER_ADMIN;
        $owner->tenant_id = null;
        $owner->is_active = true;
        $owner->save();

        File::ensureDirectoryExists(storage_path('app/public'));

        // 4. Finally write .env. From now on this installer is closed.
        $url = rtrim($data['app_url'], '/');
        $env = $this->envFile([
            'APP_NAME' => 'Fera Learn',
            'APP_ENV' => 'production',
            'APP_KEY' => $appKey,
            'APP_DEBUG' => 'false',
            'APP_URL' => $url,
            'TENANCY_CENTRAL_DOMAIN' => parse_url($url, PHP_URL_HOST),
            'DEPLOY_TOKEN' => $deployToken,
            'LOG_CHANNEL' => 'stack',
            'LOG_STACK' => 'single',
            'LOG_LEVEL' => 'error',
            'DB_CONNECTION' => 'mysql',
            'DB_HOST' => $db['host'],
            'DB_PORT' => (string) $db['port'],
            'DB_DATABASE' => $db['database'],
            'DB_USERNAME' => $db['username'],
            'DB_PASSWORD' => $db['password'],
            'SESSION_DRIVER' => 'database',
            'CACHE_STORE' => 'database',
            'QUEUE_CONNECTION' => 'database',
            'FILESYSTEM_DISK' => 'local',
            'MAIL_MAILER' => 'log',
        ]);

        $path = app()->environmentFilePath();

        if (@file_put_contents($path, $env, LOCK_EX) === false) {
            return response()->json([
                'message' => 'Database is ready, but the .env file could not be written. Check that the site folder is writable.',
            ], 500);
        }
        @chmod($path, 0640);
        @unlink($this->keyPath());

        return response()->json([
            'installed' => true,
            'deploy_token' => $deployToken,
            'owner_email' => $owner->email,
        ], 201);
    }

    protected function installed(): bool
    {
        return is_file(app()->environmentFilePath());
    }

    protected function keyPath(): string
    {
        return storage_path('app/install.key');
    }

    /** @param array<string, string|null> $values */
    protected function envFile(array $values): string
    {
        $lines = [];

        foreach ($values as $key => $value) {
            $value = (string) $value;
            // Single quotes keep the value literal ($ and # are not interpreted).
            $lines[] = $value === '' || preg_match('/^[A-Za-z0-9_\-.:\/@]+$/', $value)
                ? "{$key}={$value}"
                : "{$key}='{$value}'";
        }

        return "# Written by the web installer on ".now()->toDateTimeString()."\n".implode("\n", $lines)."\n";
    }

    /** Keep connection errors useful without echoing the password. */
    protected function cleanDbError(string $message): string
    {
        if (str_contains($message, 'Access denied')) {
            return 'username or password is wrong, or the user is not added to this database.';
        }
        if (str_contains($message, 'Unknown database')) {
            return 'no database with this name. Use the full name shown in cPanel (with the prefix).';
        }
        if (str_contains($message, 'getaddrinfo') || str_contains($message, 'Connection refused') || str_contains($message, 'timed out')) {
            return 'the database server did not answer. On Bluehost the host is usually "localhost".';
        }

        return preg_replace('/\(SQL:.*$/s', '', $message);
    }
}

<?php

namespace App\Http\Controllers;

use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Artisan;
use Illuminate\Support\Facades\File;
use Throwable;

/**
 * Post-deploy hook for hosting without SSH (FTP-only deploys).
 *
 * GitHub Actions uploads the files over FTP, then calls this endpoint with the
 * DEPLOY_TOKEN to run migrations and rebuild caches. If DEPLOY_TOKEN is not set
 * in the server's .env, the endpoint does not exist (404).
 */
class DeployController extends Controller
{
    public function __invoke(Request $request): JsonResponse
    {
        $expected = (string) config('app.deploy_token');
        $given = (string) $request->header('X-Deploy-Token');

        if (strlen($expected) < 32) {
            abort(404);
        }

        if (! hash_equals($expected, $given)) {
            abort(403, 'Invalid deploy token.');
        }

        $this->ensureStorageFolders();

        $log = [];
        $steps = [
            // Not optimize:clear: it also clears the database cache, whose table
            // does not exist yet on the very first deploy.
            ['config:clear', []],
            ['route:clear', []],
            ['view:clear', []],
            ['event:clear', []],
            ['clear-compiled', []],
            ['migrate', ['--force' => true]],
            ['db:seed', ['--force' => true]],
            ['optimize', []],
        ];

        foreach ($steps as [$command, $args]) {
            try {
                $code = Artisan::call($command, $args);
                $log[] = ['command' => $command, 'ok' => $code === 0, 'output' => trim(Artisan::output())];

                if ($code !== 0) {
                    return response()->json(['ok' => false, 'steps' => $log], 500);
                }
            } catch (Throwable $e) {
                $log[] = ['command' => $command, 'ok' => false, 'output' => $e->getMessage()];

                return response()->json(['ok' => false, 'steps' => $log], 500);
            }
        }

        if (! file_exists(public_path('storage'))) {
            try {
                Artisan::call('storage:link');
                $log[] = ['command' => 'storage:link', 'ok' => true, 'output' => trim(Artisan::output())];
            } catch (Throwable $e) {
                // Some hosts disable symlinks; uploads can still be served another way later.
                $log[] = ['command' => 'storage:link', 'ok' => false, 'output' => $e->getMessage()];
            }
        }

        return response()->json(['ok' => true, 'steps' => $log]);
    }

    /** FTP uploads skip empty folders, so make sure Laravel's writable folders exist. */
    protected function ensureStorageFolders(): void
    {
        foreach ([
            'app/public', 'framework/cache/data', 'framework/sessions', 'framework/views', 'logs',
        ] as $dir) {
            File::ensureDirectoryExists(storage_path($dir));
        }

        File::ensureDirectoryExists(base_path('bootstrap/cache'));
    }
}

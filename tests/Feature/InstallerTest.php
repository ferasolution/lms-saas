<?php

namespace Tests\Feature;

use App\Http\Controllers\InstallController;
use App\Models\Plan;
use App\Models\User;
use Illuminate\Support\Facades\File;
use Tests\TestCase;

class InstallerTest extends TestCase
{
    private string $envDir;

    private string $ftpPassword = 'ftp-secret-123';

    protected function setUp(): void
    {
        parent::setUp();

        // Point the app at an empty folder so it looks like a server with no .env yet.
        $this->envDir = sys_get_temp_dir().'/lms-install-'.uniqid();
        File::ensureDirectoryExists($this->envDir);
        $this->app->useEnvironmentPath($this->envDir);

        File::ensureDirectoryExists(storage_path('app'));
        file_put_contents(storage_path('app/install.key'), hash('sha256', InstallController::KEY_PREFIX.$this->ftpPassword));
    }

    protected function tearDown(): void
    {
        @unlink(storage_path('app/install.key'));
        File::deleteDirectory($this->envDir);

        parent::tearDown();
    }

    private function payload(array $overrides = []): array
    {
        return array_merge([
            'install_key' => $this->ftpPassword,
            'app_url' => 'https://lms.example.com',
            'db_host' => getenv('MYSQL_TEST_HOST') ?: '127.0.0.1',
            'db_port' => (int) (getenv('MYSQL_TEST_PORT') ?: 3306),
            'db_database' => getenv('MYSQL_TEST_DATABASE') ?: 'lms_install_test',
            'db_username' => getenv('MYSQL_TEST_USERNAME') ?: 'root',
            'db_password' => getenv('MYSQL_TEST_PASSWORD') ?: '',
            'admin_name' => 'Owner',
            'admin_email' => 'Owner@Example.com',
            'admin_password' => 'long-password',
            'admin_password_confirmation' => 'long-password',
        ], $overrides);
    }

    public function test_installer_page_loads_without_env(): void
    {
        $this->get('/install')->assertOk()->assertSee('id="app"', false);
        $this->getJson('/api/install')->assertOk()->assertJson(['installed' => false, 'ready' => true]);
    }

    public function test_installer_is_closed_once_env_exists(): void
    {
        file_put_contents($this->envDir.'/.env', "APP_KEY=x\n");

        $this->getJson('/api/install')->assertJson(['installed' => true]);
        $this->postJson('/api/install', $this->payload())->assertStatus(409);
    }

    public function test_installer_waits_for_a_deploy(): void
    {
        unlink(storage_path('app/install.key'));

        $this->getJson('/api/install')->assertJson(['ready' => false]);
        $this->postJson('/api/install', $this->payload())->assertStatus(423);
    }

    public function test_wrong_ftp_password_is_rejected(): void
    {
        $this->postJson('/api/install', $this->payload(['install_key' => 'guess']))
            ->assertUnprocessable()
            ->assertJsonValidationErrors('install_key');

        $this->assertFileDoesNotExist($this->envDir.'/.env');
    }

    public function test_password_with_single_quote_is_rejected(): void
    {
        $this->postJson('/api/install', $this->payload(['db_password' => "it's"]))
            ->assertUnprocessable()
            ->assertJsonValidationErrors('db_password');
    }

    public function test_full_install_against_mysql(): void
    {
        if (! getenv('MYSQL_TEST_HOST')) {
            $this->markTestSkipped('Set MYSQL_TEST_HOST to run the installer against MySQL.');
        }

        $response = $this->postJson('/api/install', $this->payload(['db_password' => getenv('MYSQL_TEST_PASSWORD').'']));

        $response->assertCreated()->assertJsonPath('owner_email', 'owner@example.com');
        $token = $response->json('deploy_token');
        $this->assertSame(64, strlen($token));

        $env = file_get_contents($this->envDir.'/.env');
        $this->assertStringContainsString("DEPLOY_TOKEN={$token}", $env);
        $this->assertStringContainsString('DB_CONNECTION=mysql', $env);
        $this->assertStringContainsString('TENANCY_CENTRAL_DOMAIN=lms.example.com', $env);
        $this->assertMatchesRegularExpression('/^APP_KEY=base64:[A-Za-z0-9+\/=]{44}$/m', $env);

        // Tables, plans and the owner exist in MySQL.
        $this->assertSame('mysql', config('database.default'));
        $this->assertTrue(Plan::where('slug', 'free')->exists());
        $this->assertTrue(User::where('email', 'owner@example.com')->first()->isSuperAdmin());

        // Key is used up and the installer is closed.
        $this->assertFileDoesNotExist(storage_path('app/install.key'));
        $this->postJson('/api/install', $this->payload())->assertStatus(409);
    }
}

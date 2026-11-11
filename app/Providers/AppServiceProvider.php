<?php

namespace App\Providers;

use App\Tenancy\TenantManager;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Http\Resources\Json\JsonResource;
use Illuminate\Support\Facades\URL;
use Illuminate\Support\ServiceProvider;

class AppServiceProvider extends ServiceProvider
{
    public function register(): void
    {
        $this->app->singleton(TenantManager::class);
    }

    public function boot(): void
    {
        // Catch N+1 queries and silently dropped attributes while developing.
        Model::preventLazyLoading(! $this->app->isProduction());
        Model::preventSilentlyDiscardingAttributes(! $this->app->isProduction());

        JsonResource::withoutWrapping();

        if ($this->app->isProduction()) {
            URL::forceScheme('https');
        }
    }
}

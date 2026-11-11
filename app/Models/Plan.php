<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;

class Plan extends Model
{
    protected $fillable = ['name','slug','price_monthly','currency','max_students','max_courses','storage_mb','features','is_active'];

    protected function casts(): array
    {
        return ['price_monthly' => 'decimal:2', 'features' => 'array', 'is_active' => 'boolean'];
    }

    public function tenants(): HasMany
    {
        return $this->hasMany(Tenant::class);
    }
}

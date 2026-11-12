<?php

namespace App\Models;

use App\Models\Concerns\BelongsToTenant;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;

class SchoolClass extends Model
{
    use BelongsToTenant;

    protected $table = 'school_classes';

    // tenant_id is stamped by BelongsToTenant, never filled from input.
    protected $guarded = ['id', 'tenant_id'];

    public function sections(): HasMany
    {
        return $this->hasMany(ClassSection::class)->orderBy('name');
    }
}

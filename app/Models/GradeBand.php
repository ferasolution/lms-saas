<?php

namespace App\Models;

use App\Models\Concerns\BelongsToTenant;
use Illuminate\Database\Eloquent\Model;

class GradeBand extends Model
{
    use BelongsToTenant;

    protected $table = 'grade_bands';

    protected $guarded = ['id', 'tenant_id'];

    protected function casts(): array
    {
        return [
            'min_percent' => 'float',
            'points' => 'float',
        ];
    }
}

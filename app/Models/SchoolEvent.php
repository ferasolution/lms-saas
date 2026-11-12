<?php

namespace App\Models;

use App\Models\Concerns\BelongsToTenant;
use Illuminate\Database\Eloquent\Model;

class SchoolEvent extends Model
{
    use BelongsToTenant;

    protected $table = 'school_events';

    protected $guarded = ['id', 'tenant_id'];

    protected function casts(): array
    {
        return [
            'date' => 'date',
            'end_date' => 'date',
            'section_ids' => 'array',
            'needs_consent' => 'boolean',
            'fee' => 'float',
        ];
    }
}

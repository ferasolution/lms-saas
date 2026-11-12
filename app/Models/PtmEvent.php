<?php

namespace App\Models;

use App\Models\Concerns\BelongsToTenant;
use Illuminate\Database\Eloquent\Model;

class PtmEvent extends Model
{
    use BelongsToTenant;

    protected $table = 'ptm_events';

    protected $guarded = ['id', 'tenant_id'];

    protected function casts(): array
    {
        return [
            'date' => 'date',
            'teacher_ids' => 'array',
        ];
    }
}

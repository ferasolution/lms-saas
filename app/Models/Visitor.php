<?php

namespace App\Models;

use App\Models\Concerns\BelongsToTenant;
use Illuminate\Database\Eloquent\Model;

class Visitor extends Model
{
    use BelongsToTenant;

    protected $table = 'visitors';

    protected $guarded = ['id', 'tenant_id'];

    protected function casts(): array
    {
        return [
            'checked_in_at' => 'datetime',
            'checked_out_at' => 'datetime',
        ];
    }
}

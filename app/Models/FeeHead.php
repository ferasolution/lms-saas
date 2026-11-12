<?php

namespace App\Models;

use App\Models\Concerns\BelongsToTenant;
use Illuminate\Database\Eloquent\Model;

class FeeHead extends Model
{
    use BelongsToTenant;

    protected $table = 'fee_heads';

    protected $guarded = ['id', 'tenant_id'];

    protected function casts(): array
    {
        return [
            'is_active' => 'boolean',
        ];
    }
}

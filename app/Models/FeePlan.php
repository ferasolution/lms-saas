<?php

namespace App\Models;

use App\Models\Concerns\BelongsToTenant;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class FeePlan extends Model
{
    use BelongsToTenant;

    protected $table = 'fee_plans';

    protected $guarded = ['id', 'tenant_id'];

    protected function casts(): array
    {
        return [
            'amount' => 'float',
        ];
    }

    public function head(): BelongsTo
    {
        return $this->belongsTo(FeeHead::class, 'fee_head_id');
    }
}

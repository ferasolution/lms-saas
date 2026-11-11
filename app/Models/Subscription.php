<?php

namespace App\Models;

use App\Models\Concerns\BelongsToTenant;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class Subscription extends Model
{
    use BelongsToTenant;

    protected $fillable = ['tenant_id','plan_id','status','amount','currency','gateway','gateway_ref','starts_at','ends_at'];

    protected function casts(): array
    {
        return ['amount' => 'decimal:2', 'starts_at' => 'datetime', 'ends_at' => 'datetime'];
    }

    public function plan(): BelongsTo
    {
        return $this->belongsTo(Plan::class);
    }
}

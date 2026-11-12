<?php

namespace App\Models;

use App\Models\Concerns\BelongsToTenant;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class Subscription extends Model
{
    use BelongsToTenant;

    protected $fillable = ['plan_id','months','status','amount','currency','gateway','gateway_ref','payment_reference','note','starts_at','ends_at','reviewed_at'];

    protected function casts(): array
    {
        return ['amount' => 'decimal:2', 'months' => 'integer', 'starts_at' => 'datetime', 'ends_at' => 'datetime', 'reviewed_at' => 'datetime'];
    }

    public function requester(): BelongsTo
    {
        return $this->belongsTo(User::class, 'requested_by')->withoutGlobalScope('tenant');
    }

    public function reviewer(): BelongsTo
    {
        return $this->belongsTo(User::class, 'reviewed_by')->withoutGlobalScope('tenant');
    }

    public function plan(): BelongsTo
    {
        return $this->belongsTo(Plan::class);
    }
}

<?php

namespace App\Models;

use App\Models\Concerns\BelongsToTenant;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class Order extends Model
{
    use BelongsToTenant;

    protected $fillable = ['user_id','course_id','coupon_id','amount','discount','total','currency','gateway','gateway_ref','status','paid_at'];

    protected function casts(): array
    {
        return ['amount' => 'decimal:2', 'discount' => 'decimal:2', 'total' => 'decimal:2', 'paid_at' => 'datetime'];
    }

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }

    public function course(): BelongsTo
    {
        return $this->belongsTo(Course::class);
    }

    public function coupon(): BelongsTo
    {
        return $this->belongsTo(Coupon::class);
    }
}

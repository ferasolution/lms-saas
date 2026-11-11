<?php

namespace App\Models;

use App\Models\Concerns\BelongsToTenant;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class Coupon extends Model
{
    use BelongsToTenant;

    protected $fillable = ['course_id','code','type','value','max_uses','used_count','expires_at','is_active'];

    protected function casts(): array
    {
        return ['value' => 'decimal:2', 'expires_at' => 'datetime', 'is_active' => 'boolean'];
    }

    public function course(): BelongsTo
    {
        return $this->belongsTo(Course::class);
    }
}

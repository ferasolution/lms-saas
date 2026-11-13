<?php

namespace App\Models;

use App\Models\Concerns\BelongsToTenant;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class LiveSessionAttendance extends Model
{
    use BelongsToTenant;

    protected $table = 'live_session_attendance';

    protected $guarded = ['id', 'tenant_id'];

    protected function casts(): array
    {
        return ['first_joined_at' => 'datetime', 'last_joined_at' => 'datetime'];
    }

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }
}

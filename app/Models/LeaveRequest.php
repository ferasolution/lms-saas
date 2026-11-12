<?php

namespace App\Models;

use App\Models\Concerns\BelongsToTenant;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class LeaveRequest extends Model
{
    use BelongsToTenant;

    protected $table = 'leave_requests';

    // tenant_id is stamped by BelongsToTenant, never filled from input.
    protected $guarded = ['id', 'tenant_id'];

    protected function casts(): array
    {
        return [
            'from_date' => 'date',
            'to_date' => 'date',
            'reviewed_at' => 'datetime',
        ];
    }

    public function student(): BelongsTo
    {
        return $this->belongsTo(User::class, 'student_id');
    }

    public function requester(): BelongsTo
    {
        return $this->belongsTo(User::class, 'requested_by');
    }
}

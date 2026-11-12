<?php

namespace App\Models;

use App\Models\Concerns\BelongsToTenant;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class PtmBooking extends Model
{
    use BelongsToTenant;

    protected $table = 'ptm_bookings';

    protected $guarded = ['id', 'tenant_id'];

    public function event(): BelongsTo
    {
        return $this->belongsTo(PtmEvent::class, 'ptm_event_id');
    }

    public function teacher(): BelongsTo
    {
        return $this->belongsTo(User::class, 'teacher_id');
    }

    public function parent(): BelongsTo
    {
        return $this->belongsTo(User::class, 'parent_id');
    }

    public function student(): BelongsTo
    {
        return $this->belongsTo(User::class, 'student_id');
    }
}

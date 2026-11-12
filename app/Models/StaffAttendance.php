<?php

namespace App\Models;

use App\Models\Concerns\BelongsToTenant;
use Illuminate\Database\Eloquent\Model;

class StaffAttendance extends Model
{
    use BelongsToTenant;

    protected $table = 'staff_attendance';

    protected $guarded = ['id', 'tenant_id'];

    protected function casts(): array
    {
        return [
            'date' => 'date',
        ];
    }
}

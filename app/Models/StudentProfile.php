<?php

namespace App\Models;

use App\Models\Concerns\BelongsToTenant;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class StudentProfile extends Model
{
    use BelongsToTenant;

    protected $table = 'student_profiles';

    // tenant_id is stamped by BelongsToTenant, never filled from input.
    protected $guarded = ['id', 'tenant_id'];

    protected function casts(): array
    {
        return [
            'date_of_birth' => 'date',
            'admitted_on' => 'date',
        ];
    }

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }

    public function section(): BelongsTo
    {
        return $this->belongsTo(ClassSection::class, 'class_section_id');
    }
}

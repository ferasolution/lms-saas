<?php

namespace App\Models;

use App\Models\Concerns\BelongsToTenant;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class ClassSection extends Model
{
    use BelongsToTenant;

    protected $table = 'class_sections';

    // tenant_id is stamped by BelongsToTenant, never filled from input.
    protected $guarded = ['id', 'tenant_id'];

    public function schoolClass(): BelongsTo
    {
        return $this->belongsTo(SchoolClass::class);
    }

    public function classTeacher(): BelongsTo
    {
        return $this->belongsTo(User::class, 'class_teacher_id');
    }

    public function subjects(): HasMany
    {
        return $this->hasMany(SectionSubject::class);
    }

    public function students(): HasMany
    {
        return $this->hasMany(StudentProfile::class)->where('status', 'active');
    }

    /** "Grade 5 – A" */
    public function label(): string
    {
        return trim(($this->schoolClass?->name ?? '').' – '.$this->name, ' –');
    }
}

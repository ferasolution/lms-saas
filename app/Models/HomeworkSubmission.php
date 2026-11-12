<?php

namespace App\Models;

use App\Models\Concerns\BelongsToTenant;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class HomeworkSubmission extends Model
{
    use BelongsToTenant;

    protected $table = 'homework_submissions';

    // tenant_id is stamped by BelongsToTenant, never filled from input.
    protected $guarded = ['id', 'tenant_id'];

    protected function casts(): array
    {
        return [
            'submitted_at' => 'datetime',
            'checked_at' => 'datetime',
            'marks' => 'float',
        ];
    }

    public function entry(): BelongsTo
    {
        return $this->belongsTo(DiaryEntry::class, 'diary_entry_id');
    }

    public function student(): BelongsTo
    {
        return $this->belongsTo(User::class, 'student_id');
    }
}

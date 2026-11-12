<?php

namespace App\Models;

use App\Models\Concerns\BelongsToTenant;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class AssignmentSubmission extends Model
{
    use BelongsToTenant;

    protected $fillable = ['lesson_id', 'user_id', 'body', 'file_path', 'status', 'grade', 'feedback', 'submitted_at', 'graded_at'];

    protected function casts(): array
    {
        return ['submitted_at' => 'datetime', 'graded_at' => 'datetime', 'grade' => 'integer'];
    }

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }

    public function lesson(): BelongsTo
    {
        return $this->belongsTo(Lesson::class);
    }

    public function grader(): BelongsTo
    {
        return $this->belongsTo(User::class, 'graded_by');
    }
}

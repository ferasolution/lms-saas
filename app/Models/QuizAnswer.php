<?php

namespace App\Models;

use App\Models\Concerns\BelongsToTenant;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class QuizAnswer extends Model
{
    use BelongsToTenant;

    protected $fillable = ['attempt_id','question_id','option_ids','text_answer','is_correct','points_awarded'];

    protected function casts(): array
    {
        return ['option_ids' => 'array', 'is_correct' => 'boolean'];
    }

    public function attempt(): BelongsTo
    {
        return $this->belongsTo(QuizAttempt::class, 'attempt_id');
    }

    public function question(): BelongsTo
    {
        return $this->belongsTo(QuizQuestion::class, 'question_id');
    }
}

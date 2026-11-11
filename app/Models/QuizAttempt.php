<?php

namespace App\Models;

use App\Models\Concerns\BelongsToTenant;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class QuizAttempt extends Model
{
    use BelongsToTenant;

    protected $fillable = ['quiz_id','user_id','started_at','submitted_at','score','max_score','percentage','passed'];

    protected function casts(): array
    {
        return ['started_at' => 'datetime', 'submitted_at' => 'datetime', 'percentage' => 'decimal:2', 'passed' => 'boolean'];
    }

    public function quiz(): BelongsTo
    {
        return $this->belongsTo(Quiz::class);
    }

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }

    public function answers(): HasMany
    {
        return $this->hasMany(QuizAnswer::class, 'attempt_id');
    }
}

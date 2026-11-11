<?php

namespace App\Models;

use App\Models\Concerns\BelongsToTenant;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class QuizQuestion extends Model
{
    use BelongsToTenant;

    protected $fillable = ['quiz_id','type','question','explanation','points','position'];

    protected function casts(): array
    {
        return ['points' => 'integer', 'position' => 'integer'];
    }

    public function quiz(): BelongsTo
    {
        return $this->belongsTo(Quiz::class);
    }

    public function options(): HasMany
    {
        return $this->hasMany(QuizOption::class, 'question_id')->orderBy('position');
    }
}

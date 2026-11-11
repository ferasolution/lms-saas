<?php

namespace App\Models;

use App\Models\Concerns\BelongsToTenant;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class QuizOption extends Model
{
    use BelongsToTenant;

    protected $fillable = ['question_id','text','is_correct','position'];

    protected $hidden = ['is_correct'];

    protected function casts(): array
    {
        return ['is_correct' => 'boolean'];
    }

    public function question(): BelongsTo
    {
        return $this->belongsTo(QuizQuestion::class, 'question_id');
    }
}

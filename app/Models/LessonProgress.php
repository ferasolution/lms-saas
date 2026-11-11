<?php

namespace App\Models;

use App\Models\Concerns\BelongsToTenant;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class LessonProgress extends Model
{
    use BelongsToTenant;

    protected $table = 'lesson_progress';

    protected $fillable = ['user_id','lesson_id','last_position_seconds','completed_at'];

    protected function casts(): array
    {
        return ['completed_at' => 'datetime', 'last_position_seconds' => 'integer'];
    }

    public function lesson(): BelongsTo
    {
        return $this->belongsTo(Lesson::class);
    }
}

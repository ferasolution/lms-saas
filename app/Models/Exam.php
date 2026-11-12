<?php

namespace App\Models;

use App\Models\Concerns\BelongsToTenant;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;

class Exam extends Model
{
    use BelongsToTenant;

    protected $table = 'exams';

    protected $guarded = ['id', 'tenant_id'];

    protected function casts(): array
    {
        return [
            'starts_on' => 'date',
            'ends_on' => 'date',
            'published_at' => 'datetime',
            'show_rank' => 'boolean',
        ];
    }

    public function papers(): HasMany
    {
        return $this->hasMany(ExamPaper::class);
    }
}

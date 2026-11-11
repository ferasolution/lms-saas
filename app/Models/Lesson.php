<?php

namespace App\Models;

use App\Models\Concerns\BelongsToTenant;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class Lesson extends Model
{
    use BelongsToTenant;

    protected $fillable = ['course_id','section_id','title','type','content','video_provider','video_url','file_path','live_url','live_starts_at','duration_seconds','is_preview','drip_days','position'];

    protected function casts(): array
    {
        return ['live_starts_at' => 'datetime', 'is_preview' => 'boolean', 'duration_seconds' => 'integer', 'drip_days' => 'integer', 'position' => 'integer'];
    }

    public function course(): BelongsTo
    {
        return $this->belongsTo(Course::class);
    }

    public function section(): BelongsTo
    {
        return $this->belongsTo(CourseSection::class, 'section_id');
    }
}

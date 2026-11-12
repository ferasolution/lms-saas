<?php

namespace App\Models;

use App\Models\Concerns\BelongsToTenant;
use Illuminate\Database\Eloquent\Model;

class ExamMark extends Model
{
    use BelongsToTenant;

    protected $table = 'exam_marks';

    protected $guarded = ['id', 'tenant_id'];

    protected function casts(): array
    {
        return [
            'marks' => 'float',
            'is_absent' => 'boolean',
        ];
    }
}

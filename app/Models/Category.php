<?php

namespace App\Models;

use App\Models\Concerns\BelongsToTenant;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;

class Category extends Model
{
    use BelongsToTenant;

    protected $fillable = ['name','slug'];

    public function courses(): HasMany
    {
        return $this->hasMany(Course::class);
    }
}

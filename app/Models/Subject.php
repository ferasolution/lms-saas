<?php

namespace App\Models;

use App\Models\Concerns\BelongsToTenant;
use Illuminate\Database\Eloquent\Model;

class Subject extends Model
{
    use BelongsToTenant;

    protected $table = 'subjects';

    // tenant_id is stamped by BelongsToTenant, never filled from input.
    protected $guarded = ['id', 'tenant_id'];
}

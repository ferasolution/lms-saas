<?php

namespace App\Models;

use App\Models\Concerns\BelongsToTenant;
use Illuminate\Database\Eloquent\Model;

class LibraryBook extends Model
{
    use BelongsToTenant;

    protected $table = 'library_books';

    protected $guarded = ['id', 'tenant_id'];
}

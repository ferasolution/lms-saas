<?php

namespace App\Models;

use App\Models\Concerns\BelongsToTenant;
use Illuminate\Database\Eloquent\Model;

class TransportRoute extends Model
{
    use BelongsToTenant;

    protected $table = 'transport_routes';

    protected $guarded = ['id', 'tenant_id'];

    protected function casts(): array
    {
        return [
            'stops' => 'array',
            'monthly_fee' => 'float',
        ];
    }
}

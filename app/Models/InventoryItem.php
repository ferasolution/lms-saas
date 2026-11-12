<?php

namespace App\Models;

use App\Models\Concerns\BelongsToTenant;
use Illuminate\Database\Eloquent\Model;

class InventoryItem extends Model
{
    use BelongsToTenant;

    protected $table = 'inventory_items';

    protected $guarded = ['id', 'tenant_id'];

    protected function casts(): array
    {
        return [
            'unit_cost' => 'float',
        ];
    }
}

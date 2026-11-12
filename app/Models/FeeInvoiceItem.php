<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class FeeInvoiceItem extends Model
{

    protected $table = 'fee_invoice_items';

    protected $guarded = ['id'];

    public $timestamps = false;

    protected function casts(): array
    {
        return [
            'amount' => 'float',
            'discount' => 'float',
        ];
    }
}

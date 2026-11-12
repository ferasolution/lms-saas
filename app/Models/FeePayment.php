<?php

namespace App\Models;

use App\Models\Concerns\BelongsToTenant;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class FeePayment extends Model
{
    use BelongsToTenant;

    protected $table = 'fee_payments';

    protected $guarded = ['id', 'tenant_id'];

    protected function casts(): array
    {
        return [
            'amount' => 'float',
            'paid_on' => 'date',
        ];
    }

    public function invoice(): BelongsTo
    {
        return $this->belongsTo(FeeInvoice::class, 'fee_invoice_id');
    }

    public function student(): BelongsTo
    {
        return $this->belongsTo(User::class, 'student_id');
    }

    public function receiver(): BelongsTo
    {
        return $this->belongsTo(User::class, 'received_by');
    }

    public function submitter(): BelongsTo
    {
        return $this->belongsTo(User::class, 'submitted_by');
    }
}

<?php

namespace App\Models;

use App\Models\Concerns\BelongsToTenant;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class FeeInvoice extends Model
{
    use BelongsToTenant;

    protected $table = 'fee_invoices';

    protected $guarded = ['id', 'tenant_id'];

    protected function casts(): array
    {
        return [
            'issued_on' => 'date',
            'due_on' => 'date',
            'subtotal' => 'float',
            'discount' => 'float',
            'late_fee' => 'float',
            'total' => 'float',
            'paid' => 'float',
            'reminded_at' => 'datetime',
        ];
    }

    public function items(): HasMany
    {
        return $this->hasMany(FeeInvoiceItem::class);
    }

    public function payments(): HasMany
    {
        return $this->hasMany(FeePayment::class);
    }

    public function student(): BelongsTo
    {
        return $this->belongsTo(User::class, 'student_id');
    }

    public function section(): BelongsTo
    {
        return $this->belongsTo(ClassSection::class, 'class_section_id');
    }

    public function balance(): float
    {
        return round(max(0, $this->total - $this->paid), 2);
    }

    public function isOverdue(): bool
    {
        return in_array($this->status, ['unpaid', 'partial'], true) && $this->due_on->lt(now()->startOfDay());
    }
}

<?php

namespace App\Models;

use App\Models\Concerns\BelongsToTenant;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;

class PayrollRun extends Model
{
    use BelongsToTenant;

    protected $table = 'payroll_runs';

    protected $guarded = ['id', 'tenant_id'];

    protected function casts(): array
    {
        return [
            'gross' => 'float',
            'deductions' => 'float',
            'net' => 'float',
            'paid_on' => 'date',
        ];
    }

    public function payslips(): HasMany
    {
        return $this->hasMany(Payslip::class);
    }
}

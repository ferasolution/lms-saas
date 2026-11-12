<?php

namespace App\Models;

use App\Models\Concerns\BelongsToTenant;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class Payslip extends Model
{
    use BelongsToTenant;

    protected $table = 'payslips';

    protected $guarded = ['id', 'tenant_id'];

    protected function casts(): array
    {
        return [
            'basic' => 'float',
            'allowances' => 'array',
            'deductions' => 'array',
            'unpaid_days' => 'float',
            'unpaid_deduction' => 'float',
            'bonus' => 'float',
            'gross' => 'float',
            'total_deductions' => 'float',
            'net' => 'float',
        ];
    }

    public function employee(): BelongsTo
    {
        return $this->belongsTo(Employee::class);
    }

    public function run(): BelongsTo
    {
        return $this->belongsTo(PayrollRun::class, 'payroll_run_id');
    }
}

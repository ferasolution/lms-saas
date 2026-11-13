<?php

namespace App\Models;

use App\Models\Concerns\BelongsToTenant;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class LiveSession extends Model
{
    use BelongsToTenant;

    protected $guarded = ['id', 'tenant_id'];

    protected function casts(): array
    {
        return [
            'starts_at' => 'datetime',
            'section_ids' => 'array',
            'is_public' => 'boolean',
            'duration_minutes' => 'integer',
            'capacity' => 'integer',
        ];
    }

    public function host(): BelongsTo
    {
        return $this->belongsTo(User::class, 'host_id');
    }

    public function registrations(): HasMany
    {
        return $this->hasMany(LiveSessionRegistration::class);
    }

    public function attendance(): HasMany
    {
        return $this->hasMany(LiveSessionAttendance::class);
    }

    public function endsAt(): \Carbon\CarbonInterface
    {
        return $this->starts_at->copy()->addMinutes($this->duration_minutes);
    }

    /** Join opens 15 minutes before the start and closes 30 minutes after the end. */
    public function joinOpen(): bool
    {
        return $this->status === 'scheduled'
            && now()->greaterThanOrEqualTo($this->starts_at->copy()->subMinutes(15))
            && now()->lessThanOrEqualTo($this->endsAt()->addMinutes(30));
    }

    public function state(): string
    {
        if ($this->status === 'cancelled') {
            return 'cancelled';
        }
        if (now()->lt($this->starts_at)) {
            return 'upcoming';
        }

        return now()->lte($this->endsAt()) ? 'live' : 'ended';
    }

    public function provider(): string
    {
        $host = strtolower((string) parse_url($this->meeting_url, PHP_URL_HOST));

        return match (true) {
            str_contains($host, 'zoom.') => 'Zoom',
            str_contains($host, 'meet.google.') => 'Google Meet',
            str_contains($host, 'teams.') => 'Microsoft Teams',
            str_contains($host, 'webex.') => 'Webex',
            str_contains($host, 'jit.si') => 'Jitsi',
            default => 'Online meeting',
        };
    }
}

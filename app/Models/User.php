<?php

namespace App\Models;

use App\Models\Concerns\BelongsToTenant;
use Database\Factories\UserFactory;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Foundation\Auth\User as Authenticatable;
use Illuminate\Notifications\Notifiable;
use Laravel\Sanctum\HasApiTokens;

class User extends Authenticatable
{
    /** @use HasFactory<UserFactory> */
    use BelongsToTenant, HasApiTokens, HasFactory, Notifiable;

    public const ROLE_SUPER_ADMIN = 'super_admin';
    public const ROLE_ADMIN = 'admin';
    public const ROLE_INSTRUCTOR = 'instructor';
    public const ROLE_STUDENT = 'student';
    public const ROLE_PARENT = 'parent';
    public const ROLE_MANAGER = 'manager';

    /** Roles a tenant admin is allowed to assign. */
    public const TENANT_ROLES = [
        self::ROLE_ADMIN, self::ROLE_INSTRUCTOR, self::ROLE_STUDENT, self::ROLE_PARENT, self::ROLE_MANAGER,
    ];

    // tenant_id and role are set explicitly in code, never mass-assigned from requests.
    protected $fillable = ['name', 'email', 'password', 'phone', 'avatar'];

    protected $hidden = ['password', 'remember_token'];

    protected $attributes = [
        'role' => self::ROLE_STUDENT,
        'is_active' => true,
    ];

    protected function casts(): array
    {
        return [
            'email_verified_at' => 'datetime',
            'password' => 'hashed',
            'is_active' => 'boolean',
        ];
    }

    public function isSuperAdmin(): bool
    {
        return $this->role === self::ROLE_SUPER_ADMIN && is_null($this->tenant_id);
    }

    public function hasRole(string ...$roles): bool
    {
        return in_array($this->role, $roles, true);
    }

    public function taughtCourses(): HasMany
    {
        return $this->hasMany(Course::class, 'instructor_id');
    }

    public function enrollments(): HasMany
    {
        return $this->hasMany(Enrollment::class);
    }
}

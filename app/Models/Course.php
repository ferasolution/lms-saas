<?php

namespace App\Models;

use App\Models\Concerns\BelongsToTenant;
use App\Tenancy\TenantManager;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\SoftDeletes;
use Illuminate\Support\Str;

class Course extends Model
{
    use BelongsToTenant, HasFactory, SoftDeletes;

    public const STATUS_DRAFT = 'draft';
    public const STATUS_PUBLISHED = 'published';
    public const STATUS_ARCHIVED = 'archived';

    protected $fillable = [
        'instructor_id', 'category_id', 'title', 'slug', 'short_description', 'description', 'what_you_learn', 'certificate_enabled',
        'thumbnail', 'level', 'language', 'is_free', 'price', 'sale_price', 'currency',
        'status', 'published_at',
    ];

    // Mirror the column defaults so a freshly created model has them too.
    protected $attributes = [
        'status' => self::STATUS_DRAFT,
        'level' => 'beginner',
        'language' => 'en',
        'is_free' => false,
        'price' => 0,
        'currency' => 'PKR',
        'certificate_enabled' => true,
    ];

    protected function casts(): array
    {
        return [
            'is_free' => 'boolean',
            'certificate_enabled' => 'boolean',
            'price' => 'decimal:2',
            'sale_price' => 'decimal:2',
            'published_at' => 'datetime',
        ];
    }

    protected static function booted(): void
    {
        static::saving(function (Course $course) {
            if (empty($course->slug)) {
                // 'saving' runs before the tenant trait's 'creating' hook, so fall back to the current tenant.
                $course->slug = static::uniqueSlug($course->title, $course->tenant_id ?? app(TenantManager::class)->id());
            }

            if ($course->status === self::STATUS_PUBLISHED && ! $course->published_at) {
                $course->published_at = now();
            }
        });
    }

    /** Slug unique within the tenant, including soft-deleted courses. */
    public static function uniqueSlug(string $title, ?int $tenantId): string
    {
        $base = Str::slug($title) ?: 'course';
        $slug = $base;
        $i = 2;

        while (static::withTrashed()->withoutGlobalScope('tenant')
            ->where('tenant_id', $tenantId)->where('slug', $slug)->exists()) {
            $slug = $base.'-'.$i++;
        }

        return $slug;
    }

    public function scopePublished(Builder $query): Builder
    {
        return $query->where('status', self::STATUS_PUBLISHED);
    }

    public function instructor(): BelongsTo
    {
        return $this->belongsTo(User::class, 'instructor_id');
    }

    public function category(): BelongsTo
    {
        return $this->belongsTo(Category::class);
    }

    public function sections(): HasMany
    {
        return $this->hasMany(CourseSection::class)->orderBy('position');
    }

    public function lessons(): HasMany
    {
        return $this->hasMany(Lesson::class)->orderBy('position');
    }

    public function enrollments(): HasMany
    {
        return $this->hasMany(Enrollment::class);
    }

    public function orders(): HasMany
    {
        return $this->hasMany(Order::class);
    }

    public function certificates(): HasMany
    {
        return $this->hasMany(Certificate::class);
    }

    /** Price a student pays right now. */
    public function effectivePrice(): float
    {
        if ($this->is_free) {
            return 0.0;
        }

        return (float) ($this->sale_price ?? $this->price);
    }

    public function isPaid(): bool
    {
        return $this->effectivePrice() > 0;
    }

    public function quizzes(): HasMany
    {
        return $this->hasMany(Quiz::class);
    }
}

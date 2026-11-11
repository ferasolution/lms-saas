<?php

namespace Database\Factories;

use App\Models\Course;
use Illuminate\Database\Eloquent\Factories\Factory;

/**
 * @extends Factory<Course>
 */
class CourseFactory extends Factory
{
    protected $model = Course::class;

    public function definition(): array
    {
        return [
            'title' => fake()->unique()->sentence(3),
            'short_description' => fake()->sentence(),
            'price' => 0,
            'is_free' => true,
            'status' => Course::STATUS_DRAFT,
        ];
    }

    public function published(): static
    {
        return $this->state(fn () => ['status' => Course::STATUS_PUBLISHED]);
    }
}

<?php

namespace App\Http\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

class CourseResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id,
            'title' => $this->title,
            'slug' => $this->slug,
            'short_description' => $this->short_description,
            'description' => $this->description,
            'thumbnail' => $this->thumbnail,
            'level' => $this->level,
            'language' => $this->language,
            'is_free' => (bool) $this->is_free,
            'price' => $this->price,
            'sale_price' => $this->sale_price,
            'currency' => $this->currency,
            'status' => $this->status,
            'published_at' => $this->published_at,
            'instructor' => $this->whenLoaded('instructor', fn () => $this->instructor?->only('id', 'name')),
            'category' => $this->whenLoaded('category', fn () => $this->category?->only('id', 'name', 'slug')),
            'enrollments_count' => $this->whenCounted('enrollments'),
            'created_at' => $this->created_at,
            'updated_at' => $this->updated_at,
        ];
    }
}

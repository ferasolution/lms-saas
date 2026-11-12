<?php

namespace App\Http\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

class TenantResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id,
            'name' => $this->name,
            'slug' => $this->slug,
            'type' => $this->type,
            'status' => $this->status,
            'trial_ends_at' => $this->trial_ends_at,
            'plan_ends_at' => $this->plan_ends_at,
            'plan' => $this->whenLoaded('plan', fn () => $this->plan?->only('id', 'name', 'slug')),
            'settings' => $this->settings ?? (object) [],
            'users_count' => $this->whenCounted('users'),
            'courses_count' => $this->whenCounted('courses'),
            'created_at' => $this->created_at,
        ];
    }
}

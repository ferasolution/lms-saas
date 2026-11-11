<?php

namespace Tests\Feature;

use Tests\TestCase;

class DeployHookTest extends TestCase
{
    public function test_hook_does_not_exist_without_a_configured_token(): void
    {
        config(['app.deploy_token' => null]);

        $this->postJson('/api/deploy-hook', [], ['X-Deploy-Token' => 'anything'])->assertNotFound();
    }

    public function test_hook_rejects_a_wrong_token(): void
    {
        config(['app.deploy_token' => str_repeat('a', 40)]);

        $this->postJson('/api/deploy-hook', [], ['X-Deploy-Token' => str_repeat('b', 40)])->assertForbidden();
        $this->postJson('/api/deploy-hook')->assertForbidden();
    }
}

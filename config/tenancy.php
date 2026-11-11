<?php

return [

    /*
    | The platform's own domain, e.g. lms.ferasolution.com. Tenants are served
    | from {slug}.<central_domain> once wildcard DNS is set up. Until then the
    | SPA sends the tenant slug in the X-Tenant header.
    */
    'central_domain' => env('TENANCY_CENTRAL_DOMAIN', 'localhost'),

    'header' => 'X-Tenant',

    'trial_days' => (int) env('TENANCY_TRIAL_DAYS', 14),

    'types' => ['school', 'academy', 'corporate'],

    // Slugs that can never be taken by a tenant.
    'reserved_slugs' => [
        'www', 'api', 'app', 'admin', 'central', 'mail', 'smtp', 'ftp', 'cpanel',
        'webmail', 'lms', 'dashboard', 'login', 'register', 'support', 'help',
        'status', 'static', 'assets', 'cdn', 'billing', 'docs', 'blog', 'platform', 'build', 'storage', 'install', 'pricing', 'features', 'about', 'terms', 'privacy',
    ],

];

<?php

namespace App\Support;

/**
 * Manual payment methods. The payer sends money directly and enters a
 * reference; the receiver confirms it. Works in any country.
 */
class Payments
{
    public const METHODS = [
        'bank' => 'Bank transfer',
        'paypal' => 'PayPal',
        'wise' => 'Wise',
        'card' => 'Card',
        'other' => 'Other',
    ];

    /** Currencies an institute can price courses in. */
    public const CURRENCIES = ['USD', 'EUR', 'GBP', 'CAD', 'AUD', 'NZD', 'AED', 'SAR', 'INR', 'PKR', 'SGD', 'ZAR', 'NGN', 'KES'];

    public static function label(?string $method): string
    {
        return self::METHODS[$method] ?? ($method ? ucfirst($method) : 'Unknown');
    }
}

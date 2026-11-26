<?php
declare(strict_types=1);

require_once __DIR__ . '/environment.php';

return [
    'app_name' => 'Premium Telegram Music Bot',
    'app_url' => envValue('APP_URL', ''),
    'bot_token' => envValue('TELEGRAM_BOT_TOKEN', ''),
    'webhook_secret' => envValue('TELEGRAM_WEBHOOK_SECRET', ''),
    'owner_telegram_id' => (int) envValue('TELEGRAM_OWNER_ID', '0'),
    'backend_url' => rtrim(envValue('AUDIO_BACKEND_URL', 'http://127.0.0.1:8080'), '/'),
    'backend_secret' => envValue('AUDIO_BACKEND_API_SECRET', ''),
    'encryption_key' => envValue('TELEGRAM_SESSION_ENCRYPTION_KEY', ''),
    'db' => [
        'host' => envValue('DB_HOST', 'localhost'),
        'port' => (int) envValue('DB_PORT', '3306'),
        'name' => envValue('DB_NAME', 'premium_music_bot'),
        'user' => envValue('DB_USER', ''),
        'pass' => envValue('DB_PASS', ''),
    ],
    'paths' => [
        'logs' => dirname(__DIR__) . '/storage/logs',
        'cache' => dirname(__DIR__) . '/storage/cache',
        'music' => dirname(__DIR__) . '/storage/music',
    ],
    'rate_limit_per_min' => 45,
];

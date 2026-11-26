<?php
declare(strict_types=1);

/**
 * One-time webhook registration & MySQL schema verifier.
 * Run from CLI (`php setup.php`) or secure admin session, then restrict access.
 */
$config = require __DIR__ . '/config/config.php';
require_once __DIR__ . '/config/database.php';

echo "=== Premium Music Bot Setup ===\n";

try {
    $pdo = getDatabaseConnection($config);
    echo "[OK] MySQL PDO connection verified.\n";
    if (!empty($config['owner_telegram_id'])) {
        $stmt = $pdo->prepare(
            'INSERT INTO owner_settings (owner_telegram_id, maintenance_mode) VALUES (:oid, 0)
             ON DUPLICATE KEY UPDATE owner_telegram_id = VALUES(owner_telegram_id)'
        );
        $stmt->execute([':oid' => $config['owner_telegram_id']]);
        echo "[OK] Owner Telegram ID registered.\n";
    }
} catch (Throwable $e) {
    echo "[ERR] Database check failed: " . $e->getMessage() . "\n";
}

if (!empty($config['bot_token']) && !empty($config['app_url'])) {
    $webhookUrl = rtrim($config['app_url'], '/') . '/webhook.php';
    $payload = json_encode([
        'url' => $webhookUrl,
        'secret_token' => $config['webhook_secret'],
        'allowed_updates' => ['message', 'callback_query'],
    ]);
    $ch = curl_init("https://api.telegram.org/bot{$config['bot_token']}/setWebhook");
    curl_setopt_array($ch, [
        CURLOPT_POST => true,
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_HTTPHEADER => ['Content-Type: application/json'],
        CURLOPT_POSTFIELDS => $payload,
    ]);
    $res = curl_exec($ch);
    curl_close($ch);
    echo "[WEBHOOK] {$res}\n";
} else {
    echo "[SKIP] Set TELEGRAM_BOT_TOKEN and APP_URL in .env to auto-register webhook.\n";
}

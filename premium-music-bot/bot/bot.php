<?php
declare(strict_types=1);

/**
 * Direct /bot/bot.php entrypoint for cPanel / shared PHP hosting & 1-minute cron keep-alive.
 * Supports:
 *   GET https://yourdomain.site/bot/bot.php?setup=1  -> verifies/registers webhook & wakes audio worker
 *   GET https://yourdomain.site/bot/bot.php?ping=1   -> wakes bot & audio worker every 1 min
 *   POST https://yourdomain.site/bot/bot.php         -> processes Telegram webhook updates
 */
if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    require dirname(__DIR__) . '/public/webhook.php';
    exit;
}

$config = require dirname(__DIR__) . '/config/config.php';
require_once dirname(__DIR__) . '/includes/functions.php';

header('Content-Type: application/json; charset=utf-8');

$token = (string) ($config['bot_token'] ?? '');
$isSetup = ($_GET['setup'] ?? '') === '1';
$isPing = $isSetup || ($_GET['ping'] ?? '') === '1';

$host = $_SERVER['HTTP_HOST'] ?? '';
$scriptName = $_SERVER['SCRIPT_NAME'] ?? '/bot/bot.php';
$selfUrl = $host !== '' ? 'https://' . $host . $scriptName : '';

$webhookUrl = '';
$webhookUpdated = false;
$audioWorkerOnline = null;

if ($isPing && $token !== '') {
    $ch = curl_init("https://api.telegram.org/bot{$token}/getWebhookInfo");
    curl_setopt_array($ch, [
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_TIMEOUT => 6,
    ]);
    $rawInfo = curl_exec($ch);
    curl_close($ch);
    $info = is_string($rawInfo) ? json_decode($rawInfo, true) : null;
    $webhookUrl = (string) ($info['result']['url'] ?? '');

    if ($isSetup && $selfUrl !== '' && $webhookUrl !== $selfUrl) {
        $payload = [
            'url' => $selfUrl,
            'allowed_updates' => ['message', 'callback_query'],
        ];
        if (!empty($config['webhook_secret'])) {
            $payload['secret_token'] = $config['webhook_secret'];
        }
        $chSet = curl_init("https://api.telegram.org/bot{$token}/setWebhook");
        curl_setopt_array($chSet, [
            CURLOPT_POST => true,
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_HTTPHEADER => ['Content-Type: application/json'],
            CURLOPT_POSTFIELDS => json_encode($payload),
            CURLOPT_TIMEOUT => 8,
        ]);
        $rawSet = curl_exec($chSet);
        curl_close($chSet);
        $setRes = is_string($rawSet) ? json_decode($rawSet, true) : null;
        if (!empty($setRes['ok'])) {
            $webhookUrl = $selfUrl;
            $webhookUpdated = true;
        }
    }
}

if ($isPing && !empty($config['backend_url']) && !empty($config['backend_secret'])) {
    $health = callAudioBackend($config, '/health', [], 'GET');
    $audioWorkerOnline = !empty($health['ok']);
}

echo json_encode([
    'ok' => true,
    'awake' => true,
    'service' => 'php-bot-entrypoint',
    'botConfigured' => $token !== '',
    'webhookUrl' => $webhookUrl !== '' ? $webhookUrl : $selfUrl,
    'webhookUpdated' => $webhookUpdated,
    'audioWorkerOnline' => $audioWorkerOnline,
]);

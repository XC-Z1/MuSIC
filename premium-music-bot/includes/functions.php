<?php
declare(strict_types=1);

function telegramApiCall(array $config, string $method, array $payload): array
{
    $token = $config['bot_token'] ?? '';
    if ($token === '') {
        return ['ok' => false, 'description' => 'Bot token missing'];
    }

    $ch = curl_init("https://api.telegram.org/bot{$token}/{$method}");
    curl_setopt_array($ch, [
        CURLOPT_POST => true,
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_HTTPHEADER => ['Content-Type: application/json'],
        CURLOPT_POSTFIELDS => json_encode($payload, JSON_UNESCAPED_UNICODE),
        CURLOPT_TIMEOUT => 8,
    ]);
    $raw = curl_exec($ch);
    $err = curl_error($ch);
    curl_close($ch);

    if ($raw === false) {
        return ['ok' => false, 'description' => $err];
    }
    $decoded = json_decode($raw, true);
    return is_array($decoded) ? $decoded : ['ok' => false, 'description' => 'Invalid JSON'];
}

function sendTelegramMessage(array $config, int|string $chatId, string $text, ?array $replyMarkup = null): array
{
    $payload = [
        'chat_id' => $chatId,
        'text' => $text,
        'disable_web_page_preview' => true,
    ];
    if ($replyMarkup !== null) {
        $payload['reply_markup'] = $replyMarkup;
    }
    return telegramApiCall($config, 'sendMessage', $payload);
}

function editTelegramMessage(array $config, int|string $chatId, int $messageId, string $text, ?array $replyMarkup = null): array
{
    $payload = [
        'chat_id' => $chatId,
        'message_id' => $messageId,
        'text' => $text,
        'disable_web_page_preview' => true,
    ];
    if ($replyMarkup !== null) {
        $payload['reply_markup'] = $replyMarkup;
    }
    return telegramApiCall($config, 'editMessageText', $payload);
}

function playAnimatedTelegramFrames(array $config, int|string $chatId, array $frames, ?array $finalMarkup = null, int $delayMicros = 550000): ?int
{
    if (empty($frames)) {
        return null;
    }
    $first = sendTelegramMessage($config, $chatId, (string) $frames[0]);
    $messageId = $first['result']['message_id'] ?? null;
    if (!is_int($messageId)) {
        return null;
    }
    $count = count($frames);
    for ($i = 1; $i < $count; $i++) {
        usleep($delayMicros);
        $markup = ($i === $count - 1) ? $finalMarkup : null;
        editTelegramMessage($config, $chatId, $messageId, (string) $frames[$i], $markup);
    }
    return $messageId;
}

function callPythonAudioBackend(array $config, string $endpoint, array $payload = [], string $method = 'POST'): array
{
    $baseUrl = $config['backend_url'] ?? '';
    $secret = $config['backend_secret'] ?? '';
    if ($baseUrl === '' || $secret === '') {
        return ['ok' => false, 'error' => 'Streaming Backend Offline'];
    }

    $timestamp = time();
    $body = ($method === 'GET') ? '' : json_encode($payload, JSON_UNESCAPED_UNICODE);
    $signature = hash_hmac('sha256', "{$timestamp}.{$body}", $secret);

    $ch = curl_init($baseUrl . $endpoint);
    $opts = [
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_TIMEOUT => 9,
        CURLOPT_HTTPHEADER => [
            'Content-Type: application/json',
            "X-API-Secret: {$secret}",
            "X-Timestamp: {$timestamp}",
            "X-Signature: {$signature}",
        ],
    ];
    if ($method === 'POST') {
        $opts[CURLOPT_POST] = true;
        $opts[CURLOPT_POSTFIELDS] = $body;
    }
    curl_setopt_array($ch, $opts);
    $raw = curl_exec($ch);
    $code = (int) curl_getinfo($ch, CURLINFO_HTTP_CODE);
    curl_close($ch);

    if ($raw === false) {
        return ['ok' => false, 'error' => 'Streaming Backend Offline'];
    }
    $decoded = json_decode($raw, true);
    if (!is_array($decoded)) {
        return ['ok' => false, 'error' => 'Invalid Backend Response'];
    }
    if ($code >= 400) {
        return ['ok' => false, 'error' => (string) ($decoded['detail'] ?? 'Backend Error')];
    }
    return ['ok' => true, 'data' => $decoded];
}

function upsertTelegramUser(PDO $pdo, array $from): int
{
    $stmt = $pdo->prepare(
        'INSERT INTO users (telegram_id, username, first_name, last_name, language_code)
         VALUES (:tid, :uname, :fname, :lname, :lang)
         ON DUPLICATE KEY UPDATE
           username = VALUES(username),
           first_name = VALUES(first_name),
           last_name = VALUES(last_name),
           last_active_at = CURRENT_TIMESTAMP'
    );
    $stmt->execute([
        ':tid' => (int) $from['id'],
        ':uname' => $from['username'] ?? null,
        ':fname' => $from['first_name'] ?? 'User',
        ':lname' => $from['last_name'] ?? null,
        ':lang' => $from['language_code'] ?? 'en',
    ]);
    $idStmt = $pdo->prepare('SELECT id FROM users WHERE telegram_id = :tid LIMIT 1');
    $idStmt->execute([':tid' => (int) $from['id']]);
    return (int) $idStmt->fetchColumn();
}

function upsertTelegramGroup(PDO $pdo, array $chat): int
{
    $stmt = $pdo->prepare(
        'INSERT INTO `groups` (chat_id, title, username)
         VALUES (:cid, :title, :uname)
         ON DUPLICATE KEY UPDATE
           title = VALUES(title),
           username = VALUES(username)'
    );
    $stmt->execute([
        ':cid' => (int) $chat['id'],
        ':title' => $chat['title'] ?? ($chat['first_name'] ?? 'Private Chat'),
        ':uname' => $chat['username'] ?? null,
    ]);
    $idStmt = $pdo->prepare('SELECT id FROM `groups` WHERE chat_id = :cid LIMIT 1');
    $idStmt->execute([':cid' => (int) $chat['id']]);
    return (int) $idStmt->fetchColumn();
}

function logSystemError(PDO $pdo, array $config, string $component, string $message, string $severity = 'error'): void
{
    $safe = redactSensitiveText($message);
    try {
        $stmt = $pdo->prepare('INSERT INTO error_logs (component, severity, message) VALUES (:c, :s, :m)');
        $stmt->execute([':c' => $component, ':s' => $severity, ':m' => $safe]);
    } catch (Throwable) {
        // Fallback to file log
    }
    $logDir = $config['paths']['logs'] ?? dirname(__DIR__) . '/storage/logs';
    if (!is_dir($logDir)) {
        @mkdir($logDir, 0750, true);
    }
    @file_put_contents(
        $logDir . '/bot.log',
        sprintf("[%s] [%s] [%s] %s\n", date('c'), $severity, $component, $safe),
        FILE_APPEND | LOCK_EX
    );
}

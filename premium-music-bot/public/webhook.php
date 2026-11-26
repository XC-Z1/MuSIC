<?php
declare(strict_types=1);

$config = require dirname(__DIR__) . '/config/config.php';
require_once dirname(__DIR__) . '/config/database.php';
require_once dirname(__DIR__) . '/includes/security.php';
require_once dirname(__DIR__) . '/includes/permissions.php';
require_once dirname(__DIR__) . '/includes/keyboards.php';
require_once dirname(__DIR__) . '/includes/messages.php';
require_once dirname(__DIR__) . '/includes/functions.php';
require_once dirname(__DIR__) . '/modules/start.php';
require_once dirname(__DIR__) . '/modules/music.php';
require_once dirname(__DIR__) . '/modules/player.php';
require_once dirname(__DIR__) . '/modules/volume.php';
require_once dirname(__DIR__) . '/modules/live.php';
require_once dirname(__DIR__) . '/modules/account.php';
require_once dirname(__DIR__) . '/modules/queue.php';
require_once dirname(__DIR__) . '/modules/statistics.php';
require_once dirname(__DIR__) . '/modules/admin.php';

header('Content-Type: application/json; charset=utf-8');

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    http_response_code(405);
    echo json_encode(['ok' => false, 'error' => 'Method Not Allowed']);
    exit;
}

if (!verifyTelegramWebhookSecret($config)) {
    http_response_code(401);
    echo json_encode(['ok' => false, 'error' => 'Unauthorized webhook secret']);
    exit;
}

$raw = file_get_contents('php://input');
$update = is_string($raw) ? json_decode($raw, true) : null;
if (!is_array($update)) {
    http_response_code(400);
    echo json_encode(['ok' => false, 'error' => 'Invalid JSON']);
    exit;
}

try {
    $pdo = getDatabaseConnection($config);

    if (isset($update['callback_query'])) {
        $cq = $update['callback_query'];
        $from = $cq['from'] ?? [];
        $fromId = (int) ($from['id'] ?? 0);
        $chat = $cq['message']['chat'] ?? [];
        $chatId = $chat['id'] ?? 0;
        $msgId = isset($cq['message']['message_id']) ? (int) $cq['message']['message_id'] : null;
        $data = (string) ($cq['data'] ?? '');

        telegramApiCall($config, 'answerCallbackQuery', ['callback_query_id' => $cq['id']]);
        if ($chatId === 0 || isUserBanned($pdo, $fromId)) {
            echo json_encode(['ok' => true]);
            exit;
        }

        $groupId = upsertTelegramGroup($pdo, $chat);

        if ($data === 'menu:start') {
            handleStartCommand($config, $chatId, $msgId);
        } elseif ($data === 'menu:help') {
            handleHelpCommand($config, $chatId, $msgId);
        } elseif ($data === 'menu:player' || $data === 'menu:nowplaying') {
            handlePlayerAction($config, $chatId, 'status', $msgId);
        } elseif ($data === 'menu:queue') {
            handleQueueCommand($pdo, $config, $chatId, $groupId, $msgId);
        } elseif ($data === 'menu:volume') {
            handleVolumeAction($pdo, $config, $chatId, $groupId, 'status', $msgId);
        } elseif (str_starts_with($data, 'vol:')) {
            handleVolumeAction($pdo, $config, $chatId, $groupId, substr($data, 4), $msgId);
        } elseif (str_starts_with($data, 'player:')) {
            handlePlayerAction($config, $chatId, substr($data, 7), $msgId);
        } elseif ($data === 'menu:live') {
            handleLiveStatusPanel($config, $chatId, $msgId);
        } elseif ($data === 'live:leave') {
            handleLeaveLiveCommand($pdo, $config, $chatId, $groupId);
        } elseif ($data === 'menu:account' || str_starts_with($data, 'account:')) {
            $op = $data === 'menu:account' ? 'status' : substr($data, 8);
            handleAccountCommand($pdo, $config, $chatId, $fromId, $op, $msgId);
        } elseif ($data === 'menu:owner') {
            handleAdminCommand($pdo, $config, $chatId, $fromId, '/owner', '', $msgId);
        }

        echo json_encode(['ok' => true]);
        exit;
    }

    if (isset($update['message'])) {
        $msg = $update['message'];
        $from = $msg['from'] ?? [];
        $fromId = (int) ($from['id'] ?? 0);
        $chat = $msg['chat'] ?? [];
        $chatId = $chat['id'] ?? 0;
        $text = sanitizeTextInput($msg['text'] ?? '');

        if (!checkRateLimit($config['paths']['cache'], (string) $fromId, (int) $config['rate_limit_per_min'])) {
            sendTelegramMessage($config, $chatId, '⏳ Rate limit exceeded. Please wait a few seconds.');
            echo json_encode(['ok' => true]);
            exit;
        }

        if (isUserBanned($pdo, $fromId)) {
            echo json_encode(['ok' => true]);
            exit;
        }

        $userId = upsertTelegramUser($pdo, $from);
        $groupId = upsertTelegramGroup($pdo, $chat);

        if (isMaintenanceEnabled($pdo) && !isBotOwner($fromId, $config)) {
            sendTelegramMessage($config, $chatId, '🛠️ Bot is under scheduled maintenance.');
            echo json_encode(['ok' => true]);
            exit;
        }

        $parts = preg_split('/\s+/', $text, 2);
        $rawCmd = strtolower($parts[0] ?? '');
        $cmd = explode('@', $rawCmd)[0];
        $arg = trim($parts[1] ?? '');

        match ($cmd) {
            '/start' => handleStartCommand($config, $chatId),
            '/help' => handleHelpCommand($config, $chatId),
            '/play' => handlePlayCommand($pdo, $config, $chatId, $groupId, $userId, $arg, (string) ($from['username'] ?? $from['first_name'] ?? 'User')),
            '/pause', '/resume', '/skip', '/stop', '/nowplaying' => handlePlayerAction($config, $chatId, ltrim($cmd, '/')),
            '/queue' => handleQueueCommand($pdo, $config, $chatId, $groupId),
            '/volume' => handleVolumeAction($pdo, $config, $chatId, $groupId, $arg !== '' ? $arg : 'status'),
            '/mute' => handleVolumeAction($pdo, $config, $chatId, $groupId, 'mute'),
            '/unmute' => handleVolumeAction($pdo, $config, $chatId, $groupId, 'unmute'),
            '/joinlive' => handleJoinLiveCommand($pdo, $config, $chatId, $groupId, $arg),
            '/leavelive' => handleLeaveLiveCommand($pdo, $config, $chatId, $groupId),
            '/live' => handleLiveStatusPanel($config, $chatId),
            '/account', '/connect', '/disconnect', '/reconnect' => handleAccountCommand($pdo, $config, $chatId, $fromId, $cmd === '/account' ? 'status' : ltrim($cmd, '/')),
            '/ping' => sendTelegramMessage($config, $chatId, '⚡ Pong! PHP Webhook Active.'),
            '/owner', '/stats', '/status', '/maintenance', '/broadcast', '/users', '/groups', '/reload', '/restart' => handleAdminCommand($pdo, $config, $chatId, $fromId, $cmd, $arg),
            default => str_contains($text, 't.me/')
                ? handleJoinLiveCommand($pdo, $config, $chatId, $groupId, $text)
                : sendTelegramMessage($config, $chatId, 'Send /start or /help to explore commands.', buildMainWelcomeKeyboard()),
        };
    }

    echo json_encode(['ok' => true]);
} catch (Throwable $e) {
    error_log('Webhook failure: ' . $e->getMessage());
    http_response_code(200);
    echo json_encode(['ok' => true]);
}

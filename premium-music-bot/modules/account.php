<?php
declare(strict_types=1);

function handleAccountCommand(PDO $pdo, array $config, int|string $chatId, int $fromTelegramId, string $op = 'status', ?int $editMessageId = null): void
{
    if (!isBotOwner($fromTelegramId, $config)) {
        sendTelegramMessage($config, $chatId, '⛔ Personal Account controls are restricted exclusively to the Bot Owner.');
        return;
    }

    if ($op === 'connect' || $op === 'disconnect' || $op === 'reconnect') {
        $res = callPythonAudioBackend($config, "/account/{$op}", []);
    } else {
        $res = callPythonAudioBackend($config, '/account/status', [], 'GET');
    }

    if (!$res['ok']) {
        $text = '❌ ' . $res['error'];
    } else {
        $d = $res['data'];
        $name = (string) ($d['display_name'] ?? 'Personal Account');
        $uname = (string) ($d['username'] ?? '@unknown');
        $status = strtoupper((string) ($d['status'] ?? 'disconnected'));
        $online = !empty($d['online']) ? 'Online' : 'Offline';
        $liveChat = (string) ($d['active_voice_chat'] ?? 'None');

        $stmt = $pdo->prepare(
            "INSERT INTO account_sessions (account_label, username, display_name, connection_status, is_online, last_heartbeat_at)
             VALUES ('primary', :u, :n, :s, :o, CURRENT_TIMESTAMP)
             ON DUPLICATE KEY UPDATE username = VALUES(username), display_name = VALUES(display_name), connection_status = VALUES(connection_status), is_online = VALUES(is_online), last_heartbeat_at = CURRENT_TIMESTAMP"
        );
        $stmt->execute([
            ':u' => $uname,
            ':n' => $name,
            ':s' => strtolower($status),
            ':o' => !empty($d['online']) ? 1 : 0,
        ]);

        $text = implode("\n", [
            '👤 𝐏𝐄𝐑𝐒𝐎𝐍𝐀𝐋 𝐀𝐂𝐂𝐎𝐔𝐍𝐓 𝐂𝐎𝐍𝐓𝐑𝐎𝐋',
            '',
            "Name: {$name}",
            "Username: {$uname}",
            "Status: {$status} ({$online})",
            "Voice Chat: {$liveChat}",
            'Security: Encrypted MTProto Session (Zero Chat Leak)',
        ]);
    }

    $markup = buildAccountControlKeyboard();
    if ($editMessageId !== null) {
        editTelegramMessage($config, $chatId, $editMessageId, $text, $markup);
    } else {
        sendTelegramMessage($config, $chatId, $text, $markup);
    }
}

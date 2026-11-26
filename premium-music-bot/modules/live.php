<?php
declare(strict_types=1);

function handleJoinLiveCommand(PDO $pdo, array $config, int|string $chatId, int $groupId, string $link): void
{
    if ($link === '' || (!str_contains($link, 't.me/') && !str_contains($link, 'telegram.me/'))) {
        sendTelegramMessage($config, $chatId, "❌ Invalid Live Link\nUsage: /joinlive https://t.me/example_group/123");
        return;
    }

    if (!validateSafeExternalUrl($link)) {
        sendTelegramMessage($config, $chatId, '❌ Invalid Live Link');
        return;
    }

    $res = callPythonAudioBackend($config, '/live/join', ['link' => $link, 'chat_id' => $chatId]);
    if (!$res['ok']) {
        logSystemError($pdo, $config, 'live_join', (string) $res['error']);
        sendTelegramMessage($config, $chatId, '❌ ' . $res['error']);
        return;
    }

    $d = $res['data'];
    $groupTitle = (string) ($d['group_title'] ?? 'Group Voice Chat');

    $acctId = (int) ($pdo->query('SELECT id FROM account_sessions ORDER BY id DESC LIMIT 1')->fetchColumn() ?: 0);
    if ($acctId > 0) {
        $stmt = $pdo->prepare(
            "INSERT INTO live_sessions (group_id, account_session_id, voice_chat_link, status)
             VALUES (:gid, :aid, :lnk, 'active')"
        );
        $stmt->execute([':gid' => $groupId, ':aid' => $acctId, ':lnk' => $link]);
    }

    $final = toSmallCaps(implode("\n", [
        '🎤 Live Connected',
        '',
        '✅ Personal Account: Connected',
        '🎧 Voice Chat: Active',
        "📍 Group: {$groupTitle}",
        '🎵 Music Player: Ready',
        '🔊 Audio: Streaming',
        '⚡ Connection: Stable',
    ]));

    sendTelegramEffectMessage($config, $chatId, 'private', $final, buildLiveControlKeyboard(), '5159385139981059251', [
        toSmallCaps('🎤 Connecting Voice Chat...') . "\n▁▂▃▄▅▆▇  ▰▱▱▱▱",
        toSmallCaps('🎤 Connecting Voice Chat...') . "\n▂▄▆▇▆▄▂  ▰▰▱▱▱",
        toSmallCaps('🎤 Connecting Voice Chat...') . "\n▄▆▇▅▃▅▇  ▰▰▰▱▱",
        toSmallCaps('🔊 Syncing Live Stream...') . "\n▆▇▅▃▂▄▆  ▰▰▰▰▱",
        toSmallCaps('🔊 Syncing Live Stream...') . "\n▇▆▅▄▃▂▁  ▰▰▰▰▰",
    ]);
}

function handleLeaveLiveCommand(PDO $pdo, array $config, int|string $chatId, int $groupId): void
{
    $res = callPythonAudioBackend($config, '/live/leave', ['chat_id' => $chatId]);
    $pdo->prepare("UPDATE live_sessions SET status = 'ended', ended_at = CURRENT_TIMESTAMP WHERE group_id = :gid AND status = 'active'")
        ->execute([':gid' => $groupId]);

    $msg = $res['ok'] ? '🚪 Left Voice Chat cleanly.' : '❌ ' . $res['error'];
    sendTelegramMessage($config, $chatId, $msg, buildLiveControlKeyboard());
}

function handleLiveStatusPanel(array $config, int|string $chatId, ?int $editMessageId = null): void
{
    $res = callPythonAudioBackend($config, '/live/status', [], 'GET');
    if (!$res['ok']) {
        $text = "❌ Streaming Backend Offline";
    } else {
        $d = $res['data'];
        $text = !empty($d['active'])
            ? "🎤 𝐋𝐈𝐕𝐄 𝐂𝐎𝐍𝐍𝐄𝐂𝐓𝐄𝐃\n\n✅ Personal Account: Connected\n🎧 Voice Chat: Active\n📍 Group: " . ($d['group_title'] ?? 'Active Chat') . "\n⚡ Connection: Stable"
            : "🎤 𝐋𝐈𝐕𝐄 𝐂𝐎𝐍𝐓𝐑𝐎𝐋 𝐏𝐀𝐍𝐄𝐋\n\n🎧 Voice Chat: Idle\nSend /joinlive https://t.me/group/123";
    }

    if ($editMessageId !== null) {
        editTelegramMessage($config, $chatId, $editMessageId, $text, buildLiveControlKeyboard());
    } else {
        sendTelegramMessage($config, $chatId, $text, buildLiveControlKeyboard());
    }
}

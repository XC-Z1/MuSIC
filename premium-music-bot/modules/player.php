<?php
declare(strict_types=1);

function handlePlayerAction(array $config, int|string $chatId, string $action, ?int $editMessageId = null): void
{
    $endpoint = ($action === 'status' || $action === 'nowplaying') ? '/player/status' : "/player/{$action}";
    $method = ($action === 'status' || $action === 'nowplaying') ? 'GET' : 'POST';
    $res = callPythonAudioBackend($config, $endpoint, ['chat_id' => $chatId], $method);

    if (!$res['ok']) {
        $msg = '❌ ' . $res['error'];
        if ($editMessageId !== null) {
            editTelegramMessage($config, $chatId, $editMessageId, $msg, buildPlayerKeyboard(false));
        } else {
            sendTelegramMessage($config, $chatId, $msg, buildPlayerKeyboard(false));
        }
        return;
    }

    $d = $res['data'];
    $title = (string) ($d['title'] ?? 'No Active Track');
    $artist = (string) ($d['artist'] ?? '-');
    $pos = (int) ($d['position'] ?? 0);
    $dur = (int) ($d['duration'] ?? 0);
    $vol = (int) ($d['volume'] ?? 80);
    $muted = (bool) ($d['muted'] ?? false);
    $status = (string) ($d['status'] ?? 'idle');

    $text = implode("\n", [
        '🎧 𝐍𝐎𝐖 𝐏𝐋𝐀𝐘𝐈𝐍𝐆',
        '',
        "🎵 Song: {$title}",
        "👤 Artist: {$artist}",
        '⏱️ Duration: ' . formatDurationClock($pos) . ' / ' . formatDurationClock($dur),
        '🔊 Volume: ' . ($muted ? 'Muted' : "{$vol}%"),
        '▶️ Status: ' . ucfirst($status),
        '',
        formatProgressBar($pos, max(1, $dur)),
    ]);

    $markup = buildPlayerKeyboard($status === 'playing');
    if ($editMessageId !== null) {
        editTelegramMessage($config, $chatId, $editMessageId, $text, $markup);
    } else {
        sendTelegramMessage($config, $chatId, $text, $markup);
    }
}

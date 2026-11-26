<?php
declare(strict_types=1);

function handlePlayCommand(PDO $pdo, array $config, int|string $chatId, int $groupId, int $userId, string $source, string $requester): void
{
    if ($source === '') {
        sendTelegramMessage($config, $chatId, '🎵 Usage: /play <song name or direct audio URL>');
        return;
    }

    if (str_starts_with($source, 'http://') || str_starts_with($source, 'https://')) {
        if (!validateSafeExternalUrl($source)) {
            sendTelegramMessage($config, $chatId, '❌ Invalid or unsafe audio URL.');
            return;
        }
    }

    $res = callPythonAudioBackend($config, '/player/play', [
        'chat_id' => $chatId,
        'source' => $source,
        'requested_by' => $requester,
    ]);

    if (!$res['ok']) {
        logSystemError($pdo, $config, 'audio_stream', (string) $res['error']);
        sendTelegramMessage($config, $chatId, '❌ ' . $res['error']);
        return;
    }

    $data = $res['data'];
    $title = (string) ($data['title'] ?? $source);
    $artist = (string) ($data['artist'] ?? 'Unknown Artist');
    $duration = (int) ($data['duration'] ?? 0);

    $stmt = $pdo->prepare(
        'INSERT INTO music_queue (group_id, requested_by_user_id, song_title, artist_name, source_url, duration_sec, status)
         VALUES (:gid, :uid, :title, :artist, :url, :dur, :st)'
    );
    $stmt->execute([
        ':gid' => $groupId,
        ':uid' => $userId,
        ':title' => $title,
        ':artist' => $artist,
        ':url' => $source,
        ':dur' => $duration,
        ':st' => ($data['queued'] ?? false) ? 'queued' : 'playing',
    ]);

    $pdo->prepare(
        'INSERT INTO statistics (stat_date, tracks_played, commands_handled) VALUES (CURDATE(), 1, 1)
         ON DUPLICATE KEY UPDATE tracks_played = tracks_played + 1, commands_handled = commands_handled + 1'
    )->execute();

    $final = toSmallCaps(implode("\n", [
        '🎧 Now Playing',
        '',
        "🎵 Song: {$title}",
        "👤 Artist: {$artist}",
        '⏱️ Duration: ' . formatDurationClock($duration),
        '▶️ Status: Playing',
        '',
    ])) . formatProgressBar(0, max(1, $duration));

    sendTelegramEffectMessage($config, $chatId, 'private', $final, buildPlayerKeyboard(true), '5104841245755180586', [
        toSmallCaps('🎵 Fetching Audio...') . "\n▁▂▃▄▅▆▇  ▰▱▱▱▱",
        toSmallCaps('🎵 Fetching Audio...') . "\n▂▄▆▇▆▄▂  ▰▰▱▱▱",
        toSmallCaps('🎵 Fetching Audio...') . "\n▄▆▇▅▃▅▇  ▰▰▰▱▱",
        toSmallCaps('🔥 Tuning FFmpeg Stream...') . "\n▆▇▅▃▂▄▆  ▰▰▰▰▱",
        toSmallCaps('🔥 Tuning FFmpeg Stream...') . "\n▇▆▅▄▃▂▁  ▰▰▰▰▰",
    ]);
}

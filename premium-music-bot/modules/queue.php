<?php
declare(strict_types=1);

function handleQueueCommand(PDO $pdo, array $config, int|string $chatId, int $groupId, ?int $editMessageId = null): void
{
    $stmt = $pdo->prepare(
        "SELECT song_title, artist_name, duration_sec, status
         FROM music_queue
         WHERE group_id = :gid AND status IN ('playing', 'queued')
         ORDER BY FIELD(status, 'playing', 'queued'), id ASC
         LIMIT 15"
    );
    $stmt->execute([':gid' => $groupId]);
    $rows = $stmt->fetchAll();

    $lines = ['📚 𝐌𝐔𝐒𝐈𝐂 𝐐𝐔𝐄𝐔𝐄', ''];
    if (empty($rows)) {
        $lines[] = 'Queue is empty. Use /play <song or link> to add tracks.';
    } else {
        foreach ($rows as $i => $row) {
            $prefix = $row['status'] === 'playing' ? '▶️' : (($i + 1) . '.');
            $dur = formatDurationClock((int) $row['duration_sec']);
            $lines[] = "{$prefix} {$row['song_title']} — {$row['artist_name']} [{$dur}]";
        }
    }

    $text = implode("\n", $lines);
    $markup = buildPlayerKeyboard(true);
    if ($editMessageId !== null) {
        editTelegramMessage($config, $chatId, $editMessageId, $text, $markup);
    } else {
        sendTelegramMessage($config, $chatId, $text, $markup);
    }
}

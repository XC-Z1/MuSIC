<?php
declare(strict_types=1);

function handleVolumeAction(PDO $pdo, array $config, int|string $chatId, int $groupId, string $op, ?int $editMessageId = null): void
{
    $stmt = $pdo->prepare('SELECT volume_percent, is_muted, previous_volume FROM volume_settings WHERE group_id = :gid LIMIT 1');
    $stmt->execute([':gid' => $groupId]);
    $row = $stmt->fetch() ?: ['volume_percent' => 80, 'is_muted' => 0, 'previous_volume' => 80];

    $vol = (int) $row['volume_percent'];
    $muted = (int) $row['is_muted'];
    $prev = (int) $row['previous_volume'];

    if ($op === 'mute') {
        $prev = $vol;
        $muted = 1;
    } elseif ($op === 'unmute') {
        $muted = 0;
        $vol = max(10, min(200, $prev ?: 80));
    } elseif (str_starts_with($op, '+') || str_starts_with($op, '-')) {
        $muted = 0;
        $vol = max(10, min(200, $vol + (int) $op));
        $prev = $vol;
    } elseif (is_numeric($op)) {
        $muted = 0;
        $vol = max(10, min(200, (int) $op));
        $prev = $vol;
    }

    $upsert = $pdo->prepare(
        'INSERT INTO volume_settings (group_id, volume_percent, is_muted, previous_volume)
         VALUES (:gid, :vol, :muted, :prev)
         ON DUPLICATE KEY UPDATE volume_percent = VALUES(volume_percent), is_muted = VALUES(is_muted), previous_volume = VALUES(previous_volume)'
    );
    $upsert->execute([':gid' => $groupId, ':vol' => $vol, ':muted' => $muted, ':prev' => $prev]);

    callPythonAudioBackend($config, '/volume/set', [
        'chat_id' => $chatId,
        'volume' => $muted ? 0 : $vol,
        'muted' => (bool) $muted,
    ]);

    $display = $muted ? '🔇 MUTED' : "🔊 {$vol}%";
    $text = toSmallCaps("🎚️ Volume Control\n\n<  {$display}  >\n\nRange: 10% – 200% (Per-Group Memory Saved)");
    $markup = buildVolumeKeyboard();
    if ($editMessageId !== null) {
        editTelegramMessage($config, $chatId, $editMessageId, $text, $markup);
    } else {
        sendTelegramEffectMessage($config, $chatId, 'private', $text, $markup, '5104841245755180586', [
            toSmallCaps('🎚️ Opening Volume Control...') . "\n▁▂▃▄▅▆▇  ▰▱▱▱▱",
            toSmallCaps('🔥 Volume Range: 10% – 200%...') . "\n▇▆▅▄▃▂▁  ▰▰▰▰▰",
        ]);
    }
}

<?php
declare(strict_types=1);

function getWelcomeMessageText(): string
{
    return implode("\n", [
        '🎧 𝐖𝐄𝐋𝐂𝐎𝐌𝐄 𝐓𝐎 𝐏𝐑𝐄𝐌𝐈𝐔𝐌 𝐌𝐔𝐒𝐈𝐂 𝐁𝐎𝐓',
        '',
        '🎶 Your Music, Your World!',
        '✨ Premium Music Experience',
        '⚡ Ultra Fast Performance',
        '🎚️ Advanced Music Controls',
        '🎤 Auto Live Join System',
        '🎧 Personal Account Control',
        '🔥 Smart Music Streaming',
    ]);
}

function formatProgressBar(int $positionSec, int $durationSec, int $width = 17): string
{
    $total = max(1, $durationSec);
    $ratio = min(1.0, max(0.0, $positionSec / $total));
    $knob = (int) min($width - 1, round($ratio * ($width - 1)));
    $out = '';
    for ($i = 0; $i < $width; $i++) {
        $out .= ($i === $knob) ? '●' : '━';
    }
    return $out;
}

function formatDurationClock(int $seconds): string
{
    $safe = max(0, $seconds);
    return sprintf('%02d:%02d', intdiv($safe, 60), $safe % 60);
}

function getHelpMessageText(): string
{
    return implode("\n", [
        '📚 𝐂𝐎𝐌𝐌𝐀𝐍𝐃 𝐑𝐄𝐅𝐄𝐑𝐄𝐍𝐂𝐄',
        '',
        'General Commands:',
        '/start - Welcome · /help - Help Menu',
        '/play <url|song> - Play Music · /pause - Pause',
        '/resume - Resume · /skip - Skip · /stop - Stop',
        '/queue - Queue · /nowplaying - Current Track',
        '/volume <10-200> · /mute · /unmute',
        '',
        'Live & Personal Account:',
        '/joinlive <t.me link> · /leavelive · /live · /autojoin',
        '/account · /connect · /disconnect · /reconnect',
        '',
        'System & Admin:',
        '/ping · /stats · /reload · /status',
        '/broadcast · /maintenance · /users · /groups · /restart',
    ]);
}

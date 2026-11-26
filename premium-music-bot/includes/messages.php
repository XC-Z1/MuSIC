<?php
declare(strict_types=1);

function toSmallCaps(string $input): string
{
    static $map = [
        'a' => 'ᴀ', 'b' => 'ʙ', 'c' => 'ᴄ', 'd' => 'ᴅ', 'e' => 'ᴇ', 'f' => 'ғ',
        'g' => 'ɢ', 'h' => 'ʜ', 'i' => 'ɪ', 'j' => 'ᴊ', 'k' => 'ᴋ', 'l' => 'ʟ',
        'm' => 'ᴍ', 'n' => 'ɴ', 'o' => 'ᴏ', 'p' => 'ᴘ', 'q' => 'ǫ', 'r' => 'ʀ',
        's' => 's', 't' => 'ᴛ', 'u' => 'ᴜ', 'v' => 'ᴠ', 'w' => 'ᴡ', 'x' => 'x',
        'y' => 'ʏ', 'z' => 'ᴢ',
    ];

    $tokens = preg_split('/(\s+)/u', $input, -1, PREG_SPLIT_DELIM_CAPTURE);
    if ($tokens === false) {
        return $input;
    }

    $out = '';
    foreach ($tokens as $token) {
        if ($token === '' || preg_match('/^\s+$/u', $token)) {
            $out .= $token;
            continue;
        }
        if (
            str_starts_with($token, '/') ||
            str_starts_with($token, '@') ||
            str_starts_with($token, 'http://') ||
            str_starts_with($token, 'https://') ||
            preg_match('/^[A-Z0-9_]{3,}$/', $token)
        ) {
            $out .= $token;
            continue;
        }
        $lower = strtolower($token);
        $out .= strtr($lower, $map);
    }
    return $out;
}

function getWelcomeMessageText(): string
{
    return toSmallCaps(implode("\n", [
        '🎧 Welcome To Music Spam Bot',
        '',
        '🎶 Your Music, Your World!',
        '✨ Premium Music Experience',
        '⚡ Ultra Fast Performance',
        '🎚️ Advanced Music Controls',
        '🎤 Auto Live Join System',
        '🎧 Personal Account Control',
        '🔥 Smart Music Streaming',
    ]));
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
    return toSmallCaps(implode("\n", [
        '📚 Command Reference',
        '',
        'Music Selection & Playback:',
        '/search <song> · /play <url|song> · /pause',
        '/resume · /skip · /stop · /queue · /nowplaying',
        '/volume <10-200> · /mute · /unmute',
        '',
        'Live & Personal Account:',
        '/joinlive <t.me link> · /leavelive · /live · /autojoin',
        '/account · /connect · /disconnect · /reconnect',
        '',
        'System & Admin:',
        '/ping · /stats · /reload · /status',
        '/broadcast · /maintenance · /users · /groups · /restart',
    ]));
}

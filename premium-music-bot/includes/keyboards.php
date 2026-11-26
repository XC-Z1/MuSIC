<?php
declare(strict_types=1);

require_once __DIR__ . '/messages.php';

function buildMainWelcomeKeyboard(): array
{
    return [
        'inline_keyboard' => [
            [
                ['text' => toSmallCaps('🎵 Play Music'), 'callback_data' => 'menu:play', 'style' => 'success'],
            ],
            [
                ['text' => toSmallCaps('🎧 Music Player'), 'callback_data' => 'menu:player', 'style' => 'primary'],
                ['text' => toSmallCaps('🎤 Auto Live Join'), 'callback_data' => 'menu:live', 'style' => 'success'],
            ],
            [
                ['text' => toSmallCaps('📊 Now Playing'), 'callback_data' => 'menu:nowplaying', 'style' => 'primary'],
                ['text' => toSmallCaps('🎚️ Volume Control'), 'callback_data' => 'menu:volume', 'style' => 'primary'],
                ['text' => toSmallCaps('👤 Account Control'), 'callback_data' => 'menu:account', 'style' => 'primary'],
            ],
            [
                ['text' => toSmallCaps('📚 Help & Commands'), 'callback_data' => 'menu:help', 'style' => 'primary'],
                ['text' => toSmallCaps('👑 Bot Owner'), 'callback_data' => 'menu:owner', 'style' => 'primary'],
            ],
        ],
    ];
}

function buildPlayerKeyboard(bool $isPlaying = true): array
{
    return [
        'inline_keyboard' => [
            [
                ['text' => toSmallCaps('⏮️ Prev'), 'callback_data' => 'player:prev', 'style' => 'primary'],
                [
                    'text' => toSmallCaps($isPlaying ? '⏸️ Pause' : '▶️ Resume'),
                    'callback_data' => $isPlaying ? 'player:pause' : 'player:resume',
                    'style' => $isPlaying ? 'primary' : 'success',
                ],
                ['text' => toSmallCaps('⏭️ Skip'), 'callback_data' => 'player:skip', 'style' => 'primary'],
                ['text' => toSmallCaps('⏹️ Stop'), 'callback_data' => 'player:stop', 'style' => 'danger'],
            ],
            [
                ['text' => toSmallCaps('🔁 Repeat'), 'callback_data' => 'player:repeat', 'style' => 'primary'],
                ['text' => toSmallCaps('📚 Queue'), 'callback_data' => 'menu:queue', 'style' => 'primary'],
            ],
            [
                ['text' => toSmallCaps('🎚️ Volume Control'), 'callback_data' => 'menu:volume', 'style' => 'primary'],
                ['text' => toSmallCaps('🎤 Live Control'), 'callback_data' => 'menu:live', 'style' => 'success'],
            ],
            [['text' => toSmallCaps('🔙 Main Menu'), 'callback_data' => 'menu:start', 'style' => 'primary']],
        ],
    ];
}

function buildVolumeKeyboard(): array
{
    return [
        'inline_keyboard' => [
            [
                ['text' => '➖ 10%', 'callback_data' => 'vol:-10', 'style' => 'danger'],
                ['text' => '➕ 10%', 'callback_data' => 'vol:+10', 'style' => 'success'],
            ],
            [
                ['text' => '➖ 20%', 'callback_data' => 'vol:-20', 'style' => 'danger'],
                ['text' => '➕ 20%', 'callback_data' => 'vol:+20', 'style' => 'success'],
            ],
            [
                ['text' => '🔊 100%', 'callback_data' => 'vol:100', 'style' => 'primary'],
                ['text' => '🔥 150%', 'callback_data' => 'vol:150', 'style' => 'success'],
                ['text' => '🚀 200%', 'callback_data' => 'vol:200', 'style' => 'success'],
            ],
            [
                ['text' => toSmallCaps('🔇 Mute'), 'callback_data' => 'vol:mute', 'style' => 'danger'],
                ['text' => toSmallCaps('🔊 Unmute'), 'callback_data' => 'vol:unmute', 'style' => 'success'],
            ],
            [['text' => toSmallCaps('🔙 Back To Player'), 'callback_data' => 'menu:player', 'style' => 'primary']],
        ],
    ];
}

function buildLiveControlKeyboard(): array
{
    return [
        'inline_keyboard' => [
            [
                ['text' => toSmallCaps('🎤 Join Live'), 'callback_data' => 'live:join_prompt', 'style' => 'success'],
                ['text' => toSmallCaps('🚪 Leave Live'), 'callback_data' => 'live:leave', 'style' => 'danger'],
            ],
            [
                ['text' => toSmallCaps('▶️ Play Music'), 'callback_data' => 'menu:play', 'style' => 'success'],
                ['text' => toSmallCaps('⏸️ Pause Music'), 'callback_data' => 'player:pause', 'style' => 'primary'],
            ],
            [
                ['text' => toSmallCaps('▶️ Resume Music'), 'callback_data' => 'player:resume', 'style' => 'success'],
                ['text' => toSmallCaps('⏭️ Skip Music'), 'callback_data' => 'player:skip', 'style' => 'primary'],
            ],
            [
                ['text' => toSmallCaps('⏹️ Stop Music'), 'callback_data' => 'player:stop', 'style' => 'danger'],
                ['text' => toSmallCaps('📊 Live Status'), 'callback_data' => 'menu:live', 'style' => 'primary'],
            ],
            [
                ['text' => toSmallCaps('🔊 Volume Up'), 'callback_data' => 'vol:+10', 'style' => 'success'],
                ['text' => toSmallCaps('🔉 Volume Down'), 'callback_data' => 'vol:-10', 'style' => 'danger'],
            ],
            [
                ['text' => toSmallCaps('🔇 Mute'), 'callback_data' => 'vol:mute', 'style' => 'danger'],
                ['text' => toSmallCaps('🔊 Unmute'), 'callback_data' => 'vol:unmute', 'style' => 'success'],
            ],
            [
                ['text' => toSmallCaps('🔄 Reconnect'), 'callback_data' => 'account:reconnect', 'style' => 'primary'],
                ['text' => toSmallCaps('🔙 Main Menu'), 'callback_data' => 'menu:start', 'style' => 'primary'],
            ],
        ],
    ];
}

function buildAccountControlKeyboard(): array
{
    return [
        'inline_keyboard' => [
            [
                ['text' => toSmallCaps('🔗 Connect'), 'callback_data' => 'account:connect', 'style' => 'success'],
                ['text' => toSmallCaps('🔌 Disconnect'), 'callback_data' => 'account:disconnect', 'style' => 'danger'],
            ],
            [
                ['text' => toSmallCaps('🔄 Reconnect'), 'callback_data' => 'account:reconnect', 'style' => 'primary'],
                ['text' => toSmallCaps('🎤 Live Panel'), 'callback_data' => 'menu:live', 'style' => 'success'],
            ],
            [['text' => toSmallCaps('🔙 Main Menu'), 'callback_data' => 'menu:start', 'style' => 'primary']],
        ],
    ];
}

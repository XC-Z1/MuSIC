<?php
declare(strict_types=1);

require_once __DIR__ . '/messages.php';

function buildMainWelcomeKeyboard(): array
{
    return [
        'inline_keyboard' => [
            [
                ['text' => toSmallCaps('🎵 Play Music'), 'callback_data' => 'menu:play'],
                ['text' => toSmallCaps('🎧 Music Player'), 'callback_data' => 'menu:player'],
            ],
            [
                ['text' => toSmallCaps('🎤 Auto Live Join'), 'callback_data' => 'menu:live'],
                ['text' => toSmallCaps('👤 Account Control'), 'callback_data' => 'menu:account'],
            ],
            [
                ['text' => toSmallCaps('📊 Now Playing'), 'callback_data' => 'menu:nowplaying'],
                ['text' => toSmallCaps('🎚️ Volume Control'), 'callback_data' => 'menu:volume'],
            ],
            [
                ['text' => toSmallCaps('📚 Help & Commands'), 'callback_data' => 'menu:help'],
                ['text' => toSmallCaps('👑 Bot Owner'), 'callback_data' => 'menu:owner'],
            ],
        ],
    ];
}

function buildPlayerKeyboard(bool $isPlaying = true): array
{
    return [
        'inline_keyboard' => [
            [
                ['text' => toSmallCaps('⏮️ Prev'), 'callback_data' => 'player:prev'],
                ['text' => toSmallCaps($isPlaying ? '⏸️ Pause' : '▶️ Resume'), 'callback_data' => $isPlaying ? 'player:pause' : 'player:resume'],
                ['text' => toSmallCaps('⏭️ Skip'), 'callback_data' => 'player:skip'],
                ['text' => toSmallCaps('⏹️ Stop'), 'callback_data' => 'player:stop'],
            ],
            [
                ['text' => toSmallCaps('🔁 Repeat'), 'callback_data' => 'player:repeat'],
                ['text' => toSmallCaps('📚 Queue'), 'callback_data' => 'menu:queue'],
            ],
            [
                ['text' => toSmallCaps('🎚️ Volume Control'), 'callback_data' => 'menu:volume'],
                ['text' => toSmallCaps('🎤 Live Control'), 'callback_data' => 'menu:live'],
            ],
            [['text' => toSmallCaps('🔙 Main Menu'), 'callback_data' => 'menu:start']],
        ],
    ];
}

function buildVolumeKeyboard(): array
{
    return [
        'inline_keyboard' => [
            [
                ['text' => '➖ 10%', 'callback_data' => 'vol:-10'],
                ['text' => '➕ 10%', 'callback_data' => 'vol:+10'],
            ],
            [
                ['text' => '➖ 20%', 'callback_data' => 'vol:-20'],
                ['text' => '➕ 20%', 'callback_data' => 'vol:+20'],
            ],
            [
                ['text' => toSmallCaps('🔇 Mute'), 'callback_data' => 'vol:mute'],
                ['text' => toSmallCaps('🔊 Unmute'), 'callback_data' => 'vol:unmute'],
            ],
            [['text' => toSmallCaps('🔙 Back To Player'), 'callback_data' => 'menu:player']],
        ],
    ];
}

function buildLiveControlKeyboard(): array
{
    return [
        'inline_keyboard' => [
            [
                ['text' => toSmallCaps('🎤 Join Live'), 'callback_data' => 'live:join_prompt'],
                ['text' => toSmallCaps('🚪 Leave Live'), 'callback_data' => 'live:leave'],
            ],
            [
                ['text' => toSmallCaps('▶️ Play Music'), 'callback_data' => 'menu:play'],
                ['text' => toSmallCaps('⏸️ Pause Music'), 'callback_data' => 'player:pause'],
            ],
            [
                ['text' => toSmallCaps('▶️ Resume Music'), 'callback_data' => 'player:resume'],
                ['text' => toSmallCaps('⏭️ Skip Music'), 'callback_data' => 'player:skip'],
            ],
            [
                ['text' => toSmallCaps('⏹️ Stop Music'), 'callback_data' => 'player:stop'],
                ['text' => toSmallCaps('📊 Live Status'), 'callback_data' => 'menu:live'],
            ],
            [
                ['text' => toSmallCaps('🔊 Volume Up'), 'callback_data' => 'vol:+10'],
                ['text' => toSmallCaps('🔉 Volume Down'), 'callback_data' => 'vol:-10'],
            ],
            [
                ['text' => toSmallCaps('🔇 Mute'), 'callback_data' => 'vol:mute'],
                ['text' => toSmallCaps('🔊 Unmute'), 'callback_data' => 'vol:unmute'],
            ],
            [
                ['text' => toSmallCaps('🔄 Reconnect'), 'callback_data' => 'account:reconnect'],
                ['text' => toSmallCaps('🔙 Main Menu'), 'callback_data' => 'menu:start'],
            ],
        ],
    ];
}

function buildAccountControlKeyboard(): array
{
    return [
        'inline_keyboard' => [
            [
                ['text' => toSmallCaps('🔗 Connect'), 'callback_data' => 'account:connect'],
                ['text' => toSmallCaps('🔌 Disconnect'), 'callback_data' => 'account:disconnect'],
            ],
            [
                ['text' => toSmallCaps('🔄 Reconnect'), 'callback_data' => 'account:reconnect'],
                ['text' => toSmallCaps('🎤 Live Panel'), 'callback_data' => 'menu:live'],
            ],
            [['text' => toSmallCaps('🔙 Main Menu'), 'callback_data' => 'menu:start']],
        ],
    ];
}

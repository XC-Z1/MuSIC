<?php
declare(strict_types=1);

function handleStartCommand(array $config, int|string $chatId, ?int $editMessageId = null, string $chatType = 'private'): void
{
    $welcome = getWelcomeMessageText();
    $markup = buildMainWelcomeKeyboard();
    if ($editMessageId !== null) {
        editTelegramMessage($config, $chatId, $editMessageId, $welcome, $markup);
        return;
    }

    sendTelegramEffectMessage($config, $chatId, $chatType, $welcome, $markup, '5046509860389126442', [
        toSmallCaps('⚡ Booting Music Spam Bot...') . "\n▁▂▃▄▅▆▇  ▰▱▱▱▱",
        toSmallCaps('🎧 Syncing Live Controls...') . "\n▇▆▅▄▃▂▁  ▰▰▰▰▰",
    ]);
}

function handleHelpCommand(array $config, int|string $chatId, ?int $editMessageId = null): void
{
    $text = getHelpMessageText();
    $markup = buildMainWelcomeKeyboard();
    if ($editMessageId !== null) {
        editTelegramMessage($config, $chatId, $editMessageId, $text, $markup);
    } else {
        sendTelegramMessage($config, $chatId, $text, $markup);
    }
}

<?php
declare(strict_types=1);

function handleStartCommand(array $config, int|string $chatId, ?int $editMessageId = null): void
{
    $welcome = getWelcomeMessageText();
    $markup = buildMainWelcomeKeyboard();
    if ($editMessageId !== null) {
        editTelegramMessage($config, $chatId, $editMessageId, $welcome, $markup);
        return;
    }

    $frames = [
        "🎧 Initializing Premium Music Bot...\n◉ ○ ○ ○",
        "🎶 Syncing Personal Account Bridge...\n◉ ◉ ○ ○",
        "✨ Preparing Live Audio Console...\n◉ ◉ ◉ ○",
        $welcome,
    ];
    playAnimatedTelegramFrames($config, $chatId, $frames, $markup);
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

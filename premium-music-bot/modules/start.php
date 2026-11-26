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
        '▁▂▃▄▅▆▇ ▰▱▱▱▱',
        '▁▂▃▄▅▆▇ ▰▱▱▱▱ → ▇▆▅▄▃▂▁ ▰▰▰▰▰',
    ]);
}

function handleHelpCommand(array $config, int|string $chatId, ?int $editMessageId = null, string $chatType = 'private'): void
{
    $text = getHelpMessageText();
    $markup = buildMainWelcomeKeyboard();
    if ($editMessageId !== null) {
        editTelegramMessage($config, $chatId, $editMessageId, $text, $markup);
    } else {
        sendTelegramEffectMessage($config, $chatId, $chatType, $text, $markup, '5107584321108051014');
    }
}

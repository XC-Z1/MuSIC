import { editMessageText, sendMessage, toSmallCaps, type InlineKeyboardMarkup } from './telegram';

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Plays a snappy, modern equalizer + block-bar transition via editMessageText.
 */
export async function playAnimatedSequence(
  chatId: number | string,
  frames: string[],
  finalReplyMarkup?: InlineKeyboardMarkup,
  delayMs = 260,
): Promise<number | null> {
  if (frames.length === 0) return null;

  const first = await sendMessage(chatId, frames[0]);
  const messageId = first?.result?.message_id ?? null;
  if (!messageId) return null;

  for (let i = 1; i < frames.length; i++) {
    await sleep(delayMs);
    const isLast = i === frames.length - 1;
    await editMessageText(
      chatId,
      messageId,
      frames[i],
      isLast ? finalReplyMarkup : undefined,
    );
  }

  return messageId;
}

export const ANIMATION_PRESETS = {
  welcome: [
    `${toSmallCaps('⚡ Booting Music Engine...')}\n▁▂▃▄▅▆▇  ▰▱▱▱▱`,
    `${toSmallCaps('🎧 Syncing Live Controls...')}\n▇▆▅▄▃▂▁  ▰▰▰▰▰`,
  ],
  joinLive: (target: string) => [
    `${toSmallCaps(`🎤 Connecting Voice Chat (${target})...`)}\n▁▃▅▇▅▃  ▰▰▱▱▱`,
    `${toSmallCaps('🔊 Syncing Live Stream...')}\n▇▅▃▁▃▅  ▰▰▰▰▰`,
  ],
  playMusic: (query: string) => [
    `${toSmallCaps(`🎵 Fetching Audio (${query})...`)}\n▁▃▅▇▅▃  ▰▰▱▱▱`,
    `${toSmallCaps('🎚️ Tuning FFmpeg Stream...')}\n▇▅▃▁▃▅  ▰▰▰▰▰`,
  ],
  reconnect: [
    `${toSmallCaps('🔐 Verifying MTProto Session...')}\n▁▃▅▇▅▃  ▰▰▱▱▱`,
    `${toSmallCaps('✅ Personal Account Reconnected!')}\n▇▅▃▁▃▅  ▰▰▰▰▰`,
  ],
};

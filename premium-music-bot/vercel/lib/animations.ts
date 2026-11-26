import { editMessageText, sendMessage, type InlineKeyboardMarkup } from './telegram';

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Plays a smooth, Telegram-rate-limit-safe multi-frame animation using editMessageText.
 * Keeps interval >= 550ms and <= 4 frames per sequence to prevent 429 Too Many Requests.
 */
export async function playAnimatedSequence(
  chatId: number | string,
  frames: string[],
  finalReplyMarkup?: InlineKeyboardMarkup,
  delayMs = 550,
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
    '🎧 Initializing Premium Music Bot...\n◉ ○ ○ ○',
    '🎶 Syncing Personal Account Bridge...\n◉ ◉ ○ ○',
    '✨ Preparing Live Audio Console...\n◉ ◉ ◉ ○',
  ],
  joinLive: (target: string) => [
    `🎧 Connecting to Voice Chat...\nTarget: ${target}\n◉ ○ ○ ○`,
    `🎤 Joining Live...\nVerifying Account Access...\n◉ ◉ ○ ○`,
    `🎵 Preparing Music & Opus Stream...\n◉ ◉ ◉ ○`,
  ],
  playMusic: (query: string) => [
    `🎵 Validating Music Source...\n${query}\n◉ ○ ○ ○`,
    `🎚️ Processing Audio via FFmpeg...\n◉ ◉ ○ ○`,
    `🔥 MUSIC STREAMING STARTED!\n◉ ◉ ◉ ◉`,
  ],
  reconnect: [
    '🔐 Verifying Encrypted MTProto Session...\n◉ ○ ○ ○',
    '📡 Handshaking with Telegram DC...\n◉ ◉ ○ ○',
    '✅ Personal Account Reconnected!\n◉ ◉ ◉ ◉',
  ],
};

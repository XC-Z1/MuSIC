import { editMessageText, sendChatAction, sendMessage, toSmallCaps, type InlineKeyboardMarkup } from './telegram';

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export const TELEGRAM_EFFECTS = {
  confetti: '5046509860389126442',
  fire: '5104841245755180586',
  heart: '5159385139981059251',
  thumbsUp: '5107584321108051014',
  thumbsDown: '5104858069142078462',
} as const;

export const EQUALIZER_PRESETS = {
  welcome: [
    '▁▂▃▄▅▆▇ ▰▱▱▱▱',
    '▁▂▃▄▅▆▇ ▰▱▱▱▱ → ▇▆▅▄▃▂▁ ▰▰▰▰▰',
  ],
  joinLive: [
    `${toSmallCaps('🎤 Connecting Voice Chat...')}\n▁▂▃▄▅▆▇  ▰▱▱▱▱`,
    `${toSmallCaps('🔊 Syncing Live Stream...')}\n▇▆▅▄▃▂▁  ▰▰▰▰▰`,
  ],
  playMusic: [
    `${toSmallCaps('🎵 Fetching Audio...')}\n▁▂▃▄▅▆▇  ▰▱▱▱▱`,
    `${toSmallCaps('🔥 Tuning FFmpeg Stream...')}\n▇▆▅▄▃▂▁  ▰▰▰▰▰`,
  ],
  volume: [
    `${toSmallCaps('🎚️ Opening Volume Control...')}\n▁▂▃▄▅▆▇  ▰▱▱▱▱`,
    `${toSmallCaps('🔥 Volume Range: 10% – 200%...')}\n▇▆▅▄▃▂▁  ▰▰▰▰▰`,
  ],
  searchMusic: [
    `${toSmallCaps('🔍 Searching Track...')}\n▁▂▃▄▅▆▇  ▰▱▱▱▱`,
    `${toSmallCaps('🔥 Matching Songs...')}\n▇▆▅▄▃▂▁  ▰▰▰▰▰`,
  ],
};

export async function sendEffectMessage(
  chatId: number | string,
  chatType: string,
  text: string,
  replyMarkup?: InlineKeyboardMarkup,
  effectId?: string,
  introFrames: string[] = [],
  delayMs = 240,
): Promise<number | null> {
  await sendChatAction(chatId, 'typing').catch(() => undefined);
  const useEffect = chatType === 'private' && effectId ? effectId : undefined;
  const frames = [...introFrames, text];
  const isSingle = frames.length === 1;

  const first = await sendMessage(
    chatId,
    frames[0],
    isSingle ? replyMarkup : undefined,
    useEffect,
  );
  const messageId = first?.result?.message_id ?? null;
  if (!messageId || isSingle) return messageId;

  for (let i = 1; i < frames.length; i++) {
    await sleep(delayMs);
    const isLast = i === frames.length - 1;
    await editMessageText(chatId, messageId, frames[i], isLast ? replyMarkup : undefined);
  }
  return messageId;
}

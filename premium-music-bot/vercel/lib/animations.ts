import { editMessageText, sendChatAction, sendMessage, toSmallCaps, type InlineKeyboardMarkup } from './telegram';

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export const TELEGRAM_EFFECTS = {
  confetti: '5046509860389126442',
  fire: '5104841245755180586',
  heart: '5159385139981059251',
  thumbsUp: '5107584321108051014',
  thumbsDown: '5104858069142078462',
} as const;

function makeEqualizerFrames(startLabel: string, endLabel: string): string[] {
  const s1 = toSmallCaps(startLabel);
  const s2 = toSmallCaps(endLabel);
  return [
    `${s1}\n▁▂▃▄▅▆▇  ▰▱▱▱▱`,
    `${s1}\n▂▄▆▇▆▄▂  ▰▰▱▱▱`,
    `${s1}\n▄▆▇▅▃▅▇  ▰▰▰▱▱`,
    `${s2}\n▆▇▅▃▂▄▆  ▰▰▰▰▱`,
    `${s2}\n▇▆▅▄▃▂▁  ▰▰▰▰▰`,
  ];
}

export const EQUALIZER_PRESETS = {
  welcome: makeEqualizerFrames('⚡ Booting Music Spam Bot...', '🎧 Syncing Live Controls...'),
  joinLive: makeEqualizerFrames('🎤 Connecting Voice Chat...', '🔊 Syncing Live Stream...'),
  playMusic: makeEqualizerFrames('🎵 Fetching Audio...', '🔥 Tuning FFmpeg Stream...'),
  volume: makeEqualizerFrames('🎚️ Opening Volume Control...', '🔥 Volume Range: 10% – 200%...'),
  searchMusic: makeEqualizerFrames('🔍 Searching Track...', '🔥 Matching Songs...'),
};

export async function sendEffectMessage(
  chatId: number | string,
  chatType: string,
  text: string,
  replyMarkup?: InlineKeyboardMarkup,
  effectId?: string,
  introFrames: string[] = [],
  delayMs = 150,
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

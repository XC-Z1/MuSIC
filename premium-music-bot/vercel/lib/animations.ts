import { sendChatAction, sendMessage, type InlineKeyboardMarkup } from './telegram';

export const TELEGRAM_EFFECTS = {
  confetti: '5046509860389126442',
  fire: '5104841245755180586',
  star: '5161554034041029689',
  thumbsUp: '5107584321108051014',
  heart: '5044134455711629726',
} as const;

export async function sendEffectMessage(
  chatId: number | string,
  chatType: string,
  text: string,
  replyMarkup?: InlineKeyboardMarkup,
  effectId?: string,
): Promise<number | null> {
  await sendChatAction(chatId, 'typing').catch(() => undefined);
  const useEffect = chatType === 'private' && effectId ? effectId : undefined;
  const res = await sendMessage(chatId, text, replyMarkup, useEffect);
  return res?.result?.message_id ?? null;
}

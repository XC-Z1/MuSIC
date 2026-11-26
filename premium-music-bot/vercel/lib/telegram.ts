export interface InlineKeyboardButton {
  text: string;
  callback_data?: string;
  url?: string;
}

export interface InlineKeyboardMarkup {
  inline_keyboard: InlineKeyboardButton[][];
}

interface TelegramApiResult {
  ok: boolean;
  result?: { message_id?: number };
  description?: string;
}

const SMALL_CAPS_MAP: Record<string, string> = {
  a: 'ᴀ', b: 'ʙ', c: 'ᴄ', d: 'ᴅ', e: 'ᴇ', f: 'ғ', g: 'ɢ', h: 'ʜ', i: 'ɪ',
  j: 'ᴊ', k: 'ᴋ', l: 'ʟ', m: 'ᴍ', n: 'ɴ', o: 'ᴏ', p: 'ᴘ', q: 'ǫ', r: 'ʀ',
  s: 's', t: 'ᴛ', u: 'ᴜ', v: 'ᴠ', w: 'ᴡ', x: 'x', y: 'ʏ', z: 'ᴢ',
};

export function toSmallCaps(input: string): string {
  return input
    .split(/(\s+)/)
    .map((token) => {
      if (!token || /^\s+$/.test(token)) return token;
      if (
        token.startsWith('/') ||
        token.startsWith('@') ||
        token.startsWith('http://') ||
        token.startsWith('https://') ||
        /^[A-Z0-9_]{3,}$/.test(token)
      ) {
        return token;
      }
      return Array.from(token)
        .map((ch) => SMALL_CAPS_MAP[ch.toLowerCase()] ?? ch)
        .join('');
    })
    .join('');
}

function getBotToken(): string {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) {
    throw new Error('TELEGRAM_BOT_TOKEN environment variable is missing.');
  }
  return token;
}

async function telegramRequest(method: string, body: Record<string, unknown>): Promise<TelegramApiResult> {
  const token = getBotToken();
  const res = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  return (await res.json()) as TelegramApiResult;
}

export function sendMessage(
  chatId: number | string,
  text: string,
  replyMarkup?: InlineKeyboardMarkup,
): Promise<TelegramApiResult> {
  return telegramRequest('sendMessage', {
    chat_id: chatId,
    text,
    disable_web_page_preview: true,
    ...(replyMarkup ? { reply_markup: replyMarkup } : {}),
  });
}

export function editMessageText(
  chatId: number | string,
  messageId: number,
  text: string,
  replyMarkup?: InlineKeyboardMarkup,
): Promise<TelegramApiResult> {
  return telegramRequest('editMessageText', {
    chat_id: chatId,
    message_id: messageId,
    text,
    disable_web_page_preview: true,
    ...(replyMarkup ? { reply_markup: replyMarkup } : {}),
  });
}

export function answerCallbackQuery(
  callbackQueryId: string,
  text?: string,
  showAlert = false,
): Promise<TelegramApiResult> {
  return telegramRequest('answerCallbackQuery', {
    callback_query_id: callbackQueryId,
    ...(text ? { text: toSmallCaps(text) } : {}),
    show_alert: showAlert,
  });
}

export const KEYBOARDS = {
  mainMenu: (): InlineKeyboardMarkup => ({
    inline_keyboard: [
      [
        { text: toSmallCaps('🎵 Play Music'), callback_data: 'menu:play' },
        { text: toSmallCaps('🎧 Music Player'), callback_data: 'menu:player' },
      ],
      [
        { text: toSmallCaps('🎤 Auto Live Join'), callback_data: 'menu:live' },
        { text: toSmallCaps('👤 Account Control'), callback_data: 'menu:account' },
      ],
      [
        { text: toSmallCaps('📊 Now Playing'), callback_data: 'menu:nowplaying' },
        { text: toSmallCaps('🎚️ Volume Control'), callback_data: 'menu:volume' },
      ],
      [
        { text: toSmallCaps('📚 Help & Commands'), callback_data: 'menu:help' },
        { text: toSmallCaps('👑 Bot Owner'), callback_data: 'menu:owner' },
      ],
    ],
  }),
  player: (isPlaying: boolean): InlineKeyboardMarkup => ({
    inline_keyboard: [
      [
        { text: toSmallCaps('⏮️ Prev'), callback_data: 'player:prev' },
        { text: toSmallCaps(isPlaying ? '⏸️ Pause' : '▶️ Resume'), callback_data: isPlaying ? 'player:pause' : 'player:resume' },
        { text: toSmallCaps('⏭️ Skip'), callback_data: 'player:skip' },
        { text: toSmallCaps('⏹️ Stop'), callback_data: 'player:stop' },
      ],
      [
        { text: toSmallCaps('🔁 Repeat'), callback_data: 'player:repeat' },
        { text: toSmallCaps('📚 Queue'), callback_data: 'menu:queue' },
      ],
      [
        { text: toSmallCaps('🎚️ Volume Control'), callback_data: 'menu:volume' },
        { text: toSmallCaps('🎤 Live Control'), callback_data: 'menu:live' },
      ],
      [{ text: toSmallCaps('🔙 Main Menu'), callback_data: 'menu:start' }],
    ],
  }),
  volume: (): InlineKeyboardMarkup => ({
    inline_keyboard: [
      [
        { text: '➖ 10%', callback_data: 'vol:-10' },
        { text: '➕ 10%', callback_data: 'vol:+10' },
      ],
      [
        { text: '➖ 20%', callback_data: 'vol:-20' },
        { text: '➕ 20%', callback_data: 'vol:+20' },
      ],
      [
        { text: toSmallCaps('🔇 Mute'), callback_data: 'vol:mute' },
        { text: toSmallCaps('🔊 Unmute'), callback_data: 'vol:unmute' },
      ],
      [{ text: toSmallCaps('🔙 Back To Player'), callback_data: 'menu:player' }],
    ],
  }),
  live: (): InlineKeyboardMarkup => ({
    inline_keyboard: [
      [
        { text: toSmallCaps('🎤 Join Live'), callback_data: 'live:join_hint' },
        { text: toSmallCaps('🚪 Leave Live'), callback_data: 'live:leave' },
      ],
      [
        { text: toSmallCaps('▶️ Play Music'), callback_data: 'menu:play' },
        { text: toSmallCaps('⏸️ Pause Music'), callback_data: 'player:pause' },
      ],
      [
        { text: toSmallCaps('▶️ Resume Music'), callback_data: 'player:resume' },
        { text: toSmallCaps('⏭️ Skip Music'), callback_data: 'player:skip' },
      ],
      [
        { text: toSmallCaps('⏹️ Stop Music'), callback_data: 'player:stop' },
        { text: toSmallCaps('📊 Live Status'), callback_data: 'menu:live' },
      ],
      [
        { text: toSmallCaps('🔊 Volume Up'), callback_data: 'vol:+10' },
        { text: toSmallCaps('🔉 Volume Down'), callback_data: 'vol:-10' },
      ],
      [
        { text: toSmallCaps('🔇 Mute'), callback_data: 'vol:mute' },
        { text: toSmallCaps('🔊 Unmute'), callback_data: 'vol:unmute' },
      ],
      [
        { text: toSmallCaps('🔄 Reconnect'), callback_data: 'account:reconnect' },
        { text: toSmallCaps('🔙 Main Menu'), callback_data: 'menu:start' },
      ],
    ],
  }),
  account: (): InlineKeyboardMarkup => ({
    inline_keyboard: [
      [
        { text: toSmallCaps('🔗 Connect'), callback_data: 'account:connect' },
        { text: toSmallCaps('🔌 Disconnect'), callback_data: 'account:disconnect' },
      ],
      [
        { text: toSmallCaps('🔄 Reconnect'), callback_data: 'account:reconnect' },
        { text: toSmallCaps('🔙 Main Menu'), callback_data: 'menu:start' },
      ],
    ],
  }),
};

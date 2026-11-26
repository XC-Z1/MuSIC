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
    ...(text ? { text } : {}),
    show_alert: showAlert,
  });
}

export const KEYBOARDS = {
  mainMenu: (): InlineKeyboardMarkup => ({
    inline_keyboard: [
      [
        { text: '🎵 Play Music', callback_data: 'menu:play' },
        { text: '🎧 Music Player', callback_data: 'menu:player' },
      ],
      [
        { text: '🎤 Auto Live Join', callback_data: 'menu:live' },
        { text: '👤 Account Control', callback_data: 'menu:account' },
      ],
      [
        { text: '📊 Now Playing', callback_data: 'menu:nowplaying' },
        { text: '🎚️ Volume Control', callback_data: 'menu:volume' },
      ],
      [
        { text: '📚 Help & Commands', callback_data: 'menu:help' },
        { text: '👑 Bot Owner', callback_data: 'menu:owner' },
      ],
    ],
  }),
  player: (isPlaying: boolean): InlineKeyboardMarkup => ({
    inline_keyboard: [
      [
        { text: '⏮️ Prev', callback_data: 'player:prev' },
        { text: isPlaying ? '⏸️ Pause' : '▶️ Resume', callback_data: isPlaying ? 'player:pause' : 'player:resume' },
        { text: '⏭️ Skip', callback_data: 'player:skip' },
        { text: '⏹️ Stop', callback_data: 'player:stop' },
      ],
      [
        { text: '🔁 Repeat', callback_data: 'player:repeat' },
        { text: '📚 Queue', callback_data: 'menu:queue' },
      ],
      [
        { text: '🎚️ Volume Control', callback_data: 'menu:volume' },
        { text: '🎤 Live Control', callback_data: 'menu:live' },
      ],
      [{ text: '🔙 Main Menu', callback_data: 'menu:start' }],
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
        { text: '🔇 MUTE', callback_data: 'vol:mute' },
        { text: '🔊 UNMUTE', callback_data: 'vol:unmute' },
      ],
      [{ text: '🔙 BACK TO PLAYER', callback_data: 'menu:player' }],
    ],
  }),
  live: (): InlineKeyboardMarkup => ({
    inline_keyboard: [
      [
        { text: '🎤 Join Live', callback_data: 'live:join_hint' },
        { text: '🚪 Leave Live', callback_data: 'live:leave' },
      ],
      [
        { text: '▶️ Play Music', callback_data: 'menu:play' },
        { text: '⏸️ Pause Music', callback_data: 'player:pause' },
      ],
      [
        { text: '▶️ Resume Music', callback_data: 'player:resume' },
        { text: '⏭️ Skip Music', callback_data: 'player:skip' },
      ],
      [
        { text: '⏹️ Stop Music', callback_data: 'player:stop' },
        { text: '📊 Live Status', callback_data: 'menu:live' },
      ],
      [
        { text: '🔊 Volume Up', callback_data: 'vol:+10' },
        { text: '🔉 Volume Down', callback_data: 'vol:-10' },
      ],
      [
        { text: '🔇 Mute', callback_data: 'vol:mute' },
        { text: '🔊 Unmute', callback_data: 'vol:unmute' },
      ],
      [
        { text: '🔄 Reconnect', callback_data: 'account:reconnect' },
        { text: '🔙 Main Menu', callback_data: 'menu:start' },
      ],
    ],
  }),
  account: (): InlineKeyboardMarkup => ({
    inline_keyboard: [
      [
        { text: '🔗 Connect', callback_data: 'account:connect' },
        { text: '🔌 Disconnect', callback_data: 'account:disconnect' },
      ],
      [
        { text: '🔄 Reconnect', callback_data: 'account:reconnect' },
        { text: '🔙 Main Menu', callback_data: 'menu:start' },
      ],
    ],
  }),
};

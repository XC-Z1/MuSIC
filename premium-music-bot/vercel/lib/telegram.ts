export interface InlineKeyboardButton {
  text: string;
  callback_data?: string;
  url?: string;
  style?: 'primary' | 'danger' | 'success';
}

export interface InlineKeyboardMarkup {
  inline_keyboard: InlineKeyboardButton[][];
}

export interface TelegramApiResult {
  ok: boolean;
  result?: any;
  description?: string;
}

export const DIVIDER = '━━━━━━━━━━━━━━━━━━━━';

const SMALL_CAPS_MAP: Record<string, string> = {
  a: 'ᴀ', b: 'ʙ', c: 'ᴄ', d: 'ᴅ', e: 'ᴇ', f: 'ғ', g: 'ɢ', h: 'ʜ', i: 'ɪ',
  j: 'ᴊ', k: 'ᴋ', l: 'ʟ', m: 'ᴍ', n: 'ɴ', o: 'ᴏ', p: 'ᴘ', q: 'ǫ', r: 'ʀ',
  s: 's', t: 'ᴛ', u: 'ᴜ', v: 'ᴠ', w: 'ᴡ', x: 'x', y: 'ʏ', z: 'ᴢ',
};

export function escapeHtml(input: string): string {
  return input
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

export function formatBangladeshDateTime(dateInput: Date | string | number = new Date()): {
  dateStr: string;
  timeStr: string;
  fullStr: string;
} {
  const date = dateInput instanceof Date ? dateInput : new Date(dateInput);
  const safeDate = Number.isNaN(date.getTime()) ? new Date() : date;
  const dateStr = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Dhaka',
    weekday: 'short',
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  }).format(safeDate);
  const timeStr = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Dhaka',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: true,
  }).format(safeDate);
  return { dateStr, timeStr, fullStr: `${dateStr} · ${timeStr} (BD)` };
}

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
        token.startsWith('tg://') ||
        /^[\d:./%+\-()[\]#]+$/.test(token) ||
        token === 'AES-256-GCM'
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

export async function telegramRequest(method: string, body: Record<string, unknown>): Promise<TelegramApiResult> {
  const token = getBotToken();
  const res = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  return (await res.json()) as TelegramApiResult;
}

export function sendChatAction(
  chatId: number | string,
  action: 'typing' | 'record_voice' | 'upload_voice' = 'typing',
): Promise<TelegramApiResult> {
  return telegramRequest('sendChatAction', { chat_id: chatId, action });
}

export async function sendMessage(
  chatId: number | string,
  text: string,
  replyMarkup?: InlineKeyboardMarkup,
  messageEffectId?: string,
): Promise<TelegramApiResult> {
  const basePayload: Record<string, unknown> = {
    chat_id: chatId,
    text,
    parse_mode: 'HTML',
    disable_web_page_preview: true,
    ...(replyMarkup ? { reply_markup: replyMarkup } : {}),
  };
  let res = await telegramRequest(
    'sendMessage',
    messageEffectId ? { ...basePayload, message_effect_id: messageEffectId } : basePayload,
  );
  if (!res.ok && messageEffectId) {
    res = await telegramRequest('sendMessage', basePayload);
  }
  if (!res.ok) {
    res = await telegramRequest('sendMessage', {
      ...basePayload,
      parse_mode: undefined,
      text: text.replace(/<[^>]+>/g, ''),
    });
  }
  return res;
}

export async function sendPhoto(
  chatId: number | string,
  photo: string,
  caption: string,
  replyMarkup?: InlineKeyboardMarkup,
): Promise<TelegramApiResult> {
  return telegramRequest('sendPhoto', {
    chat_id: chatId,
    photo,
    caption,
    parse_mode: 'HTML',
    ...(replyMarkup ? { reply_markup: replyMarkup } : {}),
  });
}

export async function editMessageText(
  chatId: number | string,
  messageId: number,
  text: string,
  replyMarkup?: InlineKeyboardMarkup,
): Promise<TelegramApiResult> {
  const res = await telegramRequest('editMessageText', {
    chat_id: chatId,
    message_id: messageId,
    text,
    parse_mode: 'HTML',
    disable_web_page_preview: true,
    ...(replyMarkup ? { reply_markup: replyMarkup } : {}),
  });
  if (!res.ok) {
    return telegramRequest('editMessageText', {
      chat_id: chatId,
      message_id: messageId,
      text: text.replace(/<[^>]+>/g, ''),
      disable_web_page_preview: true,
      ...(replyMarkup ? { reply_markup: replyMarkup } : {}),
    });
  }
  return res;
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
  mainMenu: (isAdmin = false): InlineKeyboardMarkup => {
    const rows: InlineKeyboardButton[][] = [
      [
        { text: toSmallCaps('🎵 Play Music'), callback_data: 'menu:play', style: 'success' },
        { text: toSmallCaps('🎧 Music Player'), callback_data: 'menu:player', style: 'primary' },
      ],
      [
        { text: toSmallCaps('🎤 Auto Live Join'), callback_data: 'menu:live', style: 'success' },
        { text: toSmallCaps('👤 Account Control'), callback_data: 'menu:account', style: 'primary' },
      ],
      [
        { text: toSmallCaps('📊 Now Playing'), callback_data: 'menu:nowplaying', style: 'primary' },
        { text: toSmallCaps('🎚️ Volume Control'), callback_data: 'menu:volume', style: 'primary' },
      ],
    ];
    if (isAdmin) {
      rows.push([
        { text: toSmallCaps('📚 Help & Commands'), callback_data: 'menu:help', style: 'primary' },
        { text: toSmallCaps('👑 Bot Owner'), callback_data: 'menu:owner', style: 'primary' },
      ]);
    } else {
      rows.push([{ text: toSmallCaps('📚 Help & Commands'), callback_data: 'menu:help', style: 'primary' }]);
    }
    return { inline_keyboard: rows };
  },
  adminPanel: (maintenanceMode: boolean): InlineKeyboardMarkup => ({
    inline_keyboard: [
      [
        {
          text: toSmallCaps(maintenanceMode ? '🟢 Turn Bot ON' : '🔴 Turn Bot OFF (Maint.)'),
          callback_data: 'admin:toggle_maintenance',
          style: maintenanceMode ? 'success' : 'danger',
        },
        { text: toSmallCaps('📊 System Status'), callback_data: 'menu:owner', style: 'primary' },
      ],
      [
        { text: toSmallCaps('👥 Users & Blocklist'), callback_data: 'admin:users:0', style: 'primary' },
        { text: toSmallCaps('📢 Broadcast'), callback_data: 'admin:broadcast_prompt', style: 'success' },
      ],
      [
        { text: toSmallCaps('🔍 Check User'), callback_data: 'admin:lookup_prompt', style: 'primary' },
        { text: toSmallCaps('👤 Account Control'), callback_data: 'menu:account', style: 'primary' },
      ],
      [{ text: toSmallCaps('🔙 Main Menu'), callback_data: 'menu:start', style: 'primary' }],
    ],
  }),
  player: (isPlaying: boolean): InlineKeyboardMarkup => ({
    inline_keyboard: [
      [
        { text: toSmallCaps('⏮️ Prev'), callback_data: 'player:prev', style: 'primary' },
        {
          text: toSmallCaps(isPlaying ? '⏸️ Pause' : '▶️ Resume'),
          callback_data: isPlaying ? 'player:pause' : 'player:resume',
          style: isPlaying ? 'primary' : 'success',
        },
        { text: toSmallCaps('⏭️ Skip'), callback_data: 'player:skip', style: 'primary' },
        { text: toSmallCaps('⏹️ Stop'), callback_data: 'player:stop', style: 'danger' },
      ],
      [
        { text: toSmallCaps('🔁 Repeat'), callback_data: 'player:repeat', style: 'primary' },
        { text: toSmallCaps('📚 Queue'), callback_data: 'menu:queue', style: 'primary' },
      ],
      [
        { text: toSmallCaps('🎚️ Volume Control'), callback_data: 'menu:volume', style: 'primary' },
        { text: toSmallCaps('🎤 Live Control'), callback_data: 'menu:live', style: 'success' },
      ],
      [{ text: toSmallCaps('🔙 Main Menu'), callback_data: 'menu:start', style: 'primary' }],
    ],
  }),
  volume: (): InlineKeyboardMarkup => ({
    inline_keyboard: [
      [
        { text: '➖ 10%', callback_data: 'vol:-10', style: 'danger' },
        { text: '➕ 10%', callback_data: 'vol:+10', style: 'success' },
      ],
      [
        { text: '➖ 20%', callback_data: 'vol:-20', style: 'danger' },
        { text: '➕ 20%', callback_data: 'vol:+20', style: 'success' },
      ],
      [
        { text: '🔊 100%', callback_data: 'vol:100', style: 'primary' },
        { text: '🔥 150%', callback_data: 'vol:150', style: 'success' },
        { text: '🚀 200%', callback_data: 'vol:200', style: 'success' },
      ],
      [
        { text: toSmallCaps('🔇 Mute'), callback_data: 'vol:mute', style: 'danger' },
        { text: toSmallCaps('🔊 Unmute'), callback_data: 'vol:unmute', style: 'success' },
      ],
      [{ text: toSmallCaps('🔙 Back To Player'), callback_data: 'menu:player', style: 'primary' }],
    ],
  }),
  live: (): InlineKeyboardMarkup => ({
    inline_keyboard: [
      [
        { text: toSmallCaps('🎤 Join Live'), callback_data: 'live:join_hint', style: 'success' },
        { text: toSmallCaps('🚪 Leave Live'), callback_data: 'live:leave', style: 'danger' },
      ],
      [
        { text: toSmallCaps('▶️ Play Music'), callback_data: 'menu:play', style: 'success' },
        { text: toSmallCaps('⏸️ Pause Music'), callback_data: 'player:pause', style: 'primary' },
      ],
      [
        { text: toSmallCaps('▶️ Resume Music'), callback_data: 'player:resume', style: 'success' },
        { text: toSmallCaps('⏭️ Skip Music'), callback_data: 'player:skip', style: 'primary' },
      ],
      [
        { text: toSmallCaps('⏹️ Stop Music'), callback_data: 'player:stop', style: 'danger' },
        { text: toSmallCaps('📊 Live Status'), callback_data: 'menu:live', style: 'primary' },
      ],
      [
        { text: toSmallCaps('🔊 Volume Up'), callback_data: 'vol:+10', style: 'success' },
        { text: toSmallCaps('🔉 Volume Down'), callback_data: 'vol:-10', style: 'danger' },
      ],
      [
        { text: toSmallCaps('🔇 Mute'), callback_data: 'vol:mute', style: 'danger' },
        { text: toSmallCaps('🔊 Unmute'), callback_data: 'vol:unmute', style: 'success' },
      ],
      [
        { text: toSmallCaps('🔄 Reconnect'), callback_data: 'account:reconnect', style: 'primary' },
        { text: toSmallCaps('🔙 Main Menu'), callback_data: 'menu:start', style: 'primary' },
      ],
    ],
  }),
  account: (): InlineKeyboardMarkup => ({
    inline_keyboard: [
      [
        { text: toSmallCaps('🔗 Connect'), callback_data: 'account:connect', style: 'success' },
        { text: toSmallCaps('🔌 Disconnect'), callback_data: 'account:disconnect', style: 'danger' },
      ],
      [
        { text: toSmallCaps('🔄 Reconnect'), callback_data: 'account:reconnect', style: 'primary' },
        { text: toSmallCaps('🔙 Main Menu'), callback_data: 'menu:start', style: 'primary' },
      ],
    ],
  }),
};

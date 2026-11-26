import crypto from 'node:crypto';
import type { IncomingMessage, ServerResponse } from 'node:http';

interface VercelReq extends IncomingMessage {
  body?: unknown;
  query?: Record<string, string | string[]>;
}

interface VercelRes extends ServerResponse {
  status: (code: number) => VercelRes;
  json: (data: unknown) => void;
}

interface InlineButton {
  text: string;
  callback_data?: string;
  style?: 'primary' | 'danger' | 'success';
}

interface InlineMarkup {
  inline_keyboard: InlineButton[][];
}

const TELEGRAM_EFFECTS = {
  confetti: '5046509860389126442',
  fire: '5104841245755180586',
  heart: '5159385139981059251',
  thumbsUp: '5107584321108051014',
  thumbsDown: '5104858069142078462',
} as const;

interface TelegramUser {
  id: number;
  username?: string;
  first_name?: string;
  last_name?: string;
}

interface TelegramUpdate {
  message?: {
    message_id: number;
    chat: { id: number; type: string; title?: string };
    from?: TelegramUser;
    text?: string;
    audio?: { file_id: string; title?: string; performer?: string; duration?: number };
    voice?: { file_id: string; duration?: number };
    document?: { file_id: string; file_name?: string; mime_type?: string };
  };
  callback_query?: {
    id: string;
    from: TelegramUser;
    message?: { message_id: number; chat: { id: number; type?: string }; text?: string };
    data?: string;
  };
}

interface StoredUser {
  user_id: number;
  chat_id: number;
  first_name: string;
  last_name: string;
  username: string;
  is_blocked: boolean;
  plays_count: number;
  joined_at: string;
  last_seen_at: string;
}

interface BotConfigState {
  maintenance_mode: boolean;
  claimed_owner_id: number | null;
  total_users: number;
  active_users: number;
  blocked_users: number;
  total_plays: number;
}

const chatVolumeFallback = new Map<string, { volume: number; muted: boolean; previousVolume: number }>();
const pendingAdminInput = new Map<number, 'broadcast' | 'lookup'>();

const fallbackUsers = new Map<number, StoredUser>();
const fallbackConfig: BotConfigState = {
  maintenance_mode: false,
  claimed_owner_id: null,
  total_users: 0,
  active_users: 0,
  blocked_users: 0,
  total_plays: 0,
};

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

function escapeHtml(input: string): string {
  return input
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function formatBangladeshDateTime(dateInput: Date | string | number = new Date()): {
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

function clampVol(val: number): number {
  if (!Number.isFinite(val)) return 80;
  return Math.min(200, Math.max(10, Math.round(val)));
}

function parseVolumeFromText(text?: string): { volume: number; muted: boolean } {
  if (!text) return { volume: 80, muted: false };
  if (/ᴍᴜᴛᴇᴅ|MUTED/i.test(text)) return { volume: 80, muted: true };
  const match = text.match(/(\d{1,3})\s*%/);
  return match ? { volume: clampVol(Number(match[1])), muted: false } : { volume: 80, muted: false };
}

function applyFallbackVolume(
  chatId: number | string,
  op: string,
  messageText?: string,
): { volume: number; muted: boolean } {
  const key = String(chatId);
  const parsed = parseVolumeFromText(messageText);
  const prevState = chatVolumeFallback.get(key) ?? {
    volume: parsed.volume,
    muted: parsed.muted,
    previousVolume: parsed.volume,
  };
  const next = { ...prevState };
  if (op === 'mute') {
    if (!next.muted) next.previousVolume = next.volume;
    next.muted = true;
  } else if (op === 'unmute') {
    next.muted = false;
    next.volume = clampVol(next.previousVolume || next.volume || 80);
  } else if (/^[+-]\d+$/.test(op)) {
    next.muted = false;
    next.volume = clampVol(next.volume + Number(op));
    next.previousVolume = next.volume;
  } else if (/^\d+$/.test(op)) {
    next.muted = false;
    next.volume = clampVol(Number(op));
    next.previousVolume = next.volume;
  }
  chatVolumeFallback.set(key, next);
  return { volume: next.volume, muted: next.muted };
}

const SMALL_CAPS_MAP: Record<string, string> = {
  a: 'ᴀ', b: 'ʙ', c: 'ᴄ', d: 'ᴅ', e: 'ᴇ', f: 'ғ', g: 'ɢ', h: 'ʜ', i: 'ɪ',
  j: 'ᴊ', k: 'ᴋ', l: 'ʟ', m: 'ᴍ', n: 'ɴ', o: 'ᴏ', p: 'ᴘ', q: 'ǫ', r: 'ʀ',
  s: 's', t: 'ᴛ', u: 'ᴜ', v: 'ᴠ', w: 'ᴡ', x: 'x', y: 'ʏ', z: 'ᴢ',
};

function sc(input: string): string {
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

function getEnvAdminIds(): number[] {
  const raw = [process.env.TELEGRAM_OWNER_ID || '', process.env.TELEGRAM_ADMIN_IDS || '']
    .join(',')
    .split(/[\s,]+/)
    .map((v) => v.trim())
    .filter((v) => /^\d+$/.test(v))
    .map((v) => Number(v));
  return Array.from(new Set(raw));
}

function getAllAdminIds(claimedOwnerId?: number | null): number[] {
  const ids = getEnvAdminIds();
  if (claimedOwnerId && Number.isFinite(claimedOwnerId)) {
    ids.push(claimedOwnerId);
  }
  return Array.from(new Set(ids));
}

function isUserAdmin(userId?: number, claimedOwnerId?: number | null): boolean {
  if (!userId) return false;
  return getAllAdminIds(claimedOwnerId).includes(userId);
}

function displayNameOf(u?: { first_name?: string; last_name?: string; username?: string }): string {
  if (!u) return 'Music Lover';
  const full = `${u.first_name || ''} ${u.last_name || ''}`.trim();
  return full || (u.username ? `@${u.username.replace(/^@/, '')}` : 'Music Lover');
}

function buildWelcomeText(options: {
  user?: TelegramUser;
  isAdmin: boolean;
  hasWorker: boolean;
  maintenanceMode: boolean;
}): string {
  const lines = [
    sc('🎧 Welcome To Music Spam Bot'),
    '',
    sc('🎶 Your Music, Your World!'),
    sc('✨ Premium Music Experience'),
    sc('⚡ Ultra Fast Performance'),
    sc('🎚️ Advanced Music Controls'),
    sc('🎤 Auto Live Join System'),
    sc('🎧 Personal Account Control'),
    sc('🔥 Smart Music Streaming'),
  ];
  if (options.isAdmin && options.maintenanceMode) {
    lines.push('', sc('⚠️ Maintenance Mode: Active (Bot OFF for users)'));
  }
  return lines.join('\n');
}

function buildMaintenanceText(user?: TelegramUser): string {
  const name = escapeHtml(displayNameOf(user));
  const bd = formatBangladeshDateTime();
  return [
    sc('🛠️ Bot Maintenance Mode'),
    '',
    `${sc('👋 Hello,')} ${name}!`,
    sc('🚦 Status: Offline (Scheduled Maintenance)'),
    `${sc('📅 Date (BD):')} ${bd.dateStr}`,
    `${sc('🕒 Time (BD 12h):')} ${bd.timeStr}`,
    '',
    sc('✨ Service will resume shortly. Please check again soon!'),
  ].join('\n');
}

function buildHelpText(): string {
  return sc(
    [
      '📚 Command Reference',
      '',
      '🎵 Music & Playback:',
      '/search <song> · /play <song|url>',
      'Or forward any MP3 / Audio / Voice / YouTube link!',
      '/pause · /resume · /skip · /stop · /queue · /nowplaying',
      '/volume <10-200> · /mute · /unmute',
      '',
      '🎤 Live & Personal Account:',
      '/joinlive <t.me link> · /leavelive · /live',
      '/account · /connect · /disconnect · /reconnect',
    ].join('\n'),
  );
}

function mainKeyboard(isAdmin = false): InlineMarkup {
  const rows: InlineButton[][] = [
    [
      { text: sc('🎵 Play Music'), callback_data: 'menu:play', style: 'success' },
      { text: sc('🎧 Music Player'), callback_data: 'menu:player', style: 'primary' },
    ],
    [
      { text: sc('🎤 Auto Live Join'), callback_data: 'menu:live', style: 'success' },
      { text: sc('👤 Account Control'), callback_data: 'menu:account', style: 'primary' },
    ],
    [
      { text: sc('📊 Now Playing'), callback_data: 'menu:nowplaying', style: 'primary' },
      { text: sc('🎚️ Volume Control'), callback_data: 'menu:volume', style: 'primary' },
    ],
  ];
  if (isAdmin) {
    rows.push([
      { text: sc('📚 Help & Commands'), callback_data: 'menu:help', style: 'primary' },
      { text: sc('👑 Bot Owner'), callback_data: 'menu:owner', style: 'primary' },
    ]);
  } else {
    rows.push([{ text: sc('📚 Help & Commands'), callback_data: 'menu:help', style: 'primary' }]);
  }
  return { inline_keyboard: rows };
}

function makeEqualizerFrames(startLabel: string, endLabel: string): string[] {
  const s1 = sc(startLabel);
  const s2 = sc(endLabel);
  return [
    `${s1}\n▁▂▃▄▅▆▇  ▰▱▱▱▱`,
    `${s1}\n▂▄▆▇▆▄▂  ▰▰▱▱▱`,
    `${s1}\n▄▆▇▅▃▅▇  ▰▰▰▱▱`,
    `${s2}\n▆▇▅▃▂▄▆  ▰▰▰▰▱`,
    `${s2}\n▇▆▅▄▃▂▁  ▰▰▰▰▰`,
  ];
}

const PLAY_INTRO_FRAMES = [sc('🎵 Fetching Audio...'), sc('🔥 Tuning FFmpeg Stream...')];

function playerKeyboard(isPlaying = true): InlineMarkup {
  return {
    inline_keyboard: [
      [
        { text: sc('⏮️ Prev'), callback_data: 'player:prev', style: 'primary' },
        {
          text: sc(isPlaying ? '⏸️ Pause' : '▶️ Resume'),
          callback_data: isPlaying ? 'player:pause' : 'player:resume',
          style: isPlaying ? 'primary' : 'success',
        },
        { text: sc('⏭️ Skip'), callback_data: 'player:skip', style: 'primary' },
        { text: sc('⏹️ Stop'), callback_data: 'player:stop', style: 'danger' },
      ],
      [
        { text: sc('🔁 Repeat'), callback_data: 'player:repeat', style: 'primary' },
        { text: sc('📚 Queue'), callback_data: 'menu:queue', style: 'primary' },
      ],
      [
        { text: sc('🎚️ Volume Control'), callback_data: 'menu:volume', style: 'primary' },
        { text: sc('🎤 Live Control'), callback_data: 'menu:live', style: 'success' },
      ],
      [{ text: sc('🔙 Main Menu'), callback_data: 'menu:start', style: 'primary' }],
    ],
  };
}

function volumeKeyboard(): InlineMarkup {
  return {
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
        { text: sc('🔇 Mute'), callback_data: 'vol:mute', style: 'danger' },
        { text: sc('🔊 Unmute'), callback_data: 'vol:unmute', style: 'success' },
      ],
      [{ text: sc('🔙 Back To Player'), callback_data: 'menu:player', style: 'primary' }],
    ],
  };
}

function liveKeyboard(): InlineMarkup {
  return {
    inline_keyboard: [
      [
        { text: sc('🎤 Join Live'), callback_data: 'live:join_hint', style: 'success' },
        { text: sc('🚪 Leave Live'), callback_data: 'live:leave', style: 'danger' },
      ],
      [
        { text: sc('▶️ Play Music'), callback_data: 'menu:play', style: 'success' },
        { text: sc('⏸️ Pause Music'), callback_data: 'player:pause', style: 'primary' },
      ],
      [
        { text: sc('▶️ Resume Music'), callback_data: 'player:resume', style: 'success' },
        { text: sc('⏭️ Skip Music'), callback_data: 'player:skip', style: 'primary' },
      ],
      [
        { text: sc('⏹️ Stop Music'), callback_data: 'player:stop', style: 'danger' },
        { text: sc('📊 Live Status'), callback_data: 'menu:live', style: 'primary' },
      ],
      [
        { text: sc('🔊 Volume +10%'), callback_data: 'vol:+10', style: 'success' },
        { text: sc('🔉 Volume -10%'), callback_data: 'vol:-10', style: 'danger' },
      ],
      [
        { text: sc('🔇 Mute'), callback_data: 'vol:mute', style: 'danger' },
        { text: sc('🔊 Unmute'), callback_data: 'vol:unmute', style: 'success' },
      ],
      [
        { text: sc('🔄 Reconnect'), callback_data: 'account:reconnect', style: 'primary' },
        { text: sc('🔙 Main Menu'), callback_data: 'menu:start', style: 'primary' },
      ],
    ],
  };
}

function accountKeyboard(): InlineMarkup {
  return {
    inline_keyboard: [
      [
        { text: sc('🔗 Connect'), callback_data: 'account:connect', style: 'success' },
        { text: sc('🔌 Disconnect'), callback_data: 'account:disconnect', style: 'danger' },
      ],
      [
        { text: sc('🔄 Reconnect'), callback_data: 'account:reconnect', style: 'primary' },
        { text: sc('🎤 Live Control'), callback_data: 'menu:live', style: 'success' },
      ],
      [{ text: sc('🔙 Main Menu'), callback_data: 'menu:start', style: 'primary' }],
    ],
  };
}

function playGuideKeyboard(): InlineMarkup {
  return {
    inline_keyboard: [
      [
        { text: sc('🔍 How To Search Song'), callback_data: 'play:search_hint', style: 'primary' },
        { text: sc('📁 Send MP3 / Link'), callback_data: 'play:url_hint', style: 'success' },
      ],
      [
        { text: sc('🎧 Music Player'), callback_data: 'menu:player', style: 'primary' },
        { text: sc('🎤 Live Control'), callback_data: 'menu:live', style: 'success' },
      ],
      [{ text: sc('🔙 Main Menu'), callback_data: 'menu:start', style: 'primary' }],
    ],
  };
}

function adminPanelKeyboard(maintenanceMode: boolean): InlineMarkup {
  return {
    inline_keyboard: [
      [
        {
          text: sc(maintenanceMode ? '🟢 Turn Bot ON' : '🔴 Turn Bot OFF (Maint.)'),
          callback_data: 'admin:toggle_maintenance',
          style: maintenanceMode ? 'success' : 'danger',
        },
        { text: sc('📊 System Status'), callback_data: 'menu:owner', style: 'primary' },
      ],
      [
        { text: sc('👥 Users & Blocklist'), callback_data: 'admin:users:0', style: 'primary' },
        { text: sc('📢 Broadcast'), callback_data: 'admin:broadcast_prompt', style: 'success' },
      ],
      [
        { text: sc('🔍 Check User'), callback_data: 'admin:lookup_prompt', style: 'primary' },
        { text: sc('👤 Account Control'), callback_data: 'menu:account', style: 'primary' },
      ],
      [{ text: sc('🔙 Main Menu'), callback_data: 'menu:start', style: 'primary' }],
    ],
  };
}

function getWorkerDiagnosticText(actionLabel?: string): string {
  const hasApiCreds = Boolean(
    (process.env.TELEGRAM_API_ID || process.env.API_ID) &&
    (process.env.TELEGRAM_API_HASH || process.env.API_HASH),
  );
  const hasWorker = Boolean(process.env.AUDIO_BACKEND_URL && process.env.AUDIO_BACKEND_API_SECRET);
  return [
    actionLabel ? sc(`⚡ ${actionLabel}`) : '',
    `${sc('🤖 Bot Webhook:')} ${sc('✅ Online (Vercel)')}`,
    `${sc('🔑 API ID / Hash:')} ${hasApiCreds ? sc('✅ Found') : sc('⚪ Add in Vercel & Redeploy')}`,
    `${sc('🖥️ Audio Worker:')} ${hasWorker ? sc('✅ Linked') : sc('❌ Not Linked Yet')}`,
    '',
    hasWorker
      ? sc('Audio Worker is linked! Open https://<your-worker-url>/setup in Chrome if you still need OTP login, or tap Connect.')
      : [
          sc('ℹ️ Free Docker Audio Worker Setup (No VPS needed):'),
          sc('1️⃣ Deploy premium-music-bot/backend on Hugging Face Spaces (Docker) / Render / Koyeb'),
          sc('2️⃣ Set TELEGRAM_API_ID, TELEGRAM_API_HASH, TELEGRAM_BOT_TOKEN & AUDIO_BACKEND_API_SECRET'),
          sc('3️⃣ Open https://<your-worker-url>/setup in Chrome on your phone to sign in with OTP'),
          sc('4️⃣ Add AUDIO_BACKEND_URL & AUDIO_BACKEND_API_SECRET to Vercel & Redeploy.'),
        ].join('\n'),
  ]
    .filter((v) => v !== '')
    .join('\n');
}

function isMediaUrl(text: string): boolean {
  const lower = text.toLowerCase();
  if (!lower.startsWith('http://') && !lower.startsWith('https://')) return false;
  if (lower.includes('t.me/') || lower.includes('telegram.me/')) return false;
  return (
    lower.includes('youtube.com/') ||
    lower.includes('youtu.be/') ||
    lower.includes('soundcloud.com/') ||
    /\.(mp3|m4a|ogg|wav|flac|aac)(\?|$)/i.test(lower)
  );
}

async function tgCall(
  token: string,
  method: string,
  payload: Record<string, unknown>,
): Promise<{ ok: boolean; result?: any }> {
  const res = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  return (await res.json()) as { ok: boolean; result?: any };
}

async function editHtmlMessage(
  token: string,
  chatId: number | string,
  messageId: number,
  text: string,
  replyMarkup?: InlineMarkup,
): Promise<void> {
  const payload: Record<string, unknown> = {
    chat_id: chatId,
    message_id: messageId,
    text,
    parse_mode: 'HTML',
    disable_web_page_preview: true,
    ...(replyMarkup ? { reply_markup: replyMarkup } : {}),
  };
  const res = await tgCall(token, 'editMessageText', payload);
  if (!res.ok) {
    await tgCall(token, 'editMessageText', {
      chat_id: chatId,
      message_id: messageId,
      text: text.replace(/<[^>]+>/g, ''),
      disable_web_page_preview: true,
      ...(replyMarkup ? { reply_markup: replyMarkup } : {}),
    });
  }
}

async function sendEffectMessage(
  token: string,
  chatId: number | string,
  chatType: string,
  text: string,
  replyMarkup?: InlineMarkup,
  effectId?: string,
  introFrames: string[] = [],
  delayMs = 160,
): Promise<void> {
  await tgCall(token, 'sendChatAction', { chat_id: chatId, action: 'typing' }).catch(() => undefined);
  const useEffect = chatType === 'private' && Boolean(effectId);
  const frames = [...introFrames, text];
  const isSingle = frames.length === 1;

  const firstPayload: Record<string, unknown> = {
    chat_id: chatId,
    text: frames[0],
    parse_mode: 'HTML',
    disable_web_page_preview: true,
    ...(isSingle && replyMarkup ? { reply_markup: replyMarkup } : {}),
  };

  let res = await tgCall(
    token,
    'sendMessage',
    useEffect ? { ...firstPayload, message_effect_id: effectId } : firstPayload,
  );
  if (!res.ok && useEffect) {
    res = await tgCall(token, 'sendMessage', firstPayload);
  }
  if (!res.ok) {
    res = await tgCall(token, 'sendMessage', {
      ...firstPayload,
      parse_mode: undefined,
      text: frames[0].replace(/<[^>]+>/g, ''),
    });
  }

  const msgId = res.result?.message_id as number | undefined;
  if (!msgId || isSingle) return;

  for (let i = 1; i < frames.length; i++) {
    await sleep(delayMs);
    const isLast = i === frames.length - 1;
    await editHtmlMessage(token, chatId, msgId, frames[i], isLast ? replyMarkup : undefined);
  }
}

async function callAudioBackend(
  endpoint: string,
  payload: Record<string, unknown> = {},
  method: 'GET' | 'POST' = 'POST',
): Promise<{ ok: boolean; configured: boolean; data?: Record<string, unknown>; error?: string }> {
  const baseUrl = (process.env.AUDIO_BACKEND_URL || '').replace(/\/+$/, '');
  const secret = process.env.AUDIO_BACKEND_API_SECRET || '';
  if (!baseUrl || !secret) {
    return {
      ok: false,
      configured: false,
      error: 'Audio Worker not linked yet (set AUDIO_BACKEND_URL and AUDIO_BACKEND_API_SECRET).',
    };
  }

  const ts = Math.floor(Date.now() / 1000);
  const body = method === 'GET' ? '' : JSON.stringify(payload);
  const sig = crypto.createHmac('sha256', secret).update(`${ts}.${body}`).digest('hex');

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);
  try {
    const res = await fetch(`${baseUrl}${endpoint}`, {
      method,
      headers: {
        'Content-Type': 'application/json',
        'X-API-Secret': secret,
        'X-Timestamp': String(ts),
        'X-Signature': sig,
      },
      body: method === 'GET' ? undefined : body,
      signal: controller.signal,
    });
    const json = (await res.json()) as Record<string, unknown>;
    if (!res.ok) {
      return {
        ok: false,
        configured: true,
        error: typeof json.detail === 'string' ? json.detail : `Audio backend HTTP ${res.status}`,
      };
    }
    return { ok: true, configured: true, data: json };
  } catch {
    return { ok: false, configured: true, error: 'Streaming Backend Offline' };
  } finally {
    clearTimeout(timeout);
  }
}

function refreshFallbackCounts(): BotConfigState {
  const total = fallbackUsers.size;
  let blocked = 0;
  for (const u of fallbackUsers.values()) {
    if (u.is_blocked) blocked += 1;
  }
  fallbackConfig.total_users = total;
  fallbackConfig.blocked_users = blocked;
  fallbackConfig.active_users = Math.max(0, total - blocked);
  return { ...fallbackConfig };
}

async function trackUserState(
  user: TelegramUser,
  chatId: number,
): Promise<{
  is_new: boolean;
  is_blocked: boolean;
  user: StoredUser;
} & BotConfigState> {
  const remote = await callAudioBackend('/bot/track-user', {
    user_id: user.id,
    chat_id: chatId,
    first_name: user.first_name || '',
    last_name: user.last_name || '',
    username: user.username || '',
  });
  if (remote.ok && remote.data) {
    return remote.data as unknown as {
      is_new: boolean;
      is_blocked: boolean;
      user: StoredUser;
    } & BotConfigState;
  }

  const now = new Date().toISOString();
  const existing = fallbackUsers.get(user.id);
  const isNew = !existing;
  const record: StoredUser = existing
    ? {
        ...existing,
        chat_id: chatId,
        first_name: user.first_name || existing.first_name,
        last_name: user.last_name || existing.last_name,
        username: (user.username || existing.username).replace(/^@/, ''),
        last_seen_at: now,
      }
    : {
        user_id: user.id,
        chat_id: chatId,
        first_name: user.first_name || '',
        last_name: user.last_name || '',
        username: (user.username || '').replace(/^@/, ''),
        is_blocked: false,
        plays_count: 0,
        joined_at: now,
        last_seen_at: now,
      };
  fallbackUsers.set(user.id, record);
  const cfg = refreshFallbackCounts();
  return { is_new: isNew, is_blocked: record.is_blocked, user: record, ...cfg };
}

async function getBotConfig(): Promise<BotConfigState> {
  const remote = await callAudioBackend('/bot/config', {}, 'GET');
  if (remote.ok && remote.data) {
    return remote.data as unknown as BotConfigState;
  }
  return refreshFallbackCounts();
}

async function setMaintenanceMode(enabled: boolean): Promise<BotConfigState> {
  const remote = await callAudioBackend('/bot/admin/maintenance', { enabled });
  if (remote.ok && remote.data) {
    return remote.data as unknown as BotConfigState;
  }
  fallbackConfig.maintenance_mode = enabled;
  return refreshFallbackCounts();
}

async function listBotUsers(page = 0, limit = 5): Promise<{ users: StoredUser[]; page: number } & BotConfigState> {
  const remote = await callAudioBackend(`/bot/admin/users?page=${page}&limit=${limit}`, {}, 'GET');
  if (remote.ok && remote.data) {
    return remote.data as unknown as { users: StoredUser[]; page: number } & BotConfigState;
  }
  const all = Array.from(fallbackUsers.values()).sort((a, b) => b.joined_at.localeCompare(a.joined_at));
  const slice = all.slice(page * limit, page * limit + limit);
  return { users: slice, page, ...refreshFallbackCounts() };
}

async function getBotUser(userId: number): Promise<StoredUser | null> {
  const remote = await callAudioBackend(`/bot/admin/user/${userId}`, {}, 'GET');
  if (remote.ok && remote.data?.user) {
    return remote.data.user as StoredUser;
  }
  return fallbackUsers.get(userId) ?? null;
}

async function setBotUserBlocked(userId: number, blocked: boolean): Promise<StoredUser | null> {
  const remote = await callAudioBackend('/bot/admin/block', { user_id: userId, blocked });
  if (remote.ok && remote.data?.user) {
    return remote.data.user as StoredUser;
  }
  const existing = fallbackUsers.get(userId);
  if (!existing) return null;
  existing.is_blocked = blocked;
  fallbackUsers.set(userId, existing);
  refreshFallbackCounts();
  return existing;
}

async function getBroadcastTargets(): Promise<Array<{ user_id: number; chat_id: number }>> {
  const remote = await callAudioBackend('/bot/admin/broadcast-targets', {}, 'GET');
  if (remote.ok && Array.isArray(remote.data?.targets)) {
    return remote.data.targets as Array<{ user_id: number; chat_id: number }>;
  }
  return Array.from(fallbackUsers.values())
    .filter((u) => !u.is_blocked)
    .map((u) => ({ user_id: u.user_id, chat_id: u.chat_id }));
}

async function claimAdminOwnership(userId: number): Promise<BotConfigState | null> {
  const remote = await callAudioBackend('/bot/admin/claim', { user_id: userId });
  if (remote.ok && remote.data) {
    return remote.data as unknown as BotConfigState;
  }
  if (remote.configured && !remote.ok) return null;
  if (fallbackConfig.claimed_owner_id && fallbackConfig.claimed_owner_id !== userId) {
    return null;
  }
  fallbackConfig.claimed_owner_id = userId;
  return refreshFallbackCounts();
}

async function notifyAdminsNewUser(
  token: string,
  user: TelegramUser,
  chatId: number,
  totalUsers: number,
  claimedOwnerId: number | null,
): Promise<void> {
  const adminIds = getAllAdminIds(claimedOwnerId);
  if (adminIds.length === 0) return;

  const bd = formatBangladeshDateTime(new Date());
  const fullName = escapeHtml(displayNameOf(user));
  const handle = user.username ? `@${escapeHtml(user.username.replace(/^@/, ''))}` : sc('No Username');
  const caption = [
    sc('🆕 New User Joined Bot'),
    '',
    `${sc('👤 Name:')} <a href="tg://user?id=${user.id}">${fullName}</a>`,
    `${sc('🔗 Username:')} ${handle}`,
    `${sc('🪪 Chat ID:')} <code>${chatId}</code>`,
    `${sc('📅 Date (BD):')} ${bd.dateStr}`,
    `${sc('🕒 Time (BD 12h):')} ${bd.timeStr}`,
    `${sc('👥 Total Users:')} #${totalUsers}`,
  ].join('\n');

  const markup: InlineMarkup = {
    inline_keyboard: [
      [
        { text: sc('🚫 Block User'), callback_data: `admin:block:${user.id}:0`, style: 'danger' },
        { text: sc('👑 Bot Owner'), callback_data: 'menu:owner', style: 'primary' },
      ],
    ],
  };

  let photoFileId: string | undefined;
  try {
    const ph = await tgCall(token, 'getUserProfilePhotos', { user_id: user.id, limit: 1 });
    const firstSet = ph.result?.photos?.[0];
    if (Array.isArray(firstSet) && firstSet.length > 0) {
      photoFileId = firstSet[firstSet.length - 1]?.file_id as string | undefined;
    }
  } catch {
    photoFileId = undefined;
  }

  for (const adminId of adminIds) {
    if (adminId === user.id) continue;
    try {
      if (photoFileId) {
        const pRes = await tgCall(token, 'sendPhoto', {
          chat_id: adminId,
          photo: photoFileId,
          caption,
          parse_mode: 'HTML',
          reply_markup: markup,
        });
        if (pRes.ok) continue;
      }
      await tgCall(token, 'sendMessage', {
        chat_id: adminId,
        text: caption,
        parse_mode: 'HTML',
        disable_web_page_preview: true,
        reply_markup: markup,
      });
    } catch {
      // Non-fatal if an admin hasn't started the bot
    }
  }
}

async function renderAdminPanelText(cfg: BotConfigState): Promise<string> {
  const st = await callAudioBackend('/health', {}, 'GET');
  const bd = formatBangladeshDateTime();
  return [
    sc('👑 Bot Owner Dashboard'),
    '',
    `${sc('🤖 Bot Status:')} ${cfg.maintenance_mode ? sc('🔴 OFF (Maintenance)') : sc('🟢 Online')}`,
    `${sc('👥 Total Users:')} ${cfg.total_users} (✅ ${cfg.active_users} · 🚫 ${cfg.blocked_users})`,
    `${sc('🎵 Total Music Played:')} ${cfg.total_plays}`,
    `${sc('⚡ Audio Worker:')} ${st.ok ? sc('🟢 Online') : st.configured ? sc('🔴 Offline') : sc('⚪ Not Linked')}`,
    ...(st.ok && st.data
      ? [`${sc('🖥️ CPU / RAM:')} ${String(st.data.cpu_percent ?? 0)}% / ${String(st.data.ram_percent ?? 0)}%`]
      : []),
    `${sc('🕒 BD Time (12h):')} ${bd.timeStr}`,
  ].join('\n');
}

function renderUserDetailCard(u: StoredUser): { text: string; markup: InlineMarkup } {
  const bdJoined = formatBangladeshDateTime(u.joined_at);
  const bdSeen = formatBangladeshDateTime(u.last_seen_at);
  const name = escapeHtml(`${u.first_name} ${u.last_name}`.trim() || 'Telegram User');
  const handle = u.username ? `@${escapeHtml(u.username)}` : sc('No Username');
  const text = [
    sc('👤 User Profile & Status'),
    '',
    `${sc('📛 Name:')} <a href="tg://user?id=${u.user_id}">${name}</a>`,
    `${sc('🔗 Username:')} ${handle}`,
    `${sc('🪪 Chat ID:')} <code>${u.chat_id}</code>`,
    `${sc('🚦 Status:')} ${u.is_blocked ? sc('🚫 Blocked') : sc('✅ Active')}`,
    `${sc('🎵 Plays:')} ${u.plays_count}`,
    `${sc('📅 Joined (BD):')} ${bdJoined.fullStr}`,
    `${sc('🕒 Last Seen (BD):')} ${bdSeen.fullStr}`,
  ].join('\n');

  const markup: InlineMarkup = {
    inline_keyboard: [
      [
        u.is_blocked
          ? { text: sc('✅ Unblock User'), callback_data: `admin:unblock:${u.user_id}:0`, style: 'success' }
          : { text: sc('🚫 Block User'), callback_data: `admin:block:${u.user_id}:0`, style: 'danger' },
      ],
      [
        { text: sc('👥 Users List'), callback_data: 'admin:users:0', style: 'primary' },
        { text: sc('👑 Bot Owner'), callback_data: 'menu:owner', style: 'primary' },
      ],
    ],
  };
  return { text, markup };
}

async function runBroadcast(token: string, messageText: string): Promise<{ sent: number; failed: number; total: number }> {
  const targets = await getBroadcastTargets();
  const formatted = `${sc('📢 Broadcast')}\n\n${escapeHtml(messageText)}`;

  let sent = 0;
  let failed = 0;
  for (const t of targets) {
    try {
      const r = await tgCall(token, 'sendMessage', {
        chat_id: t.chat_id,
        text: formatted,
        parse_mode: 'HTML',
        disable_web_page_preview: true,
      });
      if (r.ok) sent += 1;
      else failed += 1;
    } catch {
      failed += 1;
    }
    if ((sent + failed) % 20 === 0) await sleep(200);
  }
  return { sent, failed, total: targets.length };
}

function buildProgressBar(pos: number, dur: number, width = 17): string {
  const ratio = Math.min(1, Math.max(0, pos / Math.max(1, dur)));
  const idx = Math.min(width - 1, Math.round(ratio * (width - 1)));
  return Array.from({ length: width }, (_, i) => (i === idx ? '●' : '━')).join('');
}

function verifyWebhookHeader(req: VercelReq): boolean {
  const expected = process.env.TELEGRAM_WEBHOOK_SECRET || '';
  if (!expected) return true;
  const provided = req.headers['x-telegram-bot-api-secret-token'];
  if (typeof provided !== 'string') return false;
  const a = Buffer.from(provided, 'utf8');
  const b = Buffer.from(expected, 'utf8');
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

function constantTimeMatch(provided: string, expected: string): boolean {
  if (!provided || !expected) return false;
  const a = Buffer.from(provided, 'utf8');
  const b = Buffer.from(expected, 'utf8');
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

async function readJsonBody(req: VercelReq): Promise<TelegramUpdate> {
  if (req.body && typeof req.body === 'object') {
    return req.body as TelegramUpdate;
  }
  if (typeof req.body === 'string' && req.body.trim()) {
    return JSON.parse(req.body) as TelegramUpdate;
  }
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  const raw = Buffer.concat(chunks).toString('utf8').trim();
  return raw ? (JSON.parse(raw) as TelegramUpdate) : {};
}

export default async function handler(req: VercelReq, res: VercelRes) {
  if (req.method === 'GET') {
    const botToken = process.env.TELEGRAM_BOT_TOKEN || '';
    const botConfigured = Boolean(botToken);
    const audioWorkerConfigured = Boolean(process.env.AUDIO_BACKEND_URL && process.env.AUDIO_BACKEND_API_SECRET);

    const parsedUrl = new URL(req.url || '/api/webhook', 'https://localhost');
    const isSetup = parsedUrl.searchParams.get('setup') === '1';
    const isPing = parsedUrl.searchParams.get('ping') === '1' || isSetup;

    let webhookUrl: string | undefined;
    let webhookUpdated = false;
    let audioWorkerOnline: boolean | undefined;

    if (isPing && botToken) {
      const host = (req.headers['x-forwarded-host'] || req.headers.host || '').toString().split(',')[0].trim();
      const targetUrl = host ? `https://${host}/api/webhook` : '';

      try {
        const infoRes = await fetch(`https://api.telegram.org/bot${botToken}/getWebhookInfo`);
        const infoJson = (await infoRes.json()) as { ok?: boolean; result?: { url?: string } };
        webhookUrl = infoJson.result?.url || '';

        if (isSetup && targetUrl && webhookUrl !== targetUrl) {
          const secret = process.env.TELEGRAM_WEBHOOK_SECRET || '';
          const setRes = await fetch(`https://api.telegram.org/bot${botToken}/setWebhook`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              url: targetUrl,
              allowed_updates: ['message', 'callback_query'],
              ...(secret ? { secret_token: secret } : {}),
            }),
          });
          const setJson = (await setRes.json()) as { ok?: boolean };
          if (setJson.ok) {
            webhookUrl = targetUrl;
            webhookUpdated = true;
          }
        }
      } catch {
        // Non-fatal
      }
    }

    if (isPing && audioWorkerConfigured) {
      const h = await callAudioBackend('/health', {}, 'GET');
      audioWorkerOnline = h.ok;
    }

    res.status(200).json({
      ok: true,
      awake: true,
      service: 'telestream-vercel-webhook',
      botConfigured,
      audioWorkerConfigured,
      ...(webhookUrl !== undefined ? { webhookUrl, webhookUpdated } : {}),
      ...(audioWorkerOnline !== undefined ? { audioWorkerOnline } : {}),
      ...(botConfigured
        ? {}
        : { nextStep: 'Add TELEGRAM_BOT_TOKEN in Vercel Settings -> Environment Variables and Redeploy.' }),
    });
    return;
  }

  if (req.method !== 'POST') {
    res.status(405).json({ ok: false, error: 'Method Not Allowed' });
    return;
  }

  if (!verifyWebhookHeader(req)) {
    res.status(401).json({ ok: false, error: 'Unauthorized webhook secret' });
    return;
  }

  const botToken = process.env.TELEGRAM_BOT_TOKEN || '';
  if (!botToken) {
    res.status(500).json({ ok: false, error: 'TELEGRAM_BOT_TOKEN is not configured in Vercel Environment Variables.' });
    return;
  }

  const update = await readJsonBody(req);
  const hasWorker = Boolean(process.env.AUDIO_BACKEND_URL && process.env.AUDIO_BACKEND_API_SECRET);

  try {
    if (update.callback_query) {
      const cq = update.callback_query;
      const chatId = cq.message?.chat.id;
      const msgId = cq.message?.message_id;
      const chatType = cq.message?.chat.type || 'private';
      const data = cq.data || '';

      if (!chatId || !msgId) {
        await tgCall(botToken, 'answerCallbackQuery', { callback_query_id: cq.id });
        res.status(200).json({ ok: true });
        return;
      }

      const tracked = await trackUserState(cq.from, chatId);
      const isAdmin = isUserAdmin(cq.from.id, tracked.claimed_owner_id);

      if (tracked.is_new) {
        await notifyAdminsNewUser(botToken, cq.from, chatId, tracked.total_users, tracked.claimed_owner_id);
      }

      if (!isAdmin && tracked.is_blocked) {
        await tgCall(botToken, 'answerCallbackQuery', {
          callback_query_id: cq.id,
          text: sc('Access Restricted: You have been blocked by Admin.'),
          show_alert: true,
        });
        res.status(200).json({ ok: true });
        return;
      }

      if (!isAdmin && (data === 'menu:owner' || data.startsWith('admin:') || data.startsWith('owner:'))) {
        await tgCall(botToken, 'answerCallbackQuery', {
          callback_query_id: cq.id,
          text: sc('⛔ Access Denied — Admin Only!'),
          show_alert: true,
        });
        res.status(200).json({ ok: true });
        return;
      }

      if (!isAdmin && tracked.maintenance_mode) {
        await tgCall(botToken, 'answerCallbackQuery', {
          callback_query_id: cq.id,
          text: sc('🛠️ Bot is currently under maintenance. Please wait.'),
          show_alert: true,
        });
        await editHtmlMessage(botToken, chatId, msgId, buildMaintenanceText(cq.from), {
          inline_keyboard: [[{ text: sc('🔄 Check Status'), callback_data: 'menu:start', style: 'primary' }]],
        });
        res.status(200).json({ ok: true });
        return;
      }

      if (data === 'menu:start') {
        await tgCall(botToken, 'answerCallbackQuery', { callback_query_id: cq.id });
        await editHtmlMessage(
          botToken,
          chatId,
          msgId,
          buildWelcomeText({
            user: cq.from,
            isAdmin,
            hasWorker,
            maintenanceMode: tracked.maintenance_mode,
          }),
          mainKeyboard(isAdmin),
        );
      } else if (data === 'menu:help') {
        await tgCall(botToken, 'answerCallbackQuery', { callback_query_id: cq.id });
        await editHtmlMessage(botToken, chatId, msgId, buildHelpText(), mainKeyboard(isAdmin));
      } else if (data === 'menu:play' || data === 'play:search_hint' || data === 'play:url_hint') {
        const toast = sc(
          data === 'play:search_hint'
            ? 'Type /search <song name> to pick from top 5 songs!'
            : data === 'play:url_hint'
              ? 'Send any MP3/Audio/Voice file or YouTube link!'
              : 'Opening Music Player...',
        );
        await tgCall(botToken, 'answerCallbackQuery', { callback_query_id: cq.id, text: toast });
        const guideText = [
          sc('🎵 Play Music'),
          '',
          sc('1️⃣ Search & Pick: /search Kesariya'),
          sc('2️⃣ Play Song/Link: /play Faded Alan Walker'),
          sc('3️⃣ Upload Audio: Send any MP3 / Audio / Voice file'),
          ...(hasWorker ? [] : ['', sc('⚠️ Link Audio Worker to stream into Voice Chat.')]),
        ].join('\n');
        await sendEffectMessage(
          botToken,
          chatId,
          chatType,
          guideText,
          playGuideKeyboard(),
          TELEGRAM_EFFECTS.fire,
          PLAY_INTRO_FRAMES,
          160,
        );
      } else if (data.startsWith('pick:')) {
        const rawRef = data.slice(5);
        const source = rawRef.startsWith('yt:') ? `https://www.youtube.com/watch?v=${rawRef.slice(3)}` : rawRef;
        await tgCall(botToken, 'answerCallbackQuery', {
          callback_query_id: cq.id,
          text: sc(hasWorker ? 'Starting selected track...' : 'Audio Worker not linked yet!'),
          show_alert: !hasWorker,
        });
        const pRes = await callAudioBackend('/player/play', {
          chat_id: chatId,
          source,
          requested_by: cq.from.username || cq.from.first_name || 'User',
        });
        if (pRes.ok) {
          await callAudioBackend('/bot/stats/play', { user_id: cq.from.id }).catch(() => undefined);
        }
        const text = pRes.ok
          ? [
              sc('🎧 Now Playing'),
              '',
              `${sc('🎵 Song:')} ${escapeHtml(String(pRes.data?.title || source))}`,
              `${sc('▶️ Status:')} ${sc('Playing')}`,
            ].join('\n')
          : `${sc('❌ Cannot Play Track')}\n\n${escapeHtml(String(pRes.error || 'Error'))}`;
        await sendEffectMessage(
          botToken,
          chatId,
          chatType,
          text,
          playerKeyboard(Boolean(pRes.ok)),
          TELEGRAM_EFFECTS.fire,
          PLAY_INTRO_FRAMES,
          160,
        );
      } else if (data === 'menu:player' || data === 'menu:nowplaying' || data === 'menu:queue') {
        await tgCall(botToken, 'answerCallbackQuery', { callback_query_id: cq.id });
        const st = await callAudioBackend(`/player/status?chat_id=${chatId}`, {}, 'GET');
        const d = st.data || {};
        const text = st.ok && d.title
          ? [
              sc('🎧 Now Playing'),
              '',
              `${sc('🎵 Song:')} ${escapeHtml(String(d.title))}`,
              `${sc('👤 Artist:')} ${escapeHtml(String(d.artist || 'Unknown'))}`,
              `${sc('🔊 Volume:')} ${d.muted ? sc('Muted') : `${String(d.volume ?? 80)}%`}`,
              `${sc('▶️ Status:')} ${sc(String(d.status || 'Playing'))}`,
              '',
              buildProgressBar(Number(d.position || 0), Number(d.duration || 100)),
            ].join('\n')
          : `${sc('🎧 Music Player')}\n\n${st.configured ? sc('💤 No track is currently playing. Send /search <song> or /play <song>.') : getWorkerDiagnosticText('Music Player')}`;
        await editHtmlMessage(botToken, chatId, msgId, text, playerKeyboard(d.status === 'playing'));
      } else if (data === 'menu:volume') {
        await tgCall(botToken, 'answerCallbackQuery', { callback_query_id: cq.id });
        const vRes = await callAudioBackend(`/volume/status?chat_id=${chatId}`, {}, 'GET');
        const fallback = chatVolumeFallback.get(String(chatId)) ?? { volume: 80, muted: false };
        const vol = vRes.ok && vRes.data ? clampVol(Number(vRes.data.volume ?? 80)) : fallback.volume;
        const muted = vRes.ok && vRes.data ? Boolean(vRes.data.muted) : fallback.muted;
        const volText = [
          sc('🎚️ Volume Control'),
          '',
          `${sc('Current Gain:')} &lt;  ${muted ? sc('🔇 Muted') : `🔊 ${vol}%`}  &gt;`,
          sc('Range: 10% – 200% (FFmpeg Real-Time)'),
        ].join('\n');
        await sendEffectMessage(
          botToken,
          chatId,
          chatType,
          volText,
          volumeKeyboard(),
          TELEGRAM_EFFECTS.fire,
          [sc('🎚️ Opening Volume Control...'), sc('🔥 Boosting Range 10% – 200%...')],
        );
      } else if (data.startsWith('vol:')) {
        const op = data.slice(4);
        const isNumericPreset = /^\d+$/.test(op);
        const vRes = isNumericPreset
          ? await callAudioBackend('/volume/set', { chat_id: chatId, volume: clampVol(Number(op)) })
          : await callAudioBackend('/volume/adjust', { chat_id: chatId, action: op });
        const nextVol =
          vRes.ok && vRes.data
            ? { volume: clampVol(Number(vRes.data.volume ?? 80)), muted: Boolean(vRes.data.muted) }
            : applyFallbackVolume(chatId, op, cq.message?.text);
        await tgCall(botToken, 'answerCallbackQuery', {
          callback_query_id: cq.id,
          text: sc(nextVol.muted ? 'Audio Muted' : `Volume: ${nextVol.volume}% (10%–200%)`),
        });
        const volText = [
          sc('🎚️ Volume Control'),
          '',
          `${sc('Current Gain:')} &lt;  ${nextVol.muted ? sc('🔇 Muted') : `🔊 ${nextVol.volume}%`}  &gt;`,
          sc('Range: 10% – 200% (FFmpeg Real-Time)'),
        ].join('\n');
        await editHtmlMessage(botToken, chatId, msgId, volText, volumeKeyboard());
      } else if (data.startsWith('player:')) {
        const action = data.slice(7);
        const r = await callAudioBackend(`/player/${action}`, { chat_id: chatId });
        await tgCall(botToken, 'answerCallbackQuery', {
          callback_query_id: cq.id,
          text: sc(r.ok ? `Playback: ${action.toUpperCase()}` : r.error || 'Audio Worker not linked'),
          show_alert: !r.configured,
        });
        await editHtmlMessage(
          botToken,
          chatId,
          msgId,
          r.ok
            ? `${sc('🎧 Playback:')} ${sc(action)}`
            : `${sc(`🎧 Playback (${action})`)}\n\n${getWorkerDiagnosticText()}`,
          playerKeyboard(action === 'resume'),
        );
      } else if (data === 'menu:live' || data === 'live:leave' || data === 'live:join_hint') {
        if (data === 'live:leave') {
          const leaveRes = await callAudioBackend('/live/leave', { chat_id: chatId });
          await tgCall(botToken, 'answerCallbackQuery', {
            callback_query_id: cq.id,
            text: sc(leaveRes.ok ? 'Left Voice Chat' : 'Audio Worker not linked yet!'),
            show_alert: !leaveRes.configured,
          });
        } else if (data === 'live:join_hint') {
          await tgCall(botToken, 'answerCallbackQuery', {
            callback_query_id: cq.id,
            text: sc('Paste any https://t.me/group_name link in chat to auto-join!'),
            show_alert: true,
          });
        } else {
          await tgCall(botToken, 'answerCallbackQuery', { callback_query_id: cq.id });
        }

        const lRes = await callAudioBackend('/live/status', {}, 'GET');
        const text = lRes.ok && lRes.data?.active
          ? [
              sc('🎤 Live Connected'),
              '',
              sc('✅ Personal Account: Connected'),
              `${sc('🎧 Voice Chat: Active')} (${escapeHtml(String(lRes.data.group_title || 'Group'))})`,
              '',
              sc('Now send /search <song> or /play <song> to stream audio!'),
            ].join('\n')
          : [
              sc('🎤 Live Control Panel'),
              '',
              sc(data === 'live:join_hint' ? '👉 Paste your Telegram Group/Live link right now in this chat.' : 'Send /joinlive https://t.me/group_name (or paste the link directly) to auto-join.'),
              lRes.configured ? '' : getWorkerDiagnosticText('Auto Live Join'),
            ]
              .filter(Boolean)
              .join('\n\n');
        await editHtmlMessage(botToken, chatId, msgId, text, liveKeyboard());
      } else if (data === 'menu:account' || data.startsWith('account:')) {
        const op = data === 'menu:account' ? 'status' : data.slice(8);
        const aRes = await callAudioBackend(`/account/${op}`, {}, op === 'status' ? 'GET' : 'POST');
        if (op !== 'status') {
          await tgCall(botToken, 'answerCallbackQuery', {
            callback_query_id: cq.id,
            text: sc(aRes.ok ? `Personal Account ${op} succeeded!` : 'Audio Worker not linked!'),
            show_alert: !aRes.ok,
          });
        } else {
          await tgCall(botToken, 'answerCallbackQuery', { callback_query_id: cq.id });
        }
        const text = aRes.ok && aRes.data
          ? [
              sc('👤 Personal Account'),
              '',
              `${sc('📛 Name:')} ${escapeHtml(String(aRes.data.display_name || 'Connected'))}`,
              `${sc('🔗 Username:')} ${escapeHtml(String(aRes.data.username || '@account'))}`,
              `${sc('⚡ Status:')} ${sc(String(aRes.data.status || 'connected'))}`,
            ].join('\n')
          : `${sc('👤 Personal Account Control')}\n\n${getWorkerDiagnosticText(op === 'status' ? 'Account Status' : `Account ${op}`)}`;
        await editHtmlMessage(botToken, chatId, msgId, text, accountKeyboard());
      } else if (data === 'menu:owner') {
        await tgCall(botToken, 'answerCallbackQuery', { callback_query_id: cq.id });
        pendingAdminInput.delete(cq.from.id);
        const cfg = await getBotConfig();
        const panelText = await renderAdminPanelText(cfg);
        await editHtmlMessage(botToken, chatId, msgId, panelText, adminPanelKeyboard(cfg.maintenance_mode));
      } else if (data === 'admin:toggle_maintenance') {
        const current = await getBotConfig();
        const nextCfg = await setMaintenanceMode(!current.maintenance_mode);
        await tgCall(botToken, 'answerCallbackQuery', {
          callback_query_id: cq.id,
          text: sc(nextCfg.maintenance_mode ? '🔴 Bot turned OFF (Maintenance ON)' : '🟢 Bot turned ON (Live)'),
          show_alert: true,
        });
        const panelText = await renderAdminPanelText(nextCfg);
        await editHtmlMessage(botToken, chatId, msgId, panelText, adminPanelKeyboard(nextCfg.maintenance_mode));
      } else if (data.startsWith('admin:users:')) {
        await tgCall(botToken, 'answerCallbackQuery', { callback_query_id: cq.id });
        const page = Number(data.split(':')[2] || 0);
        const listRes = await listBotUsers(page, 5);
        const totalPages = Math.max(1, Math.ceil(listRes.total_users / 5));
        const lines = listRes.users.map((u) => {
          const bd = formatBangladeshDateTime(u.joined_at);
          const name = escapeHtml(`${u.first_name} ${u.last_name}`.trim() || 'User');
          const handle = u.username ? `@${escapeHtml(u.username)}` : sc('no_username');
          return `${u.is_blocked ? '🚫' : '✅'} ${name} (${handle}) · <code>${u.user_id}</code> · 🕒 ${bd.timeStr}`;
        });
        const text = [
          `${sc('👥 User Management')} (${page + 1}/${totalPages})`,
          '',
          lines.join('\n\n') || sc('No users recorded yet.'),
          '',
          sc('💡 Tap a user below to view status or Block/Unblock:'),
        ].join('\n');
        const rows: InlineButton[][] = listRes.users.map((u) => [
          {
            text: `${u.is_blocked ? '🚫' : '✅'} ${(u.first_name || 'User').slice(0, 18)} (${u.user_id})`,
            callback_data: `admin:user:${u.user_id}:${page}`,
            style: u.is_blocked ? 'danger' : 'primary',
          },
        ]);
        const nav: InlineButton[] = [];
        if (page > 0) nav.push({ text: sc('⬅️ Prev'), callback_data: `admin:users:${page - 1}`, style: 'primary' });
        if ((page + 1) * 5 < listRes.total_users) nav.push({ text: sc('Next ➡️'), callback_data: `admin:users:${page + 1}`, style: 'primary' });
        if (nav.length) rows.push(nav);
        rows.push([{ text: sc('🔙 Bot Owner'), callback_data: 'menu:owner', style: 'primary' }]);
        await editHtmlMessage(botToken, chatId, msgId, text, { inline_keyboard: rows });
      } else if (data.startsWith('admin:user:') || data.startsWith('admin:block:') || data.startsWith('admin:unblock:')) {
        const parts = data.split(':');
        const op = parts[1];
        const targetId = Number(parts[2]);
        let user: StoredUser | null = null;
        if (op === 'block') {
          if (isUserAdmin(targetId, tracked.claimed_owner_id)) {
            await tgCall(botToken, 'answerCallbackQuery', {
              callback_query_id: cq.id,
              text: sc('Cannot block an Admin!'),
              show_alert: true,
            });
            res.status(200).json({ ok: true });
            return;
          }
          user = await setBotUserBlocked(targetId, true);
          await tgCall(botToken, 'answerCallbackQuery', { callback_query_id: cq.id, text: sc('🚫 User Blocked!') });
        } else if (op === 'unblock') {
          user = await setBotUserBlocked(targetId, false);
          await tgCall(botToken, 'answerCallbackQuery', { callback_query_id: cq.id, text: sc('✅ User Unblocked!') });
        } else {
          await tgCall(botToken, 'answerCallbackQuery', { callback_query_id: cq.id });
          user = await getBotUser(targetId);
        }
        if (!user) {
          await editHtmlMessage(botToken, chatId, msgId, `❌ ${sc('User not found.')}`, adminPanelKeyboard(tracked.maintenance_mode));
        } else {
          const card = renderUserDetailCard(user);
          await editHtmlMessage(botToken, chatId, msgId, card.text, card.markup);
        }
      } else if (data === 'admin:broadcast_prompt') {
        await tgCall(botToken, 'answerCallbackQuery', { callback_query_id: cq.id });
        pendingAdminInput.set(cq.from.id, 'broadcast');
        const text = [
          sc('📢 Broadcast System'),
          '',
          `${sc('📨 Active Users:')} ${tracked.active_users}`,
          sc('Send your announcement message right now, or use /broadcast <message>'),
        ].join('\n');
        await editHtmlMessage(botToken, chatId, msgId, text, {
          inline_keyboard: [[{ text: sc('❌ Cancel'), callback_data: 'menu:owner', style: 'danger' }]],
        });
      } else if (data === 'admin:lookup_prompt') {
        await tgCall(botToken, 'answerCallbackQuery', { callback_query_id: cq.id });
        pendingAdminInput.set(cq.from.id, 'lookup');
        const text = [
          sc('🔍 Check User Status'),
          '',
          sc('🪪 Send the numeric Chat/User ID now, or type /user 123456789'),
        ].join('\n');
        await editHtmlMessage(botToken, chatId, msgId, text, {
          inline_keyboard: [[{ text: sc('❌ Cancel'), callback_data: 'menu:owner', style: 'danger' }]],
        });
      } else {
        await tgCall(botToken, 'answerCallbackQuery', { callback_query_id: cq.id });
      }

      res.status(200).json({ ok: true });
      return;
    }

    if (update.message) {
      const msg = update.message;
      const chatId = msg.chat.id;
      const chatType = msg.chat.type || 'private';
      const rawText = (msg.text || '').trim();
      const [rawCmd, ...rest] = rawText.split(/\s+/);
      const cmd = rawCmd.toLowerCase().split('@')[0];
      const arg = rest.join(' ').trim();
      const audioDoc =
        msg.document &&
        (msg.document.mime_type?.startsWith('audio/') ||
          /\.(mp3|m4a|ogg|wav|flac|aac)$/i.test(msg.document.file_name || ''))
          ? msg.document
          : undefined;

      // One-time /claimadmin <secret> (when TELEGRAM_OWNER_ID wasn't configured in env)
      if (cmd === '/claimadmin' && msg.from?.id && chatType === 'private') {
        await tgCall(botToken, 'deleteMessage', { chat_id: chatId, message_id: msg.message_id }).catch(() => undefined);
        const expectedWorker = process.env.AUDIO_BACKEND_API_SECRET || '';
        const expectedWebhook = process.env.TELEGRAM_WEBHOOK_SECRET || '';
        const secretValid =
          constantTimeMatch(arg, expectedWorker) || constantTimeMatch(arg, expectedWebhook);
        if (!secretValid) {
          await sendEffectMessage(botToken, chatId, chatType, `⛔ <b>${sc('Invalid admin claim secret.')}</b>`, mainKeyboard(false), TELEGRAM_EFFECTS.thumbsDown);
          res.status(200).json({ ok: true });
          return;
        }
        const claimed = await claimAdminOwnership(msg.from.id);
        await sendEffectMessage(
          botToken,
          chatId,
          chatType,
          claimed
            ? `${sc('👑 Admin Ownership Verified!')}\n\n🪪 <code>${msg.from.id}</code>\n${sc('✅ Send /start to access Bot Owner.')}`
            : sc('⛔ Admin ownership is already claimed.'),
          mainKeyboard(Boolean(claimed)),
          claimed ? TELEGRAM_EFFECTS.confetti : TELEGRAM_EFFECTS.thumbsDown,
        );
        res.status(200).json({ ok: true });
        return;
      }

      const tracked = msg.from
        ? await trackUserState(msg.from, chatId)
        : { is_new: false, is_blocked: false, ...(await getBotConfig()) };
      const isAdmin = isUserAdmin(msg.from?.id, tracked.claimed_owner_id);

      if (msg.from && tracked.is_new) {
        await notifyAdminsNewUser(botToken, msg.from, chatId, tracked.total_users, tracked.claimed_owner_id);
      }

      if (!isAdmin && tracked.is_blocked) {
        await sendEffectMessage(
          botToken,
          chatId,
          chatType,
          `${sc('🚫 Access Restricted')}\n\n${sc('⛔ You have been blocked by Admin.')}`,
          undefined,
          TELEGRAM_EFFECTS.thumbsDown,
        );
        res.status(200).json({ ok: true });
        return;
      }

      // Admin pending interactive input (broadcast or user lookup)
      if (isAdmin && msg.from && rawText && !rawText.startsWith('/')) {
        const pending = pendingAdminInput.get(msg.from.id);
        if (pending === 'broadcast') {
          pendingAdminInput.delete(msg.from.id);
          const result = await runBroadcast(botToken, rawText);
          await sendEffectMessage(
            botToken,
            chatId,
            chatType,
            `${sc('📢 Broadcast Complete')}\n\n✅ ${result.sent} · ❌ ${result.failed} · 👥 ${result.total}`,
            adminPanelKeyboard(tracked.maintenance_mode),
            TELEGRAM_EFFECTS.confetti,
          );
          res.status(200).json({ ok: true });
          return;
        }
        if (pending === 'lookup') {
          pendingAdminInput.delete(msg.from.id);
          const targetId = Number(rawText.replace(/\D/g, ''));
          const found = targetId ? await getBotUser(targetId) : null;
          if (!found) {
            await sendEffectMessage(
              botToken,
              chatId,
              chatType,
              `❌ ${sc('User ID not found in database.')}`,
              adminPanelKeyboard(tracked.maintenance_mode),
              TELEGRAM_EFFECTS.thumbsDown,
            );
          } else {
            const card = renderUserDetailCard(found);
            await sendEffectMessage(botToken, chatId, chatType, card.text, card.markup, TELEGRAM_EFFECTS.thumbsUp);
          }
          res.status(200).json({ ok: true });
          return;
        }
      }

      // Strict admin-only command guard
      const adminCmds = [
        '/admin', '/owner', '/stats', '/status', '/users', '/user',
        '/block', '/unblock', '/broadcast', '/maintenance', '/boton', '/botoff',
      ];
      if (!isAdmin && adminCmds.includes(cmd)) {
        await sendEffectMessage(
          botToken,
          chatId,
          chatType,
          sc('⛔ Admin or Owner permissions required.'),
          mainKeyboard(false),
          TELEGRAM_EFFECTS.thumbsDown,
        );
        res.status(200).json({ ok: true });
        return;
      }

      // Maintenance gate for non-admin users (shows nice Maintenance card on /start or any command)
      if (!isAdmin && tracked.maintenance_mode) {
        await sendEffectMessage(
          botToken,
          chatId,
          chatType,
          buildMaintenanceText(msg.from),
          { inline_keyboard: [[{ text: sc('🔄 Check Status'), callback_data: 'menu:start', style: 'primary' }]] },
          TELEGRAM_EFFECTS.thumbsDown,
        );
        res.status(200).json({ ok: true });
        return;
      }

      if (cmd === '/start') {
        await sendEffectMessage(
          botToken,
          chatId,
          chatType,
          buildWelcomeText({
            user: msg.from,
            isAdmin,
            hasWorker,
            maintenanceMode: tracked.maintenance_mode,
          }),
          mainKeyboard(isAdmin),
          TELEGRAM_EFFECTS.confetti,
          makeEqualizerFrames('⚡ Booting Music Spam Bot...', '🎧 Syncing Live Controls...'),
        );
      } else if (cmd === '/help') {
        await sendEffectMessage(
          botToken,
          chatId,
          chatType,
          buildHelpText(),
          mainKeyboard(isAdmin),
          TELEGRAM_EFFECTS.thumbsUp,
        );
      } else if (cmd === '/admin' || cmd === '/owner' || cmd === '/stats' || cmd === '/status') {
        const cfg = await getBotConfig();
        const panelText = await renderAdminPanelText(cfg);
        await sendEffectMessage(
          botToken,
          chatId,
          chatType,
          panelText,
          adminPanelKeyboard(cfg.maintenance_mode),
          TELEGRAM_EFFECTS.confetti,
        );
      } else if (cmd === '/maintenance' || cmd === '/boton' || cmd === '/botoff') {
        const nextVal =
          cmd === '/botoff'
            ? true
            : cmd === '/boton'
              ? false
              : arg.toLowerCase() === 'on'
                ? true
                : arg.toLowerCase() === 'off'
                  ? false
                  : !tracked.maintenance_mode;
        const cfg = await setMaintenanceMode(nextVal);
        const panelText = await renderAdminPanelText(cfg);
        await sendEffectMessage(
          botToken,
          chatId,
          chatType,
          panelText,
          adminPanelKeyboard(cfg.maintenance_mode),
          cfg.maintenance_mode ? TELEGRAM_EFFECTS.thumbsDown : TELEGRAM_EFFECTS.confetti,
        );
      } else if (cmd === '/broadcast') {
        if (!arg) {
          if (msg.from) pendingAdminInput.set(msg.from.id, 'broadcast');
          await sendEffectMessage(
            botToken,
            chatId,
            chatType,
            `📢 ${sc('Send your announcement message now, or type /broadcast Hello everyone!')}`,
            adminPanelKeyboard(tracked.maintenance_mode),
            TELEGRAM_EFFECTS.thumbsUp,
          );
        } else {
          const result = await runBroadcast(botToken, arg);
          await sendEffectMessage(
            botToken,
            chatId,
            chatType,
            `${sc('📢 Broadcast Complete')}\n\n✅ ${result.sent} · ❌ ${result.failed} · 👥 ${result.total}`,
            adminPanelKeyboard(tracked.maintenance_mode),
            TELEGRAM_EFFECTS.confetti,
          );
        }
      } else if (cmd === '/users') {
        const listRes = await listBotUsers(0, 5);
        const totalPages = Math.max(1, Math.ceil(listRes.total_users / 5));
        const lines = listRes.users.map((u) => {
          const bd = formatBangladeshDateTime(u.joined_at);
          const name = escapeHtml(`${u.first_name} ${u.last_name}`.trim() || 'User');
          return `${u.is_blocked ? '🚫' : '✅'} ${name} · <code>${u.user_id}</code> · 🕒 ${bd.timeStr}`;
        });
        const rows: InlineButton[][] = listRes.users.map((u) => [
          {
            text: `${u.is_blocked ? '🚫' : '✅'} ${(u.first_name || 'User').slice(0, 18)} (${u.user_id})`,
            callback_data: `admin:user:${u.user_id}:0`,
            style: u.is_blocked ? 'danger' : 'primary',
          },
        ]);
        if (listRes.total_users > 5) {
          rows.push([{ text: sc('Next ➡️'), callback_data: 'admin:users:1', style: 'primary' }]);
        }
        rows.push([{ text: sc('🔙 Bot Owner'), callback_data: 'menu:owner', style: 'primary' }]);
        await sendEffectMessage(
          botToken,
          chatId,
          chatType,
          `${sc('👥 User Management')} (1/${totalPages})\n\n${lines.join('\n\n') || sc('No users recorded yet.')}`,
          { inline_keyboard: rows },
          TELEGRAM_EFFECTS.thumbsUp,
        );
      } else if (cmd === '/user' || cmd === '/block' || cmd === '/unblock') {
        const targetId = Number(arg.replace(/\D/g, ''));
        if (!targetId) {
          await sendEffectMessage(botToken, chatId, chatType, `❌ ${sc(`Usage: ${cmd} <user_id>`)}`, adminPanelKeyboard(tracked.maintenance_mode), TELEGRAM_EFFECTS.thumbsDown);
        } else if (cmd === '/block' && isUserAdmin(targetId, tracked.claimed_owner_id)) {
          await sendEffectMessage(botToken, chatId, chatType, `⛔ ${sc('Cannot block an Admin.')}`, adminPanelKeyboard(tracked.maintenance_mode), TELEGRAM_EFFECTS.thumbsDown);
        } else {
          const u =
            cmd === '/user'
              ? await getBotUser(targetId)
              : await setBotUserBlocked(targetId, cmd === '/block');
          if (!u) {
            await sendEffectMessage(botToken, chatId, chatType, `❌ ${sc('User not found.')}`, adminPanelKeyboard(tracked.maintenance_mode), TELEGRAM_EFFECTS.thumbsDown);
          } else {
            const card = renderUserDetailCard(u);
            await sendEffectMessage(botToken, chatId, chatType, card.text, card.markup, TELEGRAM_EFFECTS.thumbsUp);
          }
        }
      } else if (cmd === '/joinlive' || rawText.includes('t.me/') || rawText.includes('telegram.me/')) {
        const link = cmd === '/joinlive' ? arg : rawText;
        if (!link) {
          await sendEffectMessage(
            botToken,
            chatId,
            chatType,
            `❌ ${sc('Invalid Live Link')}\n\n${sc('Usage: /joinlive https://t.me/example_group/123')}`,
            liveKeyboard(),
            TELEGRAM_EFFECTS.thumbsDown,
          );
        } else {
          const jRes = await callAudioBackend('/live/join', { link, chat_id: chatId });
          const final = jRes.ok
            ? [
                sc('🎤 Live Connected'),
                '',
                sc('✅ Personal Account: Connected'),
                sc('🎧 Voice Chat: Active'),
                `${sc('📍 Group:')} ${escapeHtml(String(jRes.data?.group_title || link))}`,
                sc('⚡ Connection: Stable'),
                '',
                sc('🎵 Now send /search <song name> or /play <song name> to play music!'),
              ].join('\n')
            : `${sc('❌ Auto Live Join Failed')}\n\n${jRes.configured ? escapeHtml(String(jRes.error || '')) : getWorkerDiagnosticText('Auto Live Join')}`;
          await sendEffectMessage(
            botToken,
            chatId,
            chatType,
            final,
            liveKeyboard(),
            TELEGRAM_EFFECTS.heart,
            [sc('🎤 Connecting Voice Chat...'), sc('🔊 Syncing Live Stream...')],
          );
        }
      } else if (cmd === '/search') {
        if (!arg) {
          await sendEffectMessage(
            botToken,
            chatId,
            chatType,
            `🔍 ${sc('Usage: /search Kesariya Arijit Singh')}`,
            playGuideKeyboard(),
            TELEGRAM_EFFECTS.fire,
          );
        } else {
          const sRes = await callAudioBackend('/player/search', { query: arg, limit: 5 });
          const results = Array.isArray(sRes.data?.results)
            ? (sRes.data.results as Array<{ title?: string; artist?: string; duration?: number; id?: string; url?: string }>)
            : [];
          if (!sRes.ok || results.length === 0) {
            await sendEffectMessage(
              botToken,
              chatId,
              chatType,
              sRes.configured
                ? `❌ ${sc(`No tracks found for "${arg}". Try /play ${arg} or send a direct URL.`)}`
                : `${sc('🔍 Song Search')}\n\n${getWorkerDiagnosticText('Music Search')}`,
              playGuideKeyboard(),
              TELEGRAM_EFFECTS.fire,
              [sc('🔍 Searching Track...'), sc('🔥 Preparing Results...')],
            );
          } else {
            const buttons: InlineButton[][] = results.slice(0, 5).map((item, idx) => {
              const title = String(item.title || `Track ${idx + 1}`).slice(0, 42);
              const ref = item.id ? `yt:${item.id}` : String(item.url || '').slice(0, 56);
              return [{ text: `${idx + 1}. 🎵 ${sc(title)}`, callback_data: `pick:${ref}`, style: 'success' }];
            });
            buttons.push([{ text: sc('🔙 Main Menu'), callback_data: 'menu:start', style: 'primary' }]);
            await sendEffectMessage(
              botToken,
              chatId,
              chatType,
              `${sc('🔍 Select Music For:')} ${escapeHtml(arg)}\n\n${sc('Tap any song below to play it in Live Voice Chat:')}`,
              { inline_keyboard: buttons },
              TELEGRAM_EFFECTS.fire,
              [sc('🔍 Searching Track...'), sc('🔥 Matching Top 5 Songs...')],
            );
          }
        }
      } else if (
        cmd === '/play' ||
        msg.audio ||
        msg.voice ||
        audioDoc ||
        isMediaUrl(rawText) ||
        (rawText.length > 0 && !rawText.startsWith('/'))
      ) {
        const source = msg.audio
          ? `tg_file:${msg.audio.file_id}`
          : msg.voice
            ? `tg_file:${msg.voice.file_id}`
            : audioDoc
              ? `tg_file:${audioDoc.file_id}`
              : cmd === '/play'
                ? arg
                : rawText;
        if (!source) {
          await sendEffectMessage(
            botToken,
            chatId,
            chatType,
            `${sc('🎵 Play Music')}\n\n${sc('Send /play <song name or URL>, /search <song>, or upload an MP3/Audio file.')}`,
            playGuideKeyboard(),
            TELEGRAM_EFFECTS.fire,
            PLAY_INTRO_FRAMES,
            160,
          );
        } else {
          const pRes = await callAudioBackend('/player/play', {
            chat_id: chatId,
            source,
            requested_by: msg.from?.username || msg.from?.first_name || 'User',
          });
          if (pRes.ok && msg.from?.id) {
            await callAudioBackend('/bot/stats/play', { user_id: msg.from.id }).catch(() => undefined);
          }
          const final = pRes.ok
            ? [
                sc('🎧 Now Playing'),
                '',
                `${sc('🎵 Song:')} ${escapeHtml(String(pRes.data?.title || source))}`,
                `${sc('▶️ Status:')} ${sc('Playing')}`,
              ].join('\n')
            : `${sc('❌ Cannot Play Music')}\n\n${pRes.configured ? escapeHtml(String(pRes.error || '')) : getWorkerDiagnosticText('Play Music')}`;
          await sendEffectMessage(
            botToken,
            chatId,
            chatType,
            final,
            playerKeyboard(Boolean(pRes.ok)),
            TELEGRAM_EFFECTS.fire,
            PLAY_INTRO_FRAMES,
            160,
          );
        }
      } else if (cmd === '/volume') {
        const cleanedArg = arg.replace('%', '').trim();
        const hasVolArg = cleanedArg.length > 0 && Number.isFinite(Number(cleanedArg));
        const targetVol = hasVolArg ? clampVol(Number(cleanedArg)) : undefined;
        const vRes = targetVol !== undefined
          ? await callAudioBackend('/volume/set', { chat_id: chatId, volume: targetVol })
          : await callAudioBackend(`/volume/status?chat_id=${chatId}`, {}, 'GET');
        const nextVol =
          vRes.ok && vRes.data
            ? { volume: clampVol(Number(vRes.data.volume ?? 80)), muted: Boolean(vRes.data.muted) }
            : targetVol !== undefined
              ? applyFallbackVolume(chatId, String(targetVol))
              : (chatVolumeFallback.get(String(chatId)) ?? { volume: 80, muted: false });
        await sendEffectMessage(
          botToken,
          chatId,
          chatType,
          [
            sc('🎚️ Volume Control'),
            '',
            `${sc('Current Gain:')} &lt;  ${nextVol.muted ? sc('🔇 Muted') : `🔊 ${nextVol.volume}%`}  &gt;`,
            sc('Range: 10% – 200% (FFmpeg Real-Time)'),
          ].join('\n'),
          volumeKeyboard(),
          TELEGRAM_EFFECTS.fire,
          [sc('🎚️ Opening Volume Control...'), sc('🔥 Volume Range: 10% – 200%...')],
        );
      } else if (cmd === '/ping') {
        const t0 = Date.now();
        const h = await callAudioBackend('/health', {}, 'GET');
        await sendEffectMessage(
          botToken,
          chatId,
          chatType,
          `⚡ ${sc('Pong!')} ${Date.now() - t0}ms (${h.ok ? sc('🟢 Online') : sc('🔴 Offline')})`,
          mainKeyboard(isAdmin),
          TELEGRAM_EFFECTS.confetti,
        );
      } else if (['/pause', '/resume', '/skip', '/stop'].includes(cmd)) {
        const action = cmd.slice(1);
        const r = await callAudioBackend(`/player/${action}`, { chat_id: chatId });
        await sendEffectMessage(
          botToken,
          chatId,
          chatType,
          r.ok ? `🎧 ${sc(`${action} executed.`)}` : `❌ ${escapeHtml(String(r.error || 'Failed'))}`,
          playerKeyboard(action === 'resume'),
          action === 'stop' ? TELEGRAM_EFFECTS.thumbsDown : TELEGRAM_EFFECTS.fire,
        );
      } else if (cmd === '/leavelive') {
        const r = await callAudioBackend('/live/leave', { chat_id: chatId });
        await sendEffectMessage(
          botToken,
          chatId,
          chatType,
          r.ok ? `🚪 ${sc('Left Voice Chat.')}` : `❌ ${escapeHtml(String(r.error || 'Failed'))}`,
          liveKeyboard(),
          TELEGRAM_EFFECTS.thumbsDown,
        );
      } else if (cmd === '/live') {
        await sendEffectMessage(
          botToken,
          chatId,
          chatType,
          sc('🎤 Live Control Panel'),
          liveKeyboard(),
          TELEGRAM_EFFECTS.fire,
        );
      } else if (cmd === '/account' || cmd === '/connect' || cmd === '/disconnect' || cmd === '/reconnect') {
        const op = cmd === '/account' ? 'status' : cmd.slice(1);
        const r = await callAudioBackend(`/account/${op}`, {}, op === 'status' ? 'GET' : 'POST');
        const effect = cmd === '/disconnect' ? TELEGRAM_EFFECTS.thumbsDown : TELEGRAM_EFFECTS.heart;
        await sendEffectMessage(
          botToken,
          chatId,
          chatType,
          r.ok
            ? `${sc(`👤 Account ${op}:`)}\n\n<code>${escapeHtml(JSON.stringify(r.data, null, 2))}</code>`
            : getWorkerDiagnosticText(cmd),
          accountKeyboard(),
          effect,
        );
      } else {
        await sendEffectMessage(
          botToken,
          chatId,
          chatType,
          sc('Send /start for the control panel, /search <song> to pick a song, or paste a https://t.me/... Voice Chat link.'),
          mainKeyboard(isAdmin),
          TELEGRAM_EFFECTS.thumbsUp,
        );
      }
    }

    res.status(200).json({ ok: true });
  } catch (err) {
    console.error('Vercel webhook error:', err instanceof Error ? err.message : 'unknown');
    res.status(200).json({ ok: true });
  }
}

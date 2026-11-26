import crypto from 'node:crypto';
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { EQUALIZER_PRESETS, TELEGRAM_EFFECTS, sendEffectMessage } from '../lib/animations';
import { callAudioBackend } from '../lib/backendClient';
import {
  DIVIDER,
  KEYBOARDS,
  answerCallbackQuery,
  editMessageText,
  escapeHtml,
  formatBangladeshDateTime,
  sendMessage,
  sendPhoto,
  telegramRequest,
  toSmallCaps,
  type InlineKeyboardButton,
  type InlineKeyboardMarkup,
} from '../lib/telegram';

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

function applyFallbackVolume(chatId: number | string, op: string, messageText?: string): { volume: number; muted: boolean } {
  const key = String(chatId);
  const parsed = parseVolumeFromText(messageText);
  const next = {
    ...(chatVolumeFallback.get(key) ?? {
      volume: parsed.volume,
      muted: parsed.muted,
      previousVolume: parsed.volume,
    }),
  };
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

function verifySecret(header: string | string[] | undefined): boolean {
  const expected = process.env.TELEGRAM_WEBHOOK_SECRET || '';
  if (!expected) return true;
  if (typeof header !== 'string') return false;
  const a = Buffer.from(header, 'utf8');
  const b = Buffer.from(expected, 'utf8');
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

function constantTimeMatch(provided: string, expected: string): boolean {
  if (!provided || !expected) return false;
  const a = Buffer.from(provided, 'utf8');
  const b = Buffer.from(expected, 'utf8');
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

function getAllAdminIds(claimedOwnerId?: number | null): number[] {
  const ids = [process.env.TELEGRAM_OWNER_ID || '', process.env.TELEGRAM_ADMIN_IDS || '']
    .join(',')
    .split(/[\s,]+/)
    .map((v) => v.trim())
    .filter((v) => /^\d+$/.test(v))
    .map((v) => Number(v));
  if (claimedOwnerId && Number.isFinite(claimedOwnerId)) ids.push(claimedOwnerId);
  return Array.from(new Set(ids));
}

function isUserAdmin(userId?: number, claimedOwnerId?: number | null): boolean {
  return Boolean(userId && getAllAdminIds(claimedOwnerId).includes(userId));
}

function displayNameOf(u?: { first_name?: string; last_name?: string; username?: string }): string {
  if (!u) return 'Music Lover';
  const full = `${u.first_name || ''} ${u.last_name || ''}`.trim();
  return full || (u.username ? `@${u.username.replace(/^@/, '')}` : 'Music Lover');
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

async function trackUserState(user: TelegramUser, chatId: number) {
  const remote = await callAudioBackend<{ is_new: boolean; is_blocked: boolean; user: StoredUser } & BotConfigState>('/bot/track-user', {
    user_id: user.id,
    chat_id: chatId,
    first_name: user.first_name || '',
    last_name: user.last_name || '',
    username: user.username || '',
  });
  if (remote.ok && remote.data) return remote.data;

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
  return { is_new: isNew, is_blocked: record.is_blocked, user: record, ...refreshFallbackCounts() };
}

async function getBotConfig(): Promise<BotConfigState> {
  const remote = await callAudioBackend<BotConfigState>('/bot/config', {}, 'GET');
  return remote.ok && remote.data ? remote.data : refreshFallbackCounts();
}

async function setMaintenanceMode(enabled: boolean): Promise<BotConfigState> {
  const remote = await callAudioBackend<BotConfigState>('/bot/admin/maintenance', { enabled });
  if (remote.ok && remote.data) return remote.data;
  fallbackConfig.maintenance_mode = enabled;
  return refreshFallbackCounts();
}

async function listBotUsers(page = 0, limit = 5): Promise<{ users: StoredUser[]; page: number } & BotConfigState> {
  const remote = await callAudioBackend<{ users: StoredUser[]; page: number } & BotConfigState>(`/bot/admin/users?page=${page}&limit=${limit}`, {}, 'GET');
  if (remote.ok && remote.data) return remote.data;
  const all = Array.from(fallbackUsers.values()).sort((a, b) => b.joined_at.localeCompare(a.joined_at));
  return { users: all.slice(page * limit, page * limit + limit), page, ...refreshFallbackCounts() };
}

async function getBotUser(userId: number): Promise<StoredUser | null> {
  const remote = await callAudioBackend<{ user: StoredUser }>(`/bot/admin/user/${userId}`, {}, 'GET');
  return remote.ok && remote.data?.user ? remote.data.user : (fallbackUsers.get(userId) ?? null);
}

async function setBotUserBlocked(userId: number, blocked: boolean): Promise<StoredUser | null> {
  const remote = await callAudioBackend<{ user: StoredUser }>('/bot/admin/block', { user_id: userId, blocked });
  if (remote.ok && remote.data?.user) return remote.data.user;
  const existing = fallbackUsers.get(userId);
  if (!existing) return null;
  existing.is_blocked = blocked;
  fallbackUsers.set(userId, existing);
  refreshFallbackCounts();
  return existing;
}

async function getBroadcastTargets(): Promise<Array<{ user_id: number; chat_id: number }>> {
  const remote = await callAudioBackend<{ targets: Array<{ user_id: number; chat_id: number }> }>('/bot/admin/broadcast-targets', {}, 'GET');
  if (remote.ok && Array.isArray(remote.data?.targets)) return remote.data.targets;
  return Array.from(fallbackUsers.values())
    .filter((u) => !u.is_blocked)
    .map((u) => ({ user_id: u.user_id, chat_id: u.chat_id }));
}

async function claimAdminOwnership(userId: number): Promise<BotConfigState | null> {
  const remote = await callAudioBackend<BotConfigState>('/bot/admin/claim', { user_id: userId });
  if (remote.ok && remote.data) return remote.data;
  if (remote.configured && !remote.ok) return null;
  if (fallbackConfig.claimed_owner_id && fallbackConfig.claimed_owner_id !== userId) return null;
  fallbackConfig.claimed_owner_id = userId;
  return refreshFallbackCounts();
}

async function notifyAdminsNewUser(
  user: TelegramUser,
  chatId: number,
  totalUsers: number,
  claimedOwnerId: number | null,
): Promise<void> {
  const adminIds = getAllAdminIds(claimedOwnerId);
  if (adminIds.length === 0) return;
  const bd = formatBangladeshDateTime(new Date());
  const fullName = escapeHtml(displayNameOf(user));
  const handle = user.username ? `@${escapeHtml(user.username.replace(/^@/, ''))}` : toSmallCaps('No Username');
  const caption = [
    `🆕 <b>${toSmallCaps('NEW USER JOINED BOT')}</b>`,
    DIVIDER,
    '',
    `<blockquote>👤 <b>${toSmallCaps('NAME')}:</b> <a href="tg://user?id=${user.id}">${fullName}</a>\n🔗 <b>${toSmallCaps('USERNAME')}:</b> ${handle}\n🪪 <b>${toSmallCaps('CHAT ID')}:</b> <code>${chatId}</code>\n📅 <b>${toSmallCaps('DATE (BD)')}:</b> ${bd.dateStr}\n🕒 <b>${toSmallCaps('TIME (BD 12H)')}:</b> ${bd.timeStr}\n👥 <b>${toSmallCaps('TOTAL USERS')}:</b> #${totalUsers}</blockquote>`,
    '',
    `🔐 <b>${toSmallCaps('QUICK ADMIN ACTIONS')}:</b>`,
  ].join('\n');

  const markup: InlineKeyboardMarkup = {
    inline_keyboard: [
      [
        { text: toSmallCaps('🚫 Block User'), callback_data: `admin:block:${user.id}:0`, style: 'danger' },
        { text: toSmallCaps('👑 Admin Panel'), callback_data: 'menu:owner', style: 'primary' },
      ],
    ],
  };

  let photoFileId: string | undefined;
  try {
    const ph = await telegramRequest('getUserProfilePhotos', { user_id: user.id, limit: 1 });
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
        const r = await sendPhoto(adminId, photoFileId, caption, markup);
        if (r.ok) continue;
      }
      await sendMessage(adminId, caption, markup);
    } catch {
      // Non-fatal
    }
  }
}

function buildWelcomeText(options: {
  user?: TelegramUser;
  isAdmin: boolean;
  hasWorker: boolean;
  maintenanceMode: boolean;
}): string {
  const uid = options.user?.id ?? 0;
  const name = escapeHtml(displayNameOf(options.user));
  const status = options.isAdmin ? '👑 ᴀᴅᴍɪɴ' : '✅ ᴠᴇʀɪғɪᴇᴅ';
  const workerBadge = options.hasWorker ? '🟢 ʟɪɴᴋᴇᴅ' : '⚪ ᴘᴇɴᴅɪɴɢ';
  const maintRow =
    options.isAdmin && options.maintenanceMode
      ? `\n⚠️ <b>${toSmallCaps('BOT MODE')}:</b> 🔴 ${toSmallCaps('MAINTENANCE (OFF FOR USERS)')}`
      : '';
  return [
    `🎧 <b>${toSmallCaps('MUSIC SPAM BOT')}</b>`,
    DIVIDER,
    '',
    `👋 <b>${toSmallCaps('WELCOME')}, <a href="tg://user?id=${uid}">${name}</a>!</b>`,
    '',
    `<blockquote>🪪 <b>${toSmallCaps('USER ID')}:</b> <code>${uid}</code>\n🔗 <b>${toSmallCaps('STATUS')}:</b> ${status}\n🖥️ <b>${toSmallCaps('AUDIO WORKER')}:</b> ${workerBadge}\n⚡ <b>${toSmallCaps('ALERTS')}:</b> 🟢 ${toSmallCaps('ACTIVE')}${maintRow}</blockquote>`,
    '',
    `🎶 <b>${toSmallCaps('Stream HD music, auto-join live voice chats, boost ffmpeg volume 10%–200%, and control personal playback.')}</b>`,
    '',
    `🔐 <b>${toSmallCaps('SELECT AN OPTION BELOW')}:</b>`,
  ].join('\n');
}

function buildMaintenanceText(user?: TelegramUser): string {
  const uid = user?.id ?? 0;
  const name = escapeHtml(displayNameOf(user));
  const bd = formatBangladeshDateTime();
  return [
    `🛠️ <b>${toSmallCaps('MAINTENANCE MODE')}</b>`,
    DIVIDER,
    '',
    `👋 <b>${toSmallCaps('HELLO')}, <a href="tg://user?id=${uid}">${name}</a>!</b>`,
    '',
    `<blockquote>🚦 <b>${toSmallCaps('BOT STATUS')}:</b> 🔴 ${toSmallCaps('OFFLINE (MAINTENANCE)')}\n🪪 <b>${toSmallCaps('YOUR ID')}:</b> <code>${uid}</code>\n📅 <b>${toSmallCaps('DATE (BD)')}:</b> ${bd.dateStr}\n🕒 <b>${toSmallCaps('TIME (BD 12H)')}:</b> ${bd.timeStr}</blockquote>`,
    '',
    `⚙️ <b>${toSmallCaps('The bot is currently under scheduled maintenance and studio upgrades.')}</b>`,
    `✨ <i>${toSmallCaps('Please try again shortly — service will resume soon!')}</i>`,
  ].join('\n');
}

async function renderAdminPanelText(cfg: BotConfigState): Promise<string> {
  const st = await callAudioBackend<{ cpu_percent?: number; ram_percent?: number }>('/health', {}, 'GET');
  const bd = formatBangladeshDateTime();
  return [
    `👑 <b>${toSmallCaps('ADMIN CONTROL PANEL')}</b>`,
    DIVIDER,
    '',
    `<blockquote>🤖 <b>${toSmallCaps('BOT STATUS')}:</b> ${cfg.maintenance_mode ? '🔴 OFF (Maintenance)' : '🟢 ONLINE'}\n👥 <b>${toSmallCaps('TOTAL USERS')}:</b> <code>${cfg.total_users}</code> (✅ ${cfg.active_users} · 🚫 ${cfg.blocked_users})\n🎵 <b>${toSmallCaps('TOTAL PLAYS')}:</b> <code>${cfg.total_plays}</code>\n🖥️ <b>${toSmallCaps('AUDIO WORKER')}:</b> ${st.ok ? '🟢 Online' : st.configured ? '🔴 Offline' : '⚪ Not Linked'}${st.ok && st.data ? `\n⚡ <b>${toSmallCaps('CPU / RAM')}:</b> <code>${st.data.cpu_percent ?? 0}% / ${st.data.ram_percent ?? 0}%</code>` : ''}\n🕒 <b>${toSmallCaps('BD TIME (12H)')}:</b> ${bd.timeStr}</blockquote>`,
    '',
    `🔐 <b>${toSmallCaps('SELECT AN ADMIN ACTION')}:</b>`,
  ].join('\n');
}

function renderUserDetailCard(u: StoredUser): { text: string; markup: InlineKeyboardMarkup } {
  const bdJoined = formatBangladeshDateTime(u.joined_at);
  const bdSeen = formatBangladeshDateTime(u.last_seen_at);
  const name = escapeHtml(`${u.first_name} ${u.last_name}`.trim() || 'Telegram User');
  const handle = u.username ? `@${escapeHtml(u.username)}` : toSmallCaps('No Username');
  const text = [
    `👤 <b>${toSmallCaps('USER PROFILE & STATUS')}</b>`,
    DIVIDER,
    '',
    `<blockquote>📛 <b>${toSmallCaps('NAME')}:</b> <a href="tg://user?id=${u.user_id}">${name}</a>\n🔗 <b>${toSmallCaps('USERNAME')}:</b> ${handle}\n🪪 <b>${toSmallCaps('CHAT ID')}:</b> <code>${u.chat_id}</code>\n🚦 <b>${toSmallCaps('STATUS')}:</b> ${u.is_blocked ? '🚫 BLOCKED' : '✅ ACTIVE'}\n🎵 <b>${toSmallCaps('PLAYS')}:</b> <code>${u.plays_count}</code>\n📅 <b>${toSmallCaps('JOINED (BD)')}:</b> ${bdJoined.fullStr}\n🕒 <b>${toSmallCaps('LAST SEEN (BD)')}:</b> ${bdSeen.fullStr}</blockquote>`,
  ].join('\n');

  const markup: InlineKeyboardMarkup = {
    inline_keyboard: [
      [
        u.is_blocked
          ? { text: toSmallCaps('✅ Unblock User'), callback_data: `admin:unblock:${u.user_id}:0`, style: 'success' }
          : { text: toSmallCaps('🚫 Block User'), callback_data: `admin:block:${u.user_id}:0`, style: 'danger' },
      ],
      [
        { text: toSmallCaps('👥 Users List'), callback_data: 'admin:users:0', style: 'primary' },
        { text: toSmallCaps('👑 Admin Panel'), callback_data: 'menu:owner', style: 'primary' },
      ],
    ],
  };
  return { text, markup };
}

async function runBroadcast(messageText: string): Promise<{ sent: number; failed: number; total: number }> {
  const targets = await getBroadcastTargets();
  const formatted = [
    `📢 <b>${toSmallCaps('ANNOUNCEMENT')}</b>`,
    DIVIDER,
    '',
    `<blockquote>${escapeHtml(messageText)}</blockquote>`,
  ].join('\n');
  let sent = 0;
  let failed = 0;
  for (const t of targets) {
    try {
      const r = await sendMessage(t.chat_id, formatted);
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

function getWorkerDiagnosticText(actionLabel?: string): string {
  const hasApiCreds = Boolean(
    (process.env.TELEGRAM_API_ID || process.env.API_ID) &&
    (process.env.TELEGRAM_API_HASH || process.env.API_HASH),
  );
  const hasWorker = Boolean(process.env.AUDIO_BACKEND_URL && process.env.AUDIO_BACKEND_API_SECRET);
  return [
    actionLabel ? `⚡ <b>${toSmallCaps('ACTION')}:</b> ${escapeHtml(actionLabel)}` : '',
    `<blockquote>🤖 <b>${toSmallCaps('BOT WEBHOOK')}:</b> ✅ ${toSmallCaps('Online (Vercel)')}\n🔑 <b>${toSmallCaps('API ID / HASH')}:</b> ${hasApiCreds ? '✅ Found' : '⚪ Add in Vercel & Redeploy'}\n🖥️ <b>${toSmallCaps('AUDIO WORKER')}:</b> ${hasWorker ? '✅ Linked' : '❌ Not Linked Yet'}</blockquote>`,
    hasWorker
      ? toSmallCaps('Audio Worker is linked! Open https://<your-worker-url>/setup in Chrome if you still need OTP login, or tap Connect.')
      : [
          `ℹ️ <b>${toSmallCaps('Free Docker Audio Worker Setup (No VPS needed)')}:</b>`,
          `1️⃣ ${toSmallCaps('Deploy premium-music-bot/backend on Hugging Face Spaces (Docker) / Render / Koyeb')}`,
          `2️⃣ ${toSmallCaps('Set TELEGRAM_API_ID, TELEGRAM_API_HASH, TELEGRAM_BOT_TOKEN & AUDIO_BACKEND_API_SECRET')}`,
          `3️⃣ ${toSmallCaps('Open https://<your-worker-url>/setup in Chrome on your phone to sign in with OTP')}`,
          `4️⃣ ${toSmallCaps('Add AUDIO_BACKEND_URL & AUDIO_BACKEND_API_SECRET to Vercel & Redeploy.')}`,
        ].join('\n'),
  ]
    .filter(Boolean)
    .join('\n\n');
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method === 'GET') {
    const botToken = process.env.TELEGRAM_BOT_TOKEN || '';
    const botConfigured = Boolean(botToken);
    const audioWorkerConfigured = Boolean(process.env.AUDIO_BACKEND_URL && process.env.AUDIO_BACKEND_API_SECRET);
    const parsedUrl = new URL(req.url || '/api/webhook', 'https://localhost');
    const isSetup = parsedUrl.searchParams.get('setup') === '1';
    const isPing = isSetup || parsedUrl.searchParams.get('ping') === '1';

    let webhookUrl: string | undefined;
    let webhookUpdated = false;
    let audioWorkerOnline: boolean | undefined;

    if (isPing && botToken) {
      const host = (req.headers['x-forwarded-host'] || req.headers.host || '').toString().split(',')[0].trim();
      const targetUrl = host ? `https://${host}/api/webhook` : '';
      try {
        const infoRes = await fetch(`https://api.telegram.org/bot${botToken}/getWebhookInfo`);
        const infoJson = (await infoRes.json()) as { result?: { url?: string } };
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

    return res.status(200).json({
      ok: true,
      awake: true,
      service: 'premium-music-bot-vercel-webhook',
      botConfigured,
      audioWorkerConfigured,
      ...(webhookUrl !== undefined ? { webhookUrl, webhookUpdated } : {}),
      ...(audioWorkerOnline !== undefined ? { audioWorkerOnline } : {}),
    });
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ ok: false, error: 'Method Not Allowed' });
  }

  if (!verifySecret(req.headers['x-telegram-bot-api-secret-token'])) {
    return res.status(401).json({ ok: false, error: 'Unauthorized webhook secret' });
  }

  const update = req.body as TelegramUpdate;
  const hasWorker = Boolean(process.env.AUDIO_BACKEND_URL && process.env.AUDIO_BACKEND_API_SECRET);

  try {
    if (update.callback_query) {
      const cq = update.callback_query;
      const chatId = cq.message?.chat.id;
      const msgId = cq.message?.message_id;
      const chatType = cq.message?.chat.type || 'private';
      const data = cq.data || '';

      if (!chatId || !msgId) {
        await answerCallbackQuery(cq.id);
        return res.status(200).json({ ok: true });
      }

      const tracked = await trackUserState(cq.from, chatId);
      const isAdmin = isUserAdmin(cq.from.id, tracked.claimed_owner_id);

      if (tracked.is_new) {
        await notifyAdminsNewUser(cq.from, chatId, tracked.total_users, tracked.claimed_owner_id);
      }

      if (!isAdmin && tracked.is_blocked) {
        await answerCallbackQuery(cq.id, 'Access Restricted: You have been blocked by Admin.', true);
        return res.status(200).json({ ok: true });
      }

      if (!isAdmin && (data === 'menu:owner' || data.startsWith('admin:') || data.startsWith('owner:'))) {
        await answerCallbackQuery(cq.id, '⛔ Access Denied — Admin Only!', true);
        return res.status(200).json({ ok: true });
      }

      if (!isAdmin && tracked.maintenance_mode) {
        await answerCallbackQuery(cq.id, '🛠️ Bot is currently under maintenance. Please wait.', true);
        await editMessageText(chatId, msgId, buildMaintenanceText(cq.from), {
          inline_keyboard: [[{ text: toSmallCaps('🔄 Check Status'), callback_data: 'menu:start', style: 'primary' }]],
        });
        return res.status(200).json({ ok: true });
      }

      if (data === 'menu:start') {
        await answerCallbackQuery(cq.id);
        await editMessageText(
          chatId,
          msgId,
          buildWelcomeText({ user: cq.from, isAdmin, hasWorker, maintenanceMode: tracked.maintenance_mode }),
          KEYBOARDS.mainMenu(isAdmin),
        );
      } else if (data === 'menu:play') {
        await answerCallbackQuery(cq.id, 'Opening Studio Deck...');
        const guide = [
          `🎵 <b>${toSmallCaps('HOW TO SELECT & PLAY MUSIC')}</b>`,
          DIVIDER,
          '',
          `<blockquote>1️⃣ <b>${toSmallCaps('SEARCH & PICK')}:</b> <code>/search Kesariya</code>\n2️⃣ <b>${toSmallCaps('INSTANT PLAY')}:</b> <code>/play Faded Alan Walker</code>\n3️⃣ <b>${toSmallCaps('LINK / AUDIO')}:</b> ${toSmallCaps('Send a YouTube, SoundCloud, or MP3 file directly.')}</blockquote>`,
        ].join('\n');
        await sendEffectMessage(chatId, chatType, guide, KEYBOARDS.player(false), TELEGRAM_EFFECTS.fire, EQUALIZER_PRESETS.playMusic, 180);
      } else if (data.startsWith('pick:')) {
        const rawRef = data.slice(5);
        const source = rawRef.startsWith('yt:') ? `https://www.youtube.com/watch?v=${rawRef.slice(3)}` : rawRef;
        await answerCallbackQuery(cq.id, hasWorker ? 'Playing selected track...' : 'Audio Worker not linked yet!', !hasWorker);
        const pRes = await callAudioBackend<{ title?: string }>('/player/play', {
          chat_id: chatId,
          source,
          requested_by: cq.from.username || cq.from.first_name || 'User',
        });
        if (pRes.ok) await callAudioBackend('/bot/stats/play', { user_id: cq.from.id }).catch(() => undefined);
        const text = pRes.ok
          ? `🎧 <b>${toSmallCaps('NOW PLAYING')}</b>\n${DIVIDER}\n\n<blockquote>🎵 <b>${toSmallCaps('SONG')}:</b> ${escapeHtml(String(pRes.data?.title || source))}\n▶️ <b>${toSmallCaps('STATUS')}:</b> ${toSmallCaps('Playing')}</blockquote>`
          : `❌ ${escapeHtml(String(pRes.error || 'Error'))}`;
        await sendEffectMessage(chatId, chatType, text, KEYBOARDS.player(pRes.ok), TELEGRAM_EFFECTS.fire, EQUALIZER_PRESETS.playMusic, 180);
      } else if (data === 'menu:player' || data === 'menu:nowplaying' || data === 'menu:queue') {
        await answerCallbackQuery(cq.id);
        const st = await callAudioBackend<{
          title?: string; artist?: string; position?: number; duration?: number;
          volume?: number; muted?: boolean; status?: string; chat_title?: string;
        }>(`/player/status?chat_id=${chatId}`, {}, 'GET');
        if (!st.ok || !st.data) {
          await editMessageText(chatId, msgId, `🎧 <b>${toSmallCaps('MUSIC PLAYER')}</b>\n${DIVIDER}\n\n${getWorkerDiagnosticText('Music Player')}`, KEYBOARDS.mainMenu(isAdmin));
        } else {
          const d = st.data;
          const text = d.title
            ? [
                `🎧 <b>${toSmallCaps('NOW PLAYING')}</b>`,
                DIVIDER,
                '',
                `<blockquote>🎵 <b>${toSmallCaps('SONG')}:</b> ${escapeHtml(d.title)}\n👤 <b>${toSmallCaps('ARTIST')}:</b> ${escapeHtml(d.artist || 'Unknown')}\n⏱️ <b>${toSmallCaps('DURATION')}:</b> <code>${d.position ?? 0}s / ${d.duration ?? 0}s</code>\n🔊 <b>${toSmallCaps('VOLUME')}:</b> <code>${d.muted ? 'Muted' : `${d.volume ?? 80}%`}</code>\n▶️ <b>${toSmallCaps('STATUS')}:</b> ${escapeHtml(d.status || 'Playing')}</blockquote>`,
                '',
                `<code>${buildProgressBar(d.position ?? 0, d.duration ?? 100)}</code>`,
              ].join('\n')
            : `🎧 <b>${toSmallCaps('MUSIC PLAYER')}</b>\n${DIVIDER}\n\n<blockquote>💤 ${toSmallCaps('No active track. Send /search <song> or /play <url>.')}</blockquote>`;
          await editMessageText(chatId, msgId, text, KEYBOARDS.player(d.status === 'playing'));
        }
      } else if (data === 'menu:volume') {
        await answerCallbackQuery(cq.id);
        const volRes = await callAudioBackend<{ volume: number; muted: boolean }>(`/volume/status?chat_id=${chatId}`, {}, 'GET');
        const fallback = chatVolumeFallback.get(String(chatId)) ?? { volume: 80, muted: false };
        const vol = volRes.ok && volRes.data ? clampVol(volRes.data.volume) : fallback.volume;
        const muted = volRes.ok && volRes.data ? Boolean(volRes.data.muted) : fallback.muted;
        const vText = `🎚️ <b>${toSmallCaps('VOLUME CONTROL')}</b>\n${DIVIDER}\n\n<blockquote>🔊 <b>${toSmallCaps('GAIN')}:</b> <code>&lt;  ${muted ? '🔇 Muted' : `🔊 ${vol}%`}  &gt;</code>\n⚡ <b>${toSmallCaps('RANGE')}:</b> 10% – 200% (FFmpeg Real-Time)</blockquote>`;
        await sendEffectMessage(chatId, chatType, vText, KEYBOARDS.volume(), TELEGRAM_EFFECTS.fire, EQUALIZER_PRESETS.volume);
      } else if (data.startsWith('vol:')) {
        const action = data.slice(4);
        const isNumericPreset = /^\d+$/.test(action);
        const resVol = isNumericPreset
          ? await callAudioBackend<{ volume: number; muted: boolean }>('/volume/set', { chat_id: chatId, volume: clampVol(Number(action)) })
          : await callAudioBackend<{ volume: number; muted: boolean }>('/volume/adjust', { chat_id: chatId, action });
        const nextVol =
          resVol.ok && resVol.data
            ? { volume: clampVol(resVol.data.volume), muted: Boolean(resVol.data.muted) }
            : applyFallbackVolume(chatId, action, cq.message?.text);
        await answerCallbackQuery(cq.id, nextVol.muted ? 'Audio Muted' : `Volume: ${nextVol.volume}% (10%–200%)`);
        const vText = `🎚️ <b>${toSmallCaps('VOLUME CONTROL')}</b>\n${DIVIDER}\n\n<blockquote>🔊 <b>${toSmallCaps('GAIN')}:</b> <code>&lt;  ${nextVol.muted ? '🔇 Muted' : `🔊 ${nextVol.volume}%`}  &gt;</code>\n⚡ <b>${toSmallCaps('RANGE')}:</b> 10% – 200% (FFmpeg Real-Time)</blockquote>`;
        await editMessageText(chatId, msgId, vText, KEYBOARDS.volume());
      } else if (data.startsWith('player:')) {
        const action = data.slice(7);
        const pRes = await callAudioBackend<{ status?: string; title?: string }>(`/player/${action}`, { chat_id: chatId });
        await answerCallbackQuery(cq.id, pRes.ok ? `Playback: ${action.toUpperCase()}` : pRes.error, !pRes.ok);
        const text = pRes.ok ? `🎧 <b>${toSmallCaps('PLAYBACK')}:</b> ${action.toUpperCase()}` : `🎧 <b>${toSmallCaps('PLAYBACK')}</b>\n${DIVIDER}\n\n${getWorkerDiagnosticText()}`;
        await editMessageText(chatId, msgId, text, KEYBOARDS.player(action === 'resume'));
      } else if (data === 'menu:live' || data === 'live:join_hint') {
        await answerCallbackQuery(
          cq.id,
          data === 'live:join_hint' ? 'Paste any https://t.me/group_name link in chat to auto-join!' : undefined,
          data === 'live:join_hint',
        );
        const lRes = await callAudioBackend<{ active: boolean; group_title?: string }>('/live/status', {}, 'GET');
        const text = lRes.ok && lRes.data?.active
          ? `🎤 <b>${toSmallCaps('LIVE CONNECTED')}</b>\n${DIVIDER}\n\n<blockquote>✅ ${toSmallCaps('Personal Account: Connected')}\n🎧 ${toSmallCaps('Voice Chat: Active')} (${escapeHtml(lRes.data.group_title || 'Group')})</blockquote>`
          : `🎤 <b>${toSmallCaps('LIVE CONTROL PANEL')}</b>\n${DIVIDER}\n\n<blockquote>${toSmallCaps('Send /joinlive https://t.me/group/123 (or paste link directly).')}</blockquote>${hasWorker ? '' : `\n\n${getWorkerDiagnosticText('Auto Live Join')}`}`;
        await editMessageText(chatId, msgId, text, KEYBOARDS.live());
      } else if (data === 'live:leave') {
        const lRes = await callAudioBackend('/live/leave', { chat_id: chatId });
        await answerCallbackQuery(cq.id, lRes.ok ? 'Left Voice Chat cleanly.' : lRes.error, !lRes.ok);
        await editMessageText(chatId, msgId, lRes.ok ? `🚪 ${toSmallCaps('Left Voice Chat cleanly.')}` : getWorkerDiagnosticText('Leave Live'), KEYBOARDS.live());
      } else if (data === 'menu:account' || data.startsWith('account:')) {
        const op = data === 'menu:account' ? 'status' : data.slice(8);
        const aRes = await callAudioBackend<{ display_name?: string; username?: string; status?: string }>(`/account/${op}`, {}, op === 'status' ? 'GET' : 'POST');
        await answerCallbackQuery(cq.id, op === 'status' ? undefined : aRes.ok ? `Account ${op} completed.` : 'Audio Worker not linked yet!', op !== 'status' && !aRes.ok);
        const text = aRes.ok && aRes.data
          ? `👤 <b>${toSmallCaps('PERSONAL ACCOUNT')}</b>\n${DIVIDER}\n\n<blockquote>📛 <b>${toSmallCaps('NAME')}:</b> ${escapeHtml(aRes.data.display_name || 'Connected')}\n🔗 <b>${toSmallCaps('USERNAME')}:</b> ${escapeHtml(aRes.data.username || '@account')}\n⚡ <b>${toSmallCaps('STATUS')}:</b> ${escapeHtml((aRes.data.status || 'connected').toUpperCase())}</blockquote>`
          : `👤 <b>${toSmallCaps('PERSONAL ACCOUNT CONTROL')}</b>\n${DIVIDER}\n\n${getWorkerDiagnosticText(`Account ${op.toUpperCase()}`)}`;
        await editMessageText(chatId, msgId, text, KEYBOARDS.account());
      } else if (data === 'menu:owner') {
        await answerCallbackQuery(cq.id);
        pendingAdminInput.delete(cq.from.id);
        const cfg = await getBotConfig();
        await editMessageText(chatId, msgId, await renderAdminPanelText(cfg), KEYBOARDS.adminPanel(cfg.maintenance_mode));
      } else if (data === 'admin:toggle_maintenance') {
        const current = await getBotConfig();
        const nextCfg = await setMaintenanceMode(!current.maintenance_mode);
        await answerCallbackQuery(cq.id, nextCfg.maintenance_mode ? '🔴 Bot turned OFF (Maintenance)' : '🟢 Bot turned ON (Live)', true);
        await editMessageText(chatId, msgId, await renderAdminPanelText(nextCfg), KEYBOARDS.adminPanel(nextCfg.maintenance_mode));
      } else if (data.startsWith('admin:users:')) {
        await answerCallbackQuery(cq.id);
        const page = Number(data.split(':')[2] || 0);
        const listRes = await listBotUsers(page, 5);
        const totalPages = Math.max(1, Math.ceil(listRes.total_users / 5));
        const lines = listRes.users.map((u) => {
          const bd = formatBangladeshDateTime(u.joined_at);
          return `${u.is_blocked ? '🚫' : '✅'} <b>${escapeHtml(`${u.first_name} ${u.last_name}`.trim() || 'User')}</b> · <code>${u.user_id}</code> · 🕒 ${bd.timeStr}`;
        });
        const rows: InlineKeyboardButton[][] = listRes.users.map((u) => [
          { text: `${u.is_blocked ? '🚫' : '✅'} ${(u.first_name || 'User').slice(0, 18)} (${u.user_id})`, callback_data: `admin:user:${u.user_id}:${page}`, style: u.is_blocked ? 'danger' : 'primary' },
        ]);
        const nav: InlineKeyboardButton[] = [];
        if (page > 0) nav.push({ text: '⬅️ Prev', callback_data: `admin:users:${page - 1}`, style: 'primary' });
        if ((page + 1) * 5 < listRes.total_users) nav.push({ text: 'Next ➡️', callback_data: `admin:users:${page + 1}`, style: 'primary' });
        if (nav.length) rows.push(nav);
        rows.push([{ text: toSmallCaps('🔙 Admin Panel'), callback_data: 'menu:owner', style: 'primary' }]);
        await editMessageText(chatId, msgId, `👥 <b>${toSmallCaps('USER MANAGEMENT')}</b> (${page + 1}/${totalPages})\n${DIVIDER}\n\n<blockquote>${lines.join('\n\n') || toSmallCaps('No users yet.')}</blockquote>`, { inline_keyboard: rows });
      } else if (data.startsWith('admin:user:') || data.startsWith('admin:block:') || data.startsWith('admin:unblock:')) {
        const parts = data.split(':');
        const op = parts[1];
        const targetId = Number(parts[2]);
        let user: StoredUser | null = null;
        if (op === 'block') {
          if (isUserAdmin(targetId, tracked.claimed_owner_id)) {
            await answerCallbackQuery(cq.id, 'Cannot block an Admin!', true);
            return res.status(200).json({ ok: true });
          }
          user = await setBotUserBlocked(targetId, true);
          await answerCallbackQuery(cq.id, '🚫 User Blocked!');
        } else if (op === 'unblock') {
          user = await setBotUserBlocked(targetId, false);
          await answerCallbackQuery(cq.id, '✅ User Unblocked!');
        } else {
          await answerCallbackQuery(cq.id);
          user = await getBotUser(targetId);
        }
        if (!user) {
          await editMessageText(chatId, msgId, `❌ ${toSmallCaps('User not found.')}`, KEYBOARDS.adminPanel(tracked.maintenance_mode));
        } else {
          const card = renderUserDetailCard(user);
          await editMessageText(chatId, msgId, card.text, card.markup);
        }
      } else if (data === 'admin:broadcast_prompt') {
        await answerCallbackQuery(cq.id);
        pendingAdminInput.set(cq.from.id, 'broadcast');
        await editMessageText(
          chatId,
          msgId,
          `📢 <b>${toSmallCaps('BROADCAST SYSTEM')}</b>\n${DIVIDER}\n\n<blockquote>📨 <b>${toSmallCaps('ACTIVE USERS')}:</b> <code>${tracked.active_users}</code>\n👉 ${toSmallCaps('Send your announcement message now, or type /broadcast <message>.')}</blockquote>`,
          { inline_keyboard: [[{ text: toSmallCaps('❌ Cancel'), callback_data: 'menu:owner', style: 'danger' }]] },
        );
      } else if (data === 'admin:lookup_prompt') {
        await answerCallbackQuery(cq.id);
        pendingAdminInput.set(cq.from.id, 'lookup');
        await editMessageText(
          chatId,
          msgId,
          `🔍 <b>${toSmallCaps('CHECK USER STATUS')}</b>\n${DIVIDER}\n\n<blockquote>🪪 ${toSmallCaps('Send the numeric User ID now, or type /user <id>.')}</blockquote>`,
          { inline_keyboard: [[{ text: toSmallCaps('❌ Cancel'), callback_data: 'menu:owner', style: 'danger' }]] },
        );
      } else if (data === 'menu:help') {
        await answerCallbackQuery(cq.id);
        await editMessageText(
          chatId,
          msgId,
          `📚 <b>${toSmallCaps('COMMAND REFERENCE')}</b>\n${DIVIDER}\n\n<blockquote>/start /search /play /pause /resume /skip /stop /queue /nowplaying /volume /mute /unmute /joinlive /leavelive /live /account /connect /disconnect /reconnect /ping</blockquote>`,
          KEYBOARDS.mainMenu(isAdmin),
        );
      } else {
        await answerCallbackQuery(cq.id);
      }
      return res.status(200).json({ ok: true });
    }

    if (update.message) {
      const msg = update.message;
      const chatId = msg.chat.id;
      const chatType = msg.chat.type || 'private';
      const text = (msg.text || '').trim();
      const [rawCmd, ...rest] = text.split(/\s+/);
      const cmd = rawCmd.toLowerCase().split('@')[0];
      const arg = rest.join(' ').trim();
      const audioDoc =
        msg.document &&
        (msg.document.mime_type?.startsWith('audio/') ||
          /\.(mp3|m4a|ogg|wav|flac|aac)$/i.test(msg.document.file_name || ''))
          ? msg.document
          : undefined;

      if (cmd === '/claimadmin' && msg.from?.id && chatType === 'private') {
        await telegramRequest('deleteMessage', { chat_id: chatId, message_id: msg.message_id }).catch(() => undefined);
        const secretValid =
          constantTimeMatch(arg, process.env.AUDIO_BACKEND_API_SECRET || '') ||
          constantTimeMatch(arg, process.env.TELEGRAM_WEBHOOK_SECRET || '');
        if (!secretValid) {
          await sendEffectMessage(chatId, chatType, `⛔ <b>${toSmallCaps('Invalid admin claim secret.')}</b>`, KEYBOARDS.mainMenu(false), TELEGRAM_EFFECTS.thumbsDown);
          return res.status(200).json({ ok: true });
        }
        const claimed = await claimAdminOwnership(msg.from.id);
        await sendEffectMessage(
          chatId,
          chatType,
          claimed
            ? `👑 <b>${toSmallCaps('Admin Ownership Verified!')}</b>\n${DIVIDER}\n\n<blockquote>🪪 <code>${msg.from.id}</code>\n✅ ${toSmallCaps('Send /start to access Admin Panel.')}</blockquote>`
            : `⛔ <b>${toSmallCaps('Admin ownership already claimed.')}</b>`,
          KEYBOARDS.mainMenu(Boolean(claimed)),
          claimed ? TELEGRAM_EFFECTS.confetti : TELEGRAM_EFFECTS.thumbsDown,
        );
        return res.status(200).json({ ok: true });
      }

      const tracked = msg.from
        ? await trackUserState(msg.from, chatId)
        : { is_new: false, is_blocked: false, ...(await getBotConfig()) };
      const isAdmin = isUserAdmin(msg.from?.id, tracked.claimed_owner_id);

      if (msg.from && tracked.is_new) {
        await notifyAdminsNewUser(msg.from, chatId, tracked.total_users, tracked.claimed_owner_id);
      }

      if (!isAdmin && tracked.is_blocked) {
        await sendEffectMessage(
          chatId,
          chatType,
          `🚫 <b>${toSmallCaps('ACCESS RESTRICTED')}</b>\n${DIVIDER}\n\n<blockquote>⛔ ${toSmallCaps('You have been blocked by Admin.')}</blockquote>`,
          undefined,
          TELEGRAM_EFFECTS.thumbsDown,
        );
        return res.status(200).json({ ok: true });
      }

      if (isAdmin && msg.from && text && !text.startsWith('/')) {
        const pending = pendingAdminInput.get(msg.from.id);
        if (pending === 'broadcast') {
          pendingAdminInput.delete(msg.from.id);
          const result = await runBroadcast(text);
          await sendEffectMessage(
            chatId,
            chatType,
            `📢 <b>${toSmallCaps('BROADCAST COMPLETE')}</b>\n${DIVIDER}\n\n<blockquote>✅ ${result.sent} · ❌ ${result.failed} · 👥 ${result.total}</blockquote>`,
            KEYBOARDS.adminPanel(tracked.maintenance_mode),
            TELEGRAM_EFFECTS.confetti,
          );
          return res.status(200).json({ ok: true });
        }
        if (pending === 'lookup') {
          pendingAdminInput.delete(msg.from.id);
          const found = await getBotUser(Number(text.replace(/\D/g, '')));
          if (!found) {
            await sendEffectMessage(chatId, chatType, `❌ ${toSmallCaps('User not found.')}`, KEYBOARDS.adminPanel(tracked.maintenance_mode), TELEGRAM_EFFECTS.thumbsDown);
          } else {
            const card = renderUserDetailCard(found);
            await sendEffectMessage(chatId, chatType, card.text, card.markup, TELEGRAM_EFFECTS.thumbsUp);
          }
          return res.status(200).json({ ok: true });
        }
      }

      const adminCmds = ['/admin', '/owner', '/stats', '/status', '/users', '/user', '/block', '/unblock', '/broadcast', '/maintenance', '/boton', '/botoff'];
      if (!isAdmin && adminCmds.includes(cmd)) {
        await sendEffectMessage(chatId, chatType, `⛔ <b>${toSmallCaps('ACCESS DENIED — ADMIN ONLY')}</b>`, KEYBOARDS.mainMenu(false), TELEGRAM_EFFECTS.thumbsDown);
        return res.status(200).json({ ok: true });
      }

      if (!isAdmin && tracked.maintenance_mode) {
        await sendEffectMessage(
          chatId,
          chatType,
          buildMaintenanceText(msg.from),
          { inline_keyboard: [[{ text: toSmallCaps('🔄 Check Status'), callback_data: 'menu:start', style: 'primary' }]] },
          TELEGRAM_EFFECTS.thumbsDown,
        );
        return res.status(200).json({ ok: true });
      }

      if (cmd === '/start') {
        await sendEffectMessage(
          chatId,
          chatType,
          buildWelcomeText({ user: msg.from, isAdmin, hasWorker, maintenanceMode: tracked.maintenance_mode }),
          KEYBOARDS.mainMenu(isAdmin),
          TELEGRAM_EFFECTS.confetti,
          EQUALIZER_PRESETS.welcome,
        );
      } else if (cmd === '/admin' || cmd === '/owner' || cmd === '/stats' || cmd === '/status') {
        const cfg = await getBotConfig();
        await sendEffectMessage(chatId, chatType, await renderAdminPanelText(cfg), KEYBOARDS.adminPanel(cfg.maintenance_mode), TELEGRAM_EFFECTS.confetti);
      } else if (cmd === '/maintenance' || cmd === '/boton' || cmd === '/botoff') {
        const nextVal = cmd === '/botoff' ? true : cmd === '/boton' ? false : arg.toLowerCase() === 'on' ? true : arg.toLowerCase() === 'off' ? false : !tracked.maintenance_mode;
        const cfg = await setMaintenanceMode(nextVal);
        await sendEffectMessage(chatId, chatType, await renderAdminPanelText(cfg), KEYBOARDS.adminPanel(cfg.maintenance_mode), cfg.maintenance_mode ? TELEGRAM_EFFECTS.thumbsDown : TELEGRAM_EFFECTS.confetti);
      } else if (cmd === '/broadcast') {
        if (!arg) {
          if (msg.from) pendingAdminInput.set(msg.from.id, 'broadcast');
          await sendEffectMessage(chatId, chatType, `📢 ${toSmallCaps('Send your broadcast message now, or type /broadcast <message>.')}`, KEYBOARDS.adminPanel(tracked.maintenance_mode), TELEGRAM_EFFECTS.thumbsUp);
        } else {
          const result = await runBroadcast(arg);
          await sendEffectMessage(chatId, chatType, `📢 <b>${toSmallCaps('BROADCAST COMPLETE')}</b>\n${DIVIDER}\n\n<blockquote>✅ ${result.sent} · ❌ ${result.failed} · 👥 ${result.total}</blockquote>`, KEYBOARDS.adminPanel(tracked.maintenance_mode), TELEGRAM_EFFECTS.confetti);
        }
      } else if (cmd === '/users' || cmd === '/user' || cmd === '/block' || cmd === '/unblock') {
        if (cmd === '/users') {
          const listRes = await listBotUsers(0, 5);
          const rows: InlineKeyboardButton[][] = listRes.users.map((u) => [
            { text: `${u.is_blocked ? '🚫' : '✅'} ${(u.first_name || 'User').slice(0, 18)} (${u.user_id})`, callback_data: `admin:user:${u.user_id}:0`, style: u.is_blocked ? 'danger' : 'primary' },
          ]);
          rows.push([{ text: toSmallCaps('🔙 Admin Panel'), callback_data: 'menu:owner', style: 'primary' }]);
          await sendEffectMessage(chatId, chatType, `👥 <b>${toSmallCaps('USER MANAGEMENT')}</b> (${listRes.total_users})`, { inline_keyboard: rows }, TELEGRAM_EFFECTS.thumbsUp);
        } else {
          const targetId = Number(arg.replace(/\D/g, ''));
          if (!targetId) {
            await sendEffectMessage(chatId, chatType, `❌ ${toSmallCaps(`Usage: ${cmd} <user_id>`)}`, KEYBOARDS.adminPanel(tracked.maintenance_mode), TELEGRAM_EFFECTS.thumbsDown);
          } else if (cmd === '/block' && isUserAdmin(targetId, tracked.claimed_owner_id)) {
            await sendEffectMessage(chatId, chatType, `⛔ ${toSmallCaps('Cannot block an Admin.')}`, KEYBOARDS.adminPanel(tracked.maintenance_mode), TELEGRAM_EFFECTS.thumbsDown);
          } else {
            const u = cmd === '/user' ? await getBotUser(targetId) : await setBotUserBlocked(targetId, cmd === '/block');
            if (!u) await sendEffectMessage(chatId, chatType, `❌ ${toSmallCaps('User not found.')}`, KEYBOARDS.adminPanel(tracked.maintenance_mode), TELEGRAM_EFFECTS.thumbsDown);
            else {
              const card = renderUserDetailCard(u);
              await sendEffectMessage(chatId, chatType, card.text, card.markup, TELEGRAM_EFFECTS.thumbsUp);
            }
          }
        }
      } else if (cmd === '/joinlive' || text.includes('t.me/') || text.includes('telegram.me/')) {
        const link = cmd === '/joinlive' ? arg : text;
        if (!link) {
          await sendMessage(chatId, `❌ ${toSmallCaps('Invalid Live Link\nUsage: /joinlive https://t.me/example_group/123')}`);
        } else {
          const joinRes = await callAudioBackend<{ group_title?: string }>('/live/join', { link, chat_id: chatId, requested_by: msg.from?.id });
          const finalText = joinRes.ok
            ? `🎤 <b>${toSmallCaps('LIVE CONNECTED')}</b>\n${DIVIDER}\n\n<blockquote>✅ ${toSmallCaps('Personal Account: Connected')}\n🎧 ${toSmallCaps('Voice Chat: Active')}\n📍 ${escapeHtml(joinRes.data?.group_title || link)}</blockquote>`
            : `❌ <b>${toSmallCaps('AUTO LIVE JOIN FAILED')}</b>\n${DIVIDER}\n\n${hasWorker ? escapeHtml(String(joinRes.error || '')) : getWorkerDiagnosticText('Auto Live Join')}`;
          await sendEffectMessage(chatId, chatType, finalText, KEYBOARDS.live(), TELEGRAM_EFFECTS.heart, EQUALIZER_PRESETS.joinLive);
        }
      } else if (cmd === '/search') {
        if (!arg) {
          await sendEffectMessage(chatId, chatType, `🔍 ${toSmallCaps('Usage: /search <song name>')}`, KEYBOARDS.mainMenu(isAdmin), TELEGRAM_EFFECTS.fire);
        } else {
          const sRes = await callAudioBackend<{ results?: Array<{ id?: string; title?: string; url?: string }> }>('/player/search', { query: arg, limit: 5 });
          const results = sRes.data?.results || [];
          if (!sRes.ok || results.length === 0) {
            await sendEffectMessage(chatId, chatType, hasWorker ? `❌ ${toSmallCaps(`No tracks found for "${arg}".`)}` : getWorkerDiagnosticText('Music Search'), KEYBOARDS.mainMenu(isAdmin), TELEGRAM_EFFECTS.fire, EQUALIZER_PRESETS.searchMusic);
          } else {
            const markup: InlineKeyboardMarkup = {
              inline_keyboard: [
                ...results.slice(0, 5).map((item, idx) => [
                  { text: `${idx + 1}. 🎵 ${toSmallCaps(String(item.title || 'Track').slice(0, 42))}`, callback_data: `pick:${item.id ? `yt:${item.id}` : String(item.url || '').slice(0, 56)}`, style: 'success' as const },
                ]),
                [{ text: toSmallCaps('🔙 Main Menu'), callback_data: 'menu:start', style: 'primary' as const }],
              ],
            };
            await sendEffectMessage(chatId, chatType, `🔍 <b>${toSmallCaps('SELECT MUSIC FOR')}:</b> <code>${escapeHtml(arg)}</code>`, markup, TELEGRAM_EFFECTS.fire, EQUALIZER_PRESETS.searchMusic);
          }
        }
      } else if (
        cmd === '/play' ||
        msg.audio ||
        msg.voice ||
        audioDoc ||
        isMediaUrl(text) ||
        (text.length > 0 && !text.startsWith('/'))
      ) {
        const query = msg.audio
          ? `tg_file:${msg.audio.file_id}`
          : msg.voice
            ? `tg_file:${msg.voice.file_id}`
            : audioDoc
              ? `tg_file:${audioDoc.file_id}`
              : cmd === '/play'
                ? arg
                : text;
        if (!query) {
          await sendEffectMessage(chatId, chatType, `🎵 ${toSmallCaps('Provide a song name, URL, or audio file: /play <song>')}`, KEYBOARDS.mainMenu(isAdmin), TELEGRAM_EFFECTS.fire, EQUALIZER_PRESETS.playMusic, 180);
        } else {
          const pRes = await callAudioBackend<{ title?: string }>('/player/play', {
            chat_id: chatId,
            source: query,
            requested_by: msg.from?.username || msg.from?.first_name || 'User',
          });
          if (pRes.ok && msg.from?.id) await callAudioBackend('/bot/stats/play', { user_id: msg.from.id }).catch(() => undefined);
          const finalText = pRes.ok
            ? `🎧 <b>${toSmallCaps('NOW PLAYING')}</b>\n${DIVIDER}\n\n<blockquote>🎵 <b>${toSmallCaps('SONG')}:</b> ${escapeHtml(String(pRes.data?.title || query))}\n▶️ <b>${toSmallCaps('STATUS')}:</b> ${toSmallCaps('Playing')}</blockquote>`
            : `❌ <b>${toSmallCaps('CANNOT PLAY MUSIC')}</b>\n${DIVIDER}\n\n${hasWorker ? escapeHtml(String(pRes.error || '')) : getWorkerDiagnosticText('Play Music')}`;
          await sendEffectMessage(chatId, chatType, finalText, KEYBOARDS.player(pRes.ok), TELEGRAM_EFFECTS.fire, EQUALIZER_PRESETS.playMusic, 180);
        }
      } else if (cmd === '/volume') {
        const cleanedArg = arg.replace('%', '').trim();
        const hasVolArg = cleanedArg.length > 0 && Number.isFinite(Number(cleanedArg));
        const targetVol = hasVolArg ? clampVol(Number(cleanedArg)) : undefined;
        const vRes = targetVol !== undefined
          ? await callAudioBackend<{ volume: number; muted?: boolean }>('/volume/set', { chat_id: chatId, volume: targetVol })
          : await callAudioBackend<{ volume: number; muted?: boolean }>(`/volume/status?chat_id=${chatId}`, {}, 'GET');
        const nextVol =
          vRes.ok && vRes.data
            ? { volume: clampVol(vRes.data.volume), muted: Boolean(vRes.data.muted) }
            : targetVol !== undefined
              ? applyFallbackVolume(chatId, String(targetVol))
              : (chatVolumeFallback.get(String(chatId)) ?? { volume: 80, muted: false });
        await sendEffectMessage(
          chatId,
          chatType,
          `🎚️ <b>${toSmallCaps('VOLUME CONTROL')}</b>\n${DIVIDER}\n\n<blockquote>🔊 <b>${toSmallCaps('GAIN')}:</b> <code>&lt;  ${nextVol.muted ? '🔇 Muted' : `🔊 ${nextVol.volume}%`}  &gt;</code>\n⚡ <b>${toSmallCaps('RANGE')}:</b> 10% – 200% (FFmpeg Real-Time)</blockquote>`,
          KEYBOARDS.volume(),
          TELEGRAM_EFFECTS.fire,
          EQUALIZER_PRESETS.volume,
        );
      } else if (['/pause', '/resume', '/skip', '/stop'].includes(cmd)) {
        const action = cmd.slice(1);
        const r = await callAudioBackend(`/player/${action}`, { chat_id: chatId });
        await sendEffectMessage(chatId, chatType, r.ok ? `🎧 ${action.toUpperCase()} ${toSmallCaps('executed.')}` : `❌ ${escapeHtml(String(r.error || 'Error'))}`, KEYBOARDS.player(action === 'resume'), action === 'stop' ? TELEGRAM_EFFECTS.thumbsDown : TELEGRAM_EFFECTS.fire);
      } else if (cmd === '/leavelive') {
        const r = await callAudioBackend('/live/leave', { chat_id: chatId });
        await sendEffectMessage(chatId, chatType, r.ok ? `🚪 ${toSmallCaps('Left Voice Chat.')}` : `❌ ${escapeHtml(String(r.error || 'Error'))}`, KEYBOARDS.live(), TELEGRAM_EFFECTS.thumbsDown);
      } else if (cmd === '/ping') {
        const t0 = Date.now();
        const r = await callAudioBackend('/health', {}, 'GET');
        await sendEffectMessage(chatId, chatType, `⚡ <b>${toSmallCaps('PONG!')}</b> ${Date.now() - t0}ms (${r.ok ? 'Online' : 'Offline'})`, KEYBOARDS.mainMenu(isAdmin), TELEGRAM_EFFECTS.confetti);
      } else if (cmd === '/account' || cmd === '/connect' || cmd === '/disconnect' || cmd === '/reconnect') {
        const op = cmd === '/account' ? 'status' : cmd.slice(1);
        const r = await callAudioBackend(`/account/${op}`, {}, op === 'status' ? 'GET' : 'POST');
        await sendEffectMessage(chatId, chatType, r.ok ? `👤 <b>${toSmallCaps(`Account ${op}`)}:</b>\n<code>${escapeHtml(JSON.stringify(r.data))}</code>` : getWorkerDiagnosticText(cmd), KEYBOARDS.account(), cmd === '/disconnect' ? TELEGRAM_EFFECTS.thumbsDown : TELEGRAM_EFFECTS.heart);
      } else {
        await sendEffectMessage(chatId, chatType, toSmallCaps('Send /start to open the control menu, /search <song> to pick music, or paste a https://t.me/... Voice Chat link.'), KEYBOARDS.mainMenu(isAdmin), TELEGRAM_EFFECTS.thumbsUp);
      }
    }

    return res.status(200).json({ ok: true });
  } catch (err) {
    console.error('Webhook error:', err instanceof Error ? err.message : 'unknown');
    return res.status(200).json({ ok: true });
  }
}

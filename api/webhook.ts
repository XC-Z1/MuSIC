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

interface TelegramUpdate {
  message?: {
    message_id: number;
    chat: { id: number; type: string; title?: string };
    from?: { id: number; username?: string; first_name?: string };
    text?: string;
    audio?: { file_id: string; title?: string; performer?: string; duration?: number };
    voice?: { file_id: string; duration?: number };
    document?: { file_id: string; file_name?: string; mime_type?: string };
  };
  callback_query?: {
    id: string;
    from: { id: number; username?: string; first_name?: string };
    message?: { message_id: number; chat: { id: number; type?: string }; text?: string };
    data?: string;
  };
}

const chatVolumeFallback = new Map<string, { volume: number; muted: boolean; previousVolume: number }>();

function clampVol(val: number): number {
  if (!Number.isFinite(val)) return 80;
  return Math.min(200, Math.max(10, Math.round(val)));
}

function parseVolumeFromText(text?: string): { volume: number; muted: boolean } {
  if (!text) return { volume: 80, muted: false };
  if (/ᴍᴜᴛᴇᴅ|MUTED/i.test(text)) {
    return { volume: 80, muted: true };
  }
  const match = text.match(/(\d{1,3})\s*%/);
  if (match) {
    return { volume: clampVol(Number(match[1])), muted: false };
  }
  return { volume: 80, muted: false };
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

  let next = { ...prevState };
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

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

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

const WELCOME_TEXT = sc([
  '🎧 Welcome To Music Spam Bot',
  '',
  '🎶 Your Music, Your World!',
  '✨ Premium Music Experience',
  '⚡ Ultra Fast Performance',
  '🎚️ Advanced Music Controls',
  '🎤 Auto Live Join System',
  '🎧 Personal Account Control',
  '🔥 Smart Music Streaming',
].join('\n'));

const HELP_TEXT = sc([
  '📚 Command Reference — Music Spam Bot',
  '',
  'Music Selection & Playback:',
  '/search <song name> · /play <song|url>',
  'Or forward any MP3 / Audio / Voice / YouTube link directly!',
  '/pause · /resume · /skip · /stop · /queue · /nowplaying',
  '/volume <10-200> · /mute · /unmute',
  '',
  'Live & Personal Account:',
  '/joinlive <t.me link> · /leavelive · /live',
  '/account · /connect · /disconnect · /reconnect',
  '',
  'System & Owner:',
  '/ping · /stats · /status · /owner',
].join('\n'));

function mainKeyboard(): InlineMarkup {
  return {
    inline_keyboard: [
      [
        { text: sc('🎵 Play Music'), callback_data: 'menu:play', style: 'success' },
      ],
      [
        { text: sc('🎧 Music Player'), callback_data: 'menu:player', style: 'primary' },
        { text: sc('🎤 Auto Live Join'), callback_data: 'menu:live', style: 'success' },
      ],
      [
        { text: sc('📊 Now Playing'), callback_data: 'menu:nowplaying', style: 'primary' },
        { text: sc('🎚️ Volume Control'), callback_data: 'menu:volume', style: 'primary' },
        { text: sc('👤 Account Control'), callback_data: 'menu:account', style: 'primary' },
      ],
      [
        { text: sc('📚 Help & Commands'), callback_data: 'menu:help', style: 'primary' },
        { text: sc('👑 Bot Owner'), callback_data: 'menu:owner', style: 'primary' },
      ],
    ],
  };
}

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

function getWorkerDiagnosticText(actionLabel?: string): string {
  const hasApiCreds = Boolean(
    (process.env.TELEGRAM_API_ID || process.env.API_ID) &&
    (process.env.TELEGRAM_API_HASH || process.env.API_HASH),
  );
  const hasWorker = Boolean(process.env.AUDIO_BACKEND_URL && process.env.AUDIO_BACKEND_API_SECRET);
  return sc(
    [
      actionLabel ? `⚡ Action: ${actionLabel}` : '',
      '🤖 Bot Webhook: ✅ Online (Vercel)',
      `🔑 API ID / Hash (Vercel): ${hasApiCreds ? '✅ Found (must also be in Audio Worker)' : '⚪ Not set (or redeploy needed)'}`,
      `🖥️ Audio Worker: ${hasWorker ? '✅ Linked' : '❌ Not Linked Yet'}`,
      '',
      hasWorker
        ? 'Audio Worker is linked. Tap Connect/Reconnect or check worker logs.'
        : [
            'ℹ️ Vercel serverless cannot hold live MTProto Voice Chat streams alone.',
            'No VPS needed — deploy backend/Dockerfile free on Koyeb/Render/HF Spaces:',
            '1️⃣ Deploy premium-music-bot/backend via Docker on Render or Koyeb',
            '2️⃣ Set API_ID, API_HASH, SESSION & AUDIO_BACKEND_API_SECRET there',
            '3️⃣ Add AUDIO_BACKEND_URL & AUDIO_BACKEND_API_SECRET to Vercel & Redeploy.',
          ].join('\n'),
    ]
      .filter(Boolean)
      .join('\n'),
  );
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
): Promise<{ ok: boolean; result?: { message_id?: number } }> {
  const res = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  return (await res.json()) as { ok: boolean; result?: { message_id?: number } };
}

async function sendEffectMessage(
  token: string,
  chatId: number | string,
  chatType: string,
  text: string,
  replyMarkup?: InlineMarkup,
  effectId?: string,
  introFrames: string[] = [],
  delayMs = 240,
): Promise<void> {
  await tgCall(token, 'sendChatAction', { chat_id: chatId, action: 'typing' }).catch(() => undefined);
  const useEffect = chatType === 'private' && Boolean(effectId);
  const frames = [...introFrames, text];
  const isSingle = frames.length === 1;

  const firstPayload: Record<string, unknown> = {
    chat_id: chatId,
    text: frames[0],
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

  const msgId = res.result?.message_id;
  if (!msgId || isSingle) return;

  for (let i = 1; i < frames.length; i++) {
    await sleep(delayMs);
    const isLast = i === frames.length - 1;
    await tgCall(token, 'editMessageText', {
      chat_id: chatId,
      message_id: msgId,
      text: frames[i],
      disable_web_page_preview: true,
      ...(isLast && replyMarkup ? { reply_markup: replyMarkup } : {}),
    });
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
      error: 'VPS Audio Worker not linked yet (set AUDIO_BACKEND_URL and AUDIO_BACKEND_API_SECRET).',
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
        // Keep diagnostic response non-fatal
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

  try {
    if (update.callback_query) {
      const cq = update.callback_query;
      const chatId = cq.message?.chat.id;
      const msgId = cq.message?.message_id;
      const data = cq.data || '';
      const hasWorker = Boolean(process.env.AUDIO_BACKEND_URL && process.env.AUDIO_BACKEND_API_SECRET);

      if (!chatId || !msgId) {
        await tgCall(botToken, 'answerCallbackQuery', { callback_query_id: cq.id });
        res.status(200).json({ ok: true });
        return;
      }

      if (data === 'menu:start') {
        await tgCall(botToken, 'answerCallbackQuery', { callback_query_id: cq.id });
        await tgCall(botToken, 'editMessageText', {
          chat_id: chatId,
          message_id: msgId,
          text: WELCOME_TEXT,
          reply_markup: mainKeyboard(),
        });
      } else if (data === 'menu:help') {
        await tgCall(botToken, 'answerCallbackQuery', { callback_query_id: cq.id });
        await tgCall(botToken, 'editMessageText', {
          chat_id: chatId,
          message_id: msgId,
          text: HELP_TEXT,
          reply_markup: mainKeyboard(),
        });
      } else if (data === 'menu:play' || data === 'play:search_hint' || data === 'play:url_hint') {
        const toast = sc(
          data === 'play:search_hint'
            ? 'Type /search <song name> to pick from top 5 songs!'
            : data === 'play:url_hint'
              ? 'Send any MP3/Audio/Voice file or YouTube link!'
              : 'Select how to send your song',
        );
        await tgCall(botToken, 'answerCallbackQuery', { callback_query_id: cq.id, text: toast });
        const guideText = sc(
          [
            '🎵 How To Select & Play Music',
            '',
            '1️⃣ Search & Pick From List:',
            '   Send: /search Kesariya',
            '   (Bot will show 5 clickable song buttons!)',
            '',
            '2️⃣ Instant Play By Song Name Or Link:',
            '   Send: /play Faded Alan Walker',
            '   Or paste a song name or YouTube / SoundCloud / .mp3 link directly.',
            '',
            '3️⃣ Upload / Forward Audio:',
            '   Send or forward any MP3 / Voice / Audio file to this chat.',
            hasWorker ? '' : '\n⚠️ Note: Link your Audio Worker first so audio can stream to Voice Chat.',
          ]
            .filter(Boolean)
            .join('\n'),
        );
        await sendEffectMessage(
          botToken,
          chatId,
          cq.message?.chat.type || 'private',
          guideText,
          playGuideKeyboard(),
          TELEGRAM_EFFECTS.fire,
          [
            `${sc('🎵 Opening Music Set...')}\n▁▂▃▄▅▆▇  ▰▱▱▱▱`,
            `${sc('🔥 Ready For Music Stream...')}\n▇▆▅▄▃▂▁  ▰▰▰▰▰`,
          ],
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
        const text = pRes.ok
          ? sc(`🎧 Now Playing\n\n🎵 Song: ${String(pRes.data?.title || source)}\n▶️ Status: Playing`)
          : sc(`❌ Cannot Play Track\n\n${pRes.error}`);
        await sendEffectMessage(
          botToken,
          chatId,
          cq.message?.chat.type || 'private',
          text,
          playerKeyboard(Boolean(pRes.ok)),
          TELEGRAM_EFFECTS.fire,
          [
            `${sc('🎵 Loading Track...')}\n▁▂▃▄▅▆▇  ▰▱▱▱▱`,
            `${sc('🔥 Starting Fire Stream...')}\n▇▆▅▄▃▂▁  ▰▰▰▰▰`,
          ],
        );
      } else if (data === 'menu:player' || data === 'menu:nowplaying' || data === 'menu:queue') {
        await tgCall(botToken, 'answerCallbackQuery', { callback_query_id: cq.id });
        const st = await callAudioBackend(`/player/status?chat_id=${chatId}`, {}, 'GET');
        const d = st.data || {};
        const text = st.ok && d.title
          ? [
              sc('🎧 Now Playing'),
              '',
              sc(`🎵 Song: ${String(d.title)}`),
              sc(`👤 Artist: ${String(d.artist || 'Unknown')}`),
              sc(`🔊 Volume: ${d.muted ? 'Muted' : `${String(d.volume ?? 80)}%`}`),
              sc(`▶️ Status: ${String(d.status || 'Playing')}`),
              '',
              buildProgressBar(Number(d.position || 0), Number(d.duration || 100)),
            ].join('\n')
          : `${sc('🎧 Music Player')}\n\n${st.configured ? sc('No track is currently playing. Send /search <song> or /play <song>.') : getWorkerDiagnosticText('Music Player')}`;
        await tgCall(botToken, 'editMessageText', {
          chat_id: chatId,
          message_id: msgId,
          text,
          reply_markup: playerKeyboard(d.status === 'playing'),
        });
      } else if (data === 'menu:volume') {
        await tgCall(botToken, 'answerCallbackQuery', { callback_query_id: cq.id });
        const vRes = await callAudioBackend(`/volume/status?chat_id=${chatId}`, {}, 'GET');
        const fallback = chatVolumeFallback.get(String(chatId)) ?? { volume: 80, muted: false };
        const vol = vRes.ok && vRes.data ? clampVol(Number(vRes.data.volume ?? 80)) : fallback.volume;
        const muted = vRes.ok && vRes.data ? Boolean(vRes.data.muted) : fallback.muted;
        const volText = sc(
          `🎚️ Volume Control\n\n<  ${muted ? '🔇 Muted' : `🔊 ${vol}%`}  >\n\nRange: 10% – 200% (FFmpeg Real-Time Gain)${hasWorker ? '' : '\n(Preview slider works 10%–200% · Link Audio Worker for live boost)'}`,
        );
        await sendEffectMessage(
          botToken,
          chatId,
          cq.message?.chat.type || 'private',
          volText,
          volumeKeyboard(),
          TELEGRAM_EFFECTS.fire,
          [
            `${sc('🎚️ Opening Volume Control...')}\n▁▂▃▄▅▆▇  ▰▱▱▱▱`,
            `${sc('🔥 Boosting Range 10% – 200%...')}\n▇▆▅▄▃▂▁  ▰▰▰▰▰`,
          ],
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
        await tgCall(botToken, 'editMessageText', {
          chat_id: chatId,
          message_id: msgId,
          text: sc(
            `🎚️ Volume Control\n\n<  ${nextVol.muted ? '🔇 Muted' : `🔊 ${nextVol.volume}%`}  >\n\nRange: 10% – 200% (FFmpeg Real-Time Gain)${hasWorker ? '' : '\n(Preview slider works 10%–200% · Link Audio Worker for live boost)'}`,
          ),
          reply_markup: volumeKeyboard(),
        });
      } else if (data.startsWith('player:')) {
        const action = data.slice(7);
        const r = await callAudioBackend(`/player/${action}`, { chat_id: chatId });
        await tgCall(botToken, 'answerCallbackQuery', {
          callback_query_id: cq.id,
          text: sc(r.ok ? `Playback: ${action.toUpperCase()}` : r.error || 'Audio Worker not linked'),
          show_alert: !r.configured,
        });
        await tgCall(botToken, 'editMessageText', {
          chat_id: chatId,
          message_id: msgId,
          text: r.ok ? sc(`🎧 Playback: ${action.toUpperCase()}`) : `${sc(`🎧 Playback (${action.toUpperCase()})`)}\n\n${getWorkerDiagnosticText()}`,
          reply_markup: playerKeyboard(action === 'resume'),
        });
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
          ? sc(`🎤 Live Connected\n\n✅ Personal Account: Connected\n🎧 Voice Chat: Active (${String(lRes.data.group_title || 'Group')})\n\nNow send /search <song> or /play <song> to stream audio!`)
          : [
              sc('🎤 Live Control Panel'),
              sc(data === 'live:join_hint' ? '\n👉 Paste your Telegram Group/Live link right now in this chat.' : '\nSend /joinlive https://t.me/group_name (or paste the link directly) to auto-join.'),
              lRes.configured ? '' : `\n${getWorkerDiagnosticText('Auto Live Join')}`,
            ]
              .filter(Boolean)
              .join('\n');
        await tgCall(botToken, 'editMessageText', {
          chat_id: chatId,
          message_id: msgId,
          text,
          reply_markup: liveKeyboard(),
        });
      } else if (data === 'menu:account' || data.startsWith('account:')) {
        const op = data === 'menu:account' ? 'status' : data.slice(8);
        const aRes = await callAudioBackend(`/account/${op}`, {}, op === 'status' ? 'GET' : 'POST');
        if (op !== 'status') {
          await tgCall(botToken, 'answerCallbackQuery', {
            callback_query_id: cq.id,
            text: sc(
              aRes.ok
                ? `Personal Account ${op} succeeded!`
                : 'Audio Worker not linked! Vercel alone cannot run MTProto Personal Account.',
            ),
            show_alert: !aRes.ok,
          });
        } else {
          await tgCall(botToken, 'answerCallbackQuery', { callback_query_id: cq.id });
        }
        const text = aRes.ok && aRes.data
          ? sc(`👤 Personal Account\n\nName: ${String(aRes.data.display_name || 'Connected')}\nUsername: ${String(aRes.data.username || '@account')}\nStatus: ${String(aRes.data.status || 'connected').toUpperCase()}`)
          : `${sc('👤 Personal Account Control')}\n\n${getWorkerDiagnosticText(op === 'status' ? 'Account Status' : `Account ${op.toUpperCase()}`)}`;
        await tgCall(botToken, 'editMessageText', {
          chat_id: chatId,
          message_id: msgId,
          text,
          reply_markup: accountKeyboard(),
        });
      } else if (data === 'menu:owner') {
        await tgCall(botToken, 'answerCallbackQuery', { callback_query_id: cq.id });
        const st = await callAudioBackend('/health', {}, 'GET');
        await tgCall(botToken, 'editMessageText', {
          chat_id: chatId,
          message_id: msgId,
          text: sc(
            [
              '👑 Owner Dashboard',
              '',
              '⚡ Vercel Webhook: Online',
              `🎧 Audio Worker: ${st.ok ? 'Online' : st.configured ? 'Offline' : 'Not Linked Yet'}`,
              st.ok && st.data ? `🖥️ CPU / RAM: ${String(st.data.cpu_percent ?? 0)}% / ${String(st.data.ram_percent ?? 0)}%` : '',
              st.configured ? '' : '\nConfigure AUDIO_BACKEND_URL & AUDIO_BACKEND_API_SECRET in Vercel.',
            ]
              .filter(Boolean)
              .join('\n'),
          ),
          reply_markup: mainKeyboard(),
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

      if (cmd === '/start') {
        await sendEffectMessage(
          botToken,
          chatId,
          chatType,
          WELCOME_TEXT,
          mainKeyboard(),
          TELEGRAM_EFFECTS.confetti,
          [
            '▁▂▃▄▅▆▇ ▰▱▱▱▱',
            '▁▂▃▄▅▆▇ ▰▱▱▱▱ → ▇▆▅▄▃▂▁ ▰▰▰▰▰',
          ],
        );
      } else if (cmd === '/help') {
        await sendEffectMessage(
          botToken,
          chatId,
          chatType,
          HELP_TEXT,
          mainKeyboard(),
          TELEGRAM_EFFECTS.thumbsUp,
        );
      } else if (cmd === '/joinlive' || rawText.includes('t.me/') || rawText.includes('telegram.me/')) {
        const link = cmd === '/joinlive' ? arg : rawText;
        if (!link) {
          await sendEffectMessage(
            botToken,
            chatId,
            chatType,
            sc('❌ Invalid Live Link\nUsage: /joinlive https://t.me/example_group/123'),
            liveKeyboard(),
            TELEGRAM_EFFECTS.thumbsDown,
          );
        } else {
          const jRes = await callAudioBackend('/live/join', { link, chat_id: chatId });
          const final = jRes.ok
            ? sc(`🎤 Live Connected\n\n✅ Personal Account: Connected\n🎧 Voice Chat: Active\n📍 Group: ${String(jRes.data?.group_title || link)}\n⚡ Connection: Stable\n\n🎵 Now send /search <song name> or /play <song name> to play music!`)
            : `${sc('❌ Auto Live Join Failed')}\n\n${jRes.configured ? sc(String(jRes.error || '')) : getWorkerDiagnosticText('Auto Live Join')}`;
          await sendEffectMessage(
            botToken,
            chatId,
            chatType,
            final,
            liveKeyboard(),
            TELEGRAM_EFFECTS.heart,
            [
              `${sc('🎤 Connecting Voice Chat...')}\n▁▂▃▄▅▆▇  ▰▱▱▱▱`,
              `${sc('🔊 Syncing Live Stream...')}\n▇▆▅▄▃▂▁  ▰▰▰▰▰`,
            ],
          );
        }
      } else if (cmd === '/search') {
        if (!arg) {
          await sendEffectMessage(
            botToken,
            chatId,
            chatType,
            sc('🔍 Usage: /search <song name>\nExample: /search Kesariya Arijit Singh'),
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
                ? sc(`❌ No tracks found for "${arg}". Try /play ${arg} or send a direct URL.`)
                : `${sc('🔍 Song Search')}\n\n${getWorkerDiagnosticText('Music Search')}`,
              playGuideKeyboard(),
              TELEGRAM_EFFECTS.fire,
              [
                `${sc('🔍 Searching Track...')}\n▁▂▃▄▅▆▇  ▰▱▱▱▱`,
                `${sc('🔥 Preparing Results...')}\n▇▆▅▄▃▂▁  ▰▰▰▰▰`,
              ],
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
              sc(`🔍 Select Music For: ${arg}\n\nTap any song below to play it in Live Voice Chat:`),
              { inline_keyboard: buttons },
              TELEGRAM_EFFECTS.fire,
              [
                `${sc('🔍 Searching Track...')}\n▁▂▃▄▅▆▇  ▰▱▱▱▱`,
                `${sc('🔥 Matching Top 5 Songs...')}\n▇▆▅▄▃▂▁  ▰▰▰▰▰`,
              ],
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
            sc('🎵 Send /play <song name or URL>, /search <song name>, or upload an MP3/Audio file.'),
            playGuideKeyboard(),
            TELEGRAM_EFFECTS.fire,
            [
              `${sc('🎵 Opening Music Set...')}\n▁▂▃▄▅▆▇  ▰▱▱▱▱`,
              `${sc('🔥 Ready To Stream...')}\n▇▆▅▄▃▂▁  ▰▰▰▰▰`,
            ],
          );
        } else {
          const pRes = await callAudioBackend('/player/play', {
            chat_id: chatId,
            source,
            requested_by: msg.from?.username || msg.from?.first_name || 'User',
          });
          const final = pRes.ok
            ? sc(`🎧 Now Playing\n\n🎵 Song: ${String(pRes.data?.title || source)}\n▶️ Status: Playing`)
            : `${sc('❌ Cannot Play Music')}\n\n${pRes.configured ? sc(String(pRes.error || '')) : getWorkerDiagnosticText('Play Music')}`;
          await sendEffectMessage(
            botToken,
            chatId,
            chatType,
            final,
            playerKeyboard(Boolean(pRes.ok)),
            TELEGRAM_EFFECTS.fire,
            [
              `${sc('🎵 Fetching Audio...')}\n▁▂▃▄▅▆▇  ▰▱▱▱▱`,
              `${sc('🔥 Tuning FFmpeg Stream...')}\n▇▆▅▄▃▂▁  ▰▰▰▰▰`,
            ],
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
          sc(`🎚️ Volume Control\n\n<  ${nextVol.muted ? '🔇 Muted' : `🔊 ${nextVol.volume}%`}  >\n\nRange: 10% – 200% (FFmpeg Real-Time Gain)`),
          volumeKeyboard(),
          TELEGRAM_EFFECTS.fire,
          [
            `${sc('🎚️ Opening Volume Control...')}\n▁▂▃▄▅▆▇  ▰▱▱▱▱`,
            `${sc('🔥 Volume Range: 10% – 200%...')}\n▇▆▅▄▃▂▁  ▰▰▰▰▰`,
          ],
        );
      } else if (cmd === '/ping') {
        const t0 = Date.now();
        const h = await callAudioBackend('/health', {}, 'GET');
        await sendEffectMessage(
          botToken,
          chatId,
          chatType,
          sc(`⚡ Pong! Vercel Webhook Active (${Date.now() - t0}ms)\nAudio Worker: ${h.ok ? 'Online' : 'Not Connected'}`),
          mainKeyboard(),
          TELEGRAM_EFFECTS.confetti,
        );
      } else if (['/pause', '/resume', '/skip', '/stop'].includes(cmd)) {
        const action = cmd.slice(1);
        const r = await callAudioBackend(`/player/${action}`, { chat_id: chatId });
        await sendEffectMessage(
          botToken,
          chatId,
          chatType,
          sc(r.ok ? `🎧 ${action.toUpperCase()} executed.` : `❌ ${r.error}`),
          playerKeyboard(action === 'resume'),
          action === 'stop' ? TELEGRAM_EFFECTS.thumbsDown : TELEGRAM_EFFECTS.fire,
        );
      } else if (cmd === '/leavelive') {
        const r = await callAudioBackend('/live/leave', { chat_id: chatId });
        await sendEffectMessage(
          botToken,
          chatId,
          chatType,
          sc(r.ok ? '🚪 Left Voice Chat.' : `❌ ${r.error}`),
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
      } else if (cmd === '/account' || cmd === '/connect' || cmd === '/disconnect' || cmd === '/reconnect' || cmd === '/owner' || cmd === '/stats' || cmd === '/status') {
        const isAcc = ['/account', '/connect', '/disconnect', '/reconnect'].includes(cmd);
        const endpoint = cmd === '/account' ? '/account/status' : isAcc ? `/account/${cmd.slice(1)}` : '/health';
        const r = await callAudioBackend(endpoint, {}, cmd === '/connect' || cmd === '/disconnect' || cmd === '/reconnect' ? 'POST' : 'GET');
        const effect =
          cmd === '/disconnect'
            ? TELEGRAM_EFFECTS.thumbsDown
            : isAcc
              ? TELEGRAM_EFFECTS.heart
              : TELEGRAM_EFFECTS.confetti;
        await sendEffectMessage(
          botToken,
          chatId,
          chatType,
          r.ok ? `${sc('✅ Status:')}\n${JSON.stringify(r.data, null, 2)}` : getWorkerDiagnosticText(cmd),
          isAcc ? accountKeyboard() : mainKeyboard(),
          effect,
        );
      } else {
        await sendEffectMessage(
          botToken,
          chatId,
          chatType,
          sc('Send /start for the control panel, /search <song> to pick a song, or paste a https://t.me/... Voice Chat link.'),
          mainKeyboard(),
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

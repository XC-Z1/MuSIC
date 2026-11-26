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
}

interface InlineMarkup {
  inline_keyboard: InlineButton[][];
}

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
    message?: { message_id: number; chat: { id: number } };
    data?: string;
  };
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const WELCOME_TEXT = [
  '🎧 𝐖𝐄𝐋𝐂𝐎𝐌𝐄 𝐓𝐎 𝐏𝐑𝐄𝐌𝐈𝐔𝐌 𝐌𝐔𝐒𝐈𝐂 𝐁𝐎𝐓',
  '',
  '🎶 Your Music, Your World!',
  '✨ Premium Music Experience',
  '⚡ Ultra Fast Performance',
  '🎚️ Advanced Music Controls',
  '🎤 Auto Live Join System',
  '🎧 Personal Account Control',
  '🔥 Smart Music Streaming',
].join('\n');

const HELP_TEXT = [
  '📚 𝐂𝐎𝐌𝐌𝐀𝐍𝐃 𝐑𝐄𝐅𝐄𝐑𝐄𝐍𝐂𝐄',
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
].join('\n');

function mainKeyboard(): InlineMarkup {
  return {
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
  };
}

function playerKeyboard(isPlaying = true): InlineMarkup {
  return {
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
  };
}

function volumeKeyboard(): InlineMarkup {
  return {
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
  };
}

function liveKeyboard(): InlineMarkup {
  return {
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
        { text: '🔊 Volume +10%', callback_data: 'vol:+10' },
        { text: '🔉 Volume -10%', callback_data: 'vol:-10' },
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
  };
}

function accountKeyboard(): InlineMarkup {
  return {
    inline_keyboard: [
      [
        { text: '🔗 Connect', callback_data: 'account:connect' },
        { text: '🔌 Disconnect', callback_data: 'account:disconnect' },
      ],
      [
        { text: '🔄 Reconnect', callback_data: 'account:reconnect' },
        { text: '🎤 Live Control', callback_data: 'menu:live' },
      ],
      [{ text: '🔙 Main Menu', callback_data: 'menu:start' }],
    ],
  };
}

function playGuideKeyboard(): InlineMarkup {
  return {
    inline_keyboard: [
      [
        { text: '🔍 How to Search Song', callback_data: 'play:search_hint' },
        { text: '📁 Send MP3 / Link', callback_data: 'play:url_hint' },
      ],
      [
        { text: '🎧 Music Player', callback_data: 'menu:player' },
        { text: '🎤 Live Control', callback_data: 'menu:live' },
      ],
      [{ text: '🔙 Main Menu', callback_data: 'menu:start' }],
    ],
  };
}

function getWorkerDiagnosticText(actionLabel?: string): string {
  const hasApiCreds = Boolean(process.env.TELEGRAM_API_ID && process.env.TELEGRAM_API_HASH);
  const hasWorker = Boolean(process.env.AUDIO_BACKEND_URL && process.env.AUDIO_BACKEND_API_SECRET);
  return [
    actionLabel ? `⚡ Action: ${actionLabel}` : '',
    '🤖 Bot Webhook: ✅ Online (Vercel)',
    `🔑 API ID / Hash (Vercel): ${hasApiCreds ? '✅ Found (must also be in VPS .env)' : '⚪ Not set'}`,
    `🖥️ VPS Audio Worker: ${hasWorker ? '✅ Linked' : '❌ Not Linked Yet'}`,
    '',
    hasWorker
      ? 'VPS Audio Worker is linked. Tap Connect/Reconnect or check VPS logs if offline.'
      : [
          'ℹ️ Vercel serverless cannot hold a persistent MTProto Voice Chat stream directly.',
          'To connect your Personal Account & stream music:',
          '1️⃣ Run backend/main.py on a Python VPS (Pyrogram + PyTgCalls + FFmpeg)',
          '2️⃣ Generate session on VPS: python3 account_client.py --login',
          '3️⃣ Add AUDIO_BACKEND_URL & AUDIO_BACKEND_API_SECRET to Vercel Env Vars & Redeploy.',
        ].join('\n'),
  ]
    .filter(Boolean)
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
): Promise<{ ok: boolean; result?: { message_id?: number } }> {
  const res = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  return (await res.json()) as { ok: boolean; result?: { message_id?: number } };
}

async function sendAnimatedFrames(
  token: string,
  chatId: number | string,
  frames: string[],
  finalMarkup?: InlineMarkup,
  delayMs = 500,
): Promise<void> {
  if (frames.length === 0) return;
  const first = await tgCall(token, 'sendMessage', {
    chat_id: chatId,
    text: frames[0],
    disable_web_page_preview: true,
  });
  const msgId = first.result?.message_id;
  if (!msgId) return;

  for (let i = 1; i < frames.length; i++) {
    await sleep(delayMs);
    const isLast = i === frames.length - 1;
    await tgCall(token, 'editMessageText', {
      chat_id: chatId,
      message_id: msgId,
      text: frames[i],
      disable_web_page_preview: true,
      ...(isLast && finalMarkup ? { reply_markup: finalMarkup } : {}),
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
        const toast =
          data === 'play:search_hint'
            ? 'Type /search <song name> to pick from top 5 songs!'
            : data === 'play:url_hint'
              ? 'Send any MP3/Audio/Voice file or YouTube link!'
              : 'Select how to send your song';
        await tgCall(botToken, 'answerCallbackQuery', { callback_query_id: cq.id, text: toast });
        const guideText = [
          '🎵 𝐇𝐎𝐖 𝐓𝐎 𝐒𝐄𝐋𝐄𝐂𝐓 & 𝐏𝐋𝐀𝐘 𝐌𝐔𝐒𝐈𝐂',
          '',
          '1️⃣ Search & Pick from List:',
          '   Send: /search Kesariya',
          '   (Bot will show 5 clickable song buttons!)',
          '',
          '2️⃣ Instant Play by Song Name or Link:',
          '   Send: /play Faded Alan Walker',
          '   Or paste a YouTube / SoundCloud / .mp3 link directly.',
          '',
          '3️⃣ Upload / Forward Audio:',
          '   Send or forward any MP3 / Voice / Audio file to this chat.',
          hasWorker ? '' : '\n⚠️ Note: Link your VPS Audio Worker first so audio can stream to Voice Chat.',
        ]
          .filter(Boolean)
          .join('\n');
        await tgCall(botToken, 'editMessageText', {
          chat_id: chatId,
          message_id: msgId,
          text: guideText,
          reply_markup: playGuideKeyboard(),
        });
      } else if (data.startsWith('pick:')) {
        const rawRef = data.slice(5);
        const source = rawRef.startsWith('yt:') ? `https://www.youtube.com/watch?v=${rawRef.slice(3)}` : rawRef;
        await tgCall(botToken, 'answerCallbackQuery', {
          callback_query_id: cq.id,
          text: hasWorker ? 'Starting selected track...' : 'VPS Audio Worker not linked yet!',
          show_alert: !hasWorker,
        });
        const pRes = await callAudioBackend('/player/play', {
          chat_id: chatId,
          source,
          requested_by: cq.from.username || cq.from.first_name || 'User',
        });
        const text = pRes.ok
          ? `🎧 𝐍𝐎𝐖 𝐏𝐋𝐀𝐘𝐈𝐍𝐆\n\n🎵 Song: ${String(pRes.data?.title || source)}\n▶️ Status: Playing`
          : `❌ Cannot Play Track\n\n${pRes.error}`;
        await tgCall(botToken, 'editMessageText', {
          chat_id: chatId,
          message_id: msgId,
          text,
          reply_markup: playerKeyboard(Boolean(pRes.ok)),
        });
      } else if (data === 'menu:player' || data === 'menu:nowplaying' || data === 'menu:queue') {
        await tgCall(botToken, 'answerCallbackQuery', { callback_query_id: cq.id });
        const st = await callAudioBackend(`/player/status?chat_id=${chatId}`, {}, 'GET');
        const d = st.data || {};
        const text = st.ok && d.title
          ? [
              '🎧 𝐍𝐎𝐖 𝐏𝐋𝐀𝐘𝐈𝐍𝐆',
              '',
              `🎵 Song: ${String(d.title)}`,
              `👤 Artist: ${String(d.artist || 'Unknown')}`,
              `🔊 Volume: ${d.muted ? 'Muted' : `${String(d.volume ?? 80)}%`}`,
              `▶️ Status: ${String(d.status || 'Playing')}`,
              '',
              buildProgressBar(Number(d.position || 0), Number(d.duration || 100)),
            ].join('\n')
          : `🎧 𝐌𝐔𝐒𝐈𝐂 𝐏𝐋𝐀𝐘𝐄𝐑\n\n${st.configured ? 'No track is currently playing. Send /search <song> or /play <song>.' : getWorkerDiagnosticText('Music Player')}`;
        await tgCall(botToken, 'editMessageText', {
          chat_id: chatId,
          message_id: msgId,
          text,
          reply_markup: playerKeyboard(d.status === 'playing'),
        });
      } else if (data === 'menu:volume' || data.startsWith('vol:')) {
        let vol = 80;
        let muted = false;
        if (data.startsWith('vol:')) {
          const op = data.slice(4);
          const vRes = await callAudioBackend('/volume/adjust', { chat_id: chatId, action: op });
          await tgCall(botToken, 'answerCallbackQuery', {
            callback_query_id: cq.id,
            text: vRes.ok ? `Volume updated (${op})` : 'Preview mode (VPS Worker not linked)',
          });
          if (vRes.ok && vRes.data) {
            vol = Number(vRes.data.volume ?? 80);
            muted = Boolean(vRes.data.muted);
          } else {
            muted = op === 'mute';
            if (op === '+10') vol = 90;
            if (op === '+20') vol = 100;
            if (op === '-10') vol = 70;
            if (op === '-20') vol = 60;
          }
        } else {
          await tgCall(botToken, 'answerCallbackQuery', { callback_query_id: cq.id });
          const vRes = await callAudioBackend(`/volume/status?chat_id=${chatId}`, {}, 'GET');
          if (vRes.ok && vRes.data) {
            vol = Number(vRes.data.volume ?? 80);
            muted = Boolean(vRes.data.muted);
          }
        }
        await tgCall(botToken, 'editMessageText', {
          chat_id: chatId,
          message_id: msgId,
          text: `🎚️ 𝐕𝐎𝐋𝐔𝐌𝐄 𝐂𝐎𝐍𝐓𝐑𝐎𝐋\n\n<  ${muted ? '🔇 MUTED' : `🔊 ${vol}%`}  >\n\nRange: 10% – 200%${hasWorker ? '' : '\n(⚠️ Link VPS Audio Worker for live volume)'}`,
          reply_markup: volumeKeyboard(),
        });
      } else if (data.startsWith('player:')) {
        const action = data.slice(7);
        const r = await callAudioBackend(`/player/${action}`, { chat_id: chatId });
        await tgCall(botToken, 'answerCallbackQuery', {
          callback_query_id: cq.id,
          text: r.ok ? `Playback: ${action.toUpperCase()}` : r.error || 'VPS Worker not linked',
          show_alert: !r.configured,
        });
        await tgCall(botToken, 'editMessageText', {
          chat_id: chatId,
          message_id: msgId,
          text: r.ok ? `🎧 Playback: ${action.toUpperCase()}` : `🎧 Playback (${action.toUpperCase()})\n\n${getWorkerDiagnosticText()}`,
          reply_markup: playerKeyboard(action === 'resume'),
        });
      } else if (data === 'menu:live' || data === 'live:leave' || data === 'live:join_hint') {
        if (data === 'live:leave') {
          const leaveRes = await callAudioBackend('/live/leave', { chat_id: chatId });
          await tgCall(botToken, 'answerCallbackQuery', {
            callback_query_id: cq.id,
            text: leaveRes.ok ? 'Left Voice Chat' : 'VPS Audio Worker not linked yet!',
            show_alert: !leaveRes.configured,
          });
        } else if (data === 'live:join_hint') {
          await tgCall(botToken, 'answerCallbackQuery', {
            callback_query_id: cq.id,
            text: 'Paste any https://t.me/group_name link in chat to auto-join!',
            show_alert: true,
          });
        } else {
          await tgCall(botToken, 'answerCallbackQuery', { callback_query_id: cq.id });
        }

        const lRes = await callAudioBackend('/live/status', {}, 'GET');
        const text = lRes.ok && lRes.data?.active
          ? `🎤 𝐋𝐈𝐕𝐄 𝐂𝐎𝐍𝐍𝐄𝐂𝐓𝐄𝐃\n\n✅ Personal Account: Connected\n🎧 Voice Chat: Active (${String(lRes.data.group_title || 'Group')})\n\nNow send /search <song> or /play <song> to stream audio!`
          : [
              '🎤 𝐋𝐈𝐕𝐄 𝐂𝐎𝐍𝐓𝐑𝐎𝐋 𝐏𝐀𝐍𝐄𝐋',
              data === 'live:join_hint' ? '\n👉 Paste your Telegram Group/Live link right now in this chat (e.g. https://t.me/group_name).' : '\nSend /joinlive https://t.me/group_name/123 (or paste the link directly) to auto-join.',
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
            text: aRes.ok
              ? `Personal Account ${op} succeeded!`
              : 'VPS Audio Worker not linked! Vercel alone cannot run MTProto Personal Account.',
            show_alert: !aRes.ok,
          });
        } else {
          await tgCall(botToken, 'answerCallbackQuery', { callback_query_id: cq.id });
        }
        const text = aRes.ok && aRes.data
          ? `👤 𝐏𝐄𝐑𝐒𝐎𝐍𝐀𝐋 𝐀𝐂𝐂𝐎𝐔𝐍𝐓\n\nName: ${String(aRes.data.display_name || 'Connected')}\nUsername: ${String(aRes.data.username || '@account')}\nStatus: ${String(aRes.data.status || 'connected').toUpperCase()}`
          : `👤 𝐏𝐄𝐑𝐒𝐎𝐍𝐀𝐋 𝐀𝐂𝐂𝐎𝐔𝐍𝐓 𝐂𝐎𝐍𝐓𝐑𝐎𝐋\n\n${getWorkerDiagnosticText(op === 'status' ? 'Account Status' : `Account ${op.toUpperCase()}`)}`;
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
          text: [
            '👑 𝐎𝐖𝐍𝐄𝐑 𝐃𝐀𝐒𝐇𝐁𝐎𝐀𝐑𝐃',
            '',
            '⚡ Vercel Webhook: Online',
            `🎧 VPS Audio Worker: ${st.ok ? 'Online' : st.configured ? 'Offline' : 'Not Linked Yet'}`,
            st.ok && st.data ? `🖥️ CPU / RAM: ${String(st.data.cpu_percent ?? 0)}% / ${String(st.data.ram_percent ?? 0)}%` : '',
            st.configured ? '' : '\nConfigure AUDIO_BACKEND_URL & AUDIO_BACKEND_API_SECRET in Vercel to link your VPS.',
          ]
            .filter(Boolean)
            .join('\n'),
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
        await sendAnimatedFrames(
          botToken,
          chatId,
          [
            '🎧 Initializing Premium Music Bot...\n◉ ○ ○ ○',
            '🎶 Loading Personal Account Bridge...\n◉ ◉ ○ ○',
            '✨ Preparing Inline Controls...\n◉ ◉ ◉ ○',
            WELCOME_TEXT,
          ],
          mainKeyboard(),
        );
      } else if (cmd === '/help') {
        await tgCall(botToken, 'sendMessage', {
          chat_id: chatId,
          text: HELP_TEXT,
          reply_markup: mainKeyboard(),
        });
      } else if (cmd === '/joinlive' || rawText.includes('t.me/') || rawText.includes('telegram.me/')) {
        const link = cmd === '/joinlive' ? arg : rawText;
        if (!link) {
          await tgCall(botToken, 'sendMessage', {
            chat_id: chatId,
            text: '❌ Invalid Live Link\nUsage: /joinlive https://t.me/example_group/123',
          });
        } else {
          const jRes = await callAudioBackend('/live/join', { link, chat_id: chatId });
          const final = jRes.ok
            ? `🎤 𝐋𝐈𝐕𝐄 𝐂𝐎𝐍𝐍𝐄𝐂𝐓𝐄𝐃\n\n✅ Personal Account: Connected\n🎧 Voice Chat: Active\n📍 Group: ${String(jRes.data?.group_title || link)}\n⚡ Connection: Stable\n\n🎵 Now send /search <song name> or /play <song name> to play music!`
            : `❌ Auto Live Join Failed\n\n${jRes.configured ? jRes.error : getWorkerDiagnosticText('Auto Live Join')}`;
          await sendAnimatedFrames(
            botToken,
            chatId,
            [
              `🎧 Connecting to Voice Chat...\n◉ ○ ○ ○`,
              `🎤 Joining Live (${link})...\n◉ ◉ ○ ○`,
              `🎵 Preparing Music...\n◉ ◉ ◉ ○`,
              final,
            ],
            liveKeyboard(),
          );
        }
      } else if (cmd === '/search') {
        if (!arg) {
          await tgCall(botToken, 'sendMessage', {
            chat_id: chatId,
            text: '🔍 Usage: /search <song name>\nExample: /search Kesariya Arijit Singh',
            reply_markup: playGuideKeyboard(),
          });
        } else {
          const sRes = await callAudioBackend('/player/search', { query: arg, limit: 5 });
          const results = Array.isArray(sRes.data?.results)
            ? (sRes.data.results as Array<{ title?: string; artist?: string; duration?: number; id?: string; url?: string }>)
            : [];
          if (!sRes.ok || results.length === 0) {
            await tgCall(botToken, 'sendMessage', {
              chat_id: chatId,
              text: sRes.configured
                ? `❌ No tracks found for "${arg}". Try /play ${arg} or send a direct URL.`
                : `🔍 𝐒𝐎𝐍𝐆 𝐒𝐄𝐀𝐑𝐂𝐇\n\n${getWorkerDiagnosticText('Music Search')}`,
              reply_markup: playGuideKeyboard(),
            });
          } else {
            const buttons: InlineButton[][] = results.slice(0, 5).map((item, idx) => {
              const title = String(item.title || `Track ${idx + 1}`).slice(0, 42);
              const ref = item.id ? `yt:${item.id}` : String(item.url || '').slice(0, 56);
              return [{ text: `${idx + 1}. 🎵 ${title}`, callback_data: `pick:${ref}` }];
            });
            buttons.push([{ text: '🔙 Main Menu', callback_data: 'menu:start' }]);
            await tgCall(botToken, 'sendMessage', {
              chat_id: chatId,
              text: `🔍 𝐒𝐄𝐋𝐄𝐂𝐓 𝐌𝐔𝐒𝐈𝐂 𝐅𝐎𝐑: ${arg}\n\nTap any song below to play it in Live Voice Chat:`,
              reply_markup: { inline_keyboard: buttons },
            });
          }
        }
      } else if (cmd === '/play' || msg.audio || msg.voice || audioDoc || isMediaUrl(rawText)) {
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
          await tgCall(botToken, 'sendMessage', {
            chat_id: chatId,
            text: '🎵 Send `/play <song name or URL>`, `/search <song name>`, or upload an MP3/Audio file.',
            reply_markup: playGuideKeyboard(),
          });
        } else {
          const pRes = await callAudioBackend('/player/play', {
            chat_id: chatId,
            source,
            requested_by: msg.from?.username || msg.from?.first_name || 'User',
          });
          const final = pRes.ok
            ? `🎧 𝐍𝐎𝐖 𝐏𝐋𝐀𝐘𝐈𝐍𝐆\n\n🎵 Song: ${String(pRes.data?.title || source)}\n▶️ Status: Playing`
            : `❌ Cannot Play Music\n\n${pRes.configured ? pRes.error : getWorkerDiagnosticText('Play Music')}`;
          await sendAnimatedFrames(
            botToken,
            chatId,
            [
              `🎵 Validating Music Source...\n◉ ○ ○ ○`,
              `🎚️ Processing Audio via FFmpeg...\n◉ ◉ ◉ ○`,
              `🔥 PREPARING AUDIO STREAM...\n◉ ◉ ◉ ◉`,
              final,
            ],
            playerKeyboard(Boolean(pRes.ok)),
          );
        }
      } else if (cmd === '/volume') {
        const volNum = Number(arg);
        const vRes = Number.isFinite(volNum)
          ? await callAudioBackend('/volume/set', { chat_id: chatId, volume: Math.min(200, Math.max(10, volNum)) })
          : await callAudioBackend(`/volume/status?chat_id=${chatId}`, {}, 'GET');
        const vol = vRes.ok && vRes.data ? Number(vRes.data.volume ?? 80) : (Number.isFinite(volNum) ? volNum : 80);
        await tgCall(botToken, 'sendMessage', {
          chat_id: chatId,
          text: `🎚️ 𝐕𝐎𝐋𝐔𝐌𝐄 𝐂𝐎𝐍𝐓𝐑𝐎𝐋\n\n<  🔊 ${vol}%  >`,
          reply_markup: volumeKeyboard(),
        });
      } else if (cmd === '/ping') {
        const t0 = Date.now();
        const h = await callAudioBackend('/health', {}, 'GET');
        await tgCall(botToken, 'sendMessage', {
          chat_id: chatId,
          text: `⚡ Pong! Vercel Webhook Active (${Date.now() - t0}ms)\nAudio Worker: ${h.ok ? 'Online' : 'Not Connected'}`,
        });
      } else if (['/pause', '/resume', '/skip', '/stop'].includes(cmd)) {
        const action = cmd.slice(1);
        const r = await callAudioBackend(`/player/${action}`, { chat_id: chatId });
        await tgCall(botToken, 'sendMessage', {
          chat_id: chatId,
          text: r.ok ? `🎧 ${action.toUpperCase()} executed.` : `❌ ${r.error}`,
          reply_markup: playerKeyboard(action === 'resume'),
        });
      } else if (cmd === '/leavelive') {
        const r = await callAudioBackend('/live/leave', { chat_id: chatId });
        await tgCall(botToken, 'sendMessage', {
          chat_id: chatId,
          text: r.ok ? '🚪 Left Voice Chat.' : `❌ ${r.error}`,
        });
      } else if (cmd === '/live') {
        await tgCall(botToken, 'sendMessage', {
          chat_id: chatId,
          text: '🎤 𝐋𝐈𝐕𝐄 𝐂𝐎𝐍𝐓𝐑𝐎𝐋 𝐏𝐀𝐍𝐄𝐋',
          reply_markup: liveKeyboard(),
        });
      } else if (cmd === '/account' || cmd === '/connect' || cmd === '/disconnect' || cmd === '/reconnect' || cmd === '/owner' || cmd === '/stats' || cmd === '/status') {
        const isAcc = ['/account', '/connect', '/disconnect', '/reconnect'].includes(cmd);
        const endpoint = cmd === '/account' ? '/account/status' : isAcc ? `/account/${cmd.slice(1)}` : '/health';
        const r = await callAudioBackend(endpoint, {}, cmd === '/connect' || cmd === '/disconnect' || cmd === '/reconnect' ? 'POST' : 'GET');
        await tgCall(botToken, 'sendMessage', {
          chat_id: chatId,
          text: r.ok ? `✅ Status:\n${JSON.stringify(r.data, null, 2)}` : getWorkerDiagnosticText(cmd),
          reply_markup: isAcc ? accountKeyboard() : mainKeyboard(),
        });
      } else {
        await tgCall(botToken, 'sendMessage', {
          chat_id: chatId,
          text: 'Send /start for the control panel, /search <song> to pick a song, or paste a https://t.me/... Voice Chat link.',
          reply_markup: mainKeyboard(),
        });
      }
    }

    res.status(200).json({ ok: true });
  } catch (err) {
    console.error('Vercel webhook error:', err instanceof Error ? err.message : 'unknown');
    res.status(200).json({ ok: true });
  }
}

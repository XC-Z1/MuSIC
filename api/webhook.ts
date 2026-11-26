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
  'General:',
  '/start · /help · /play <song|url> · /pause · /resume',
  '/skip · /stop · /queue · /nowplaying',
  '/volume <10-200> · /mute · /unmute',
  '',
  'Live & Personal Account:',
  '/joinlive <t.me link> · /leavelive · /live · /autojoin',
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

export default async function handler(req: VercelReq, res: VercelRes) {
  if (req.method === 'GET') {
    res.status(200).json({
      ok: true,
      service: 'telestream-vercel-webhook',
      botConfigured: Boolean(process.env.TELEGRAM_BOT_TOKEN),
      audioWorkerConfigured: Boolean(process.env.AUDIO_BACKEND_URL && process.env.AUDIO_BACKEND_API_SECRET),
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

  const update = (typeof req.body === 'string' ? JSON.parse(req.body) : req.body || {}) as TelegramUpdate;

  try {
    if (update.callback_query) {
      const cq = update.callback_query;
      const chatId = cq.message?.chat.id;
      const msgId = cq.message?.message_id;
      const data = cq.data || '';
      await tgCall(botToken, 'answerCallbackQuery', { callback_query_id: cq.id });

      if (!chatId || !msgId) {
        res.status(200).json({ ok: true });
        return;
      }

      if (data === 'menu:start') {
        await tgCall(botToken, 'editMessageText', {
          chat_id: chatId,
          message_id: msgId,
          text: WELCOME_TEXT,
          reply_markup: mainKeyboard(),
        });
      } else if (data === 'menu:help') {
        await tgCall(botToken, 'editMessageText', {
          chat_id: chatId,
          message_id: msgId,
          text: HELP_TEXT,
          reply_markup: mainKeyboard(),
        });
      } else if (data === 'menu:play') {
        await tgCall(botToken, 'editMessageText', {
          chat_id: chatId,
          message_id: msgId,
          text: '🎵 Send `/play <song name or direct audio URL>` or forward an MP3 audio file.',
          reply_markup: playerKeyboard(false),
        });
      } else if (data === 'menu:player' || data === 'menu:nowplaying' || data === 'menu:queue') {
        const st = await callAudioBackend('/player/status', {}, 'GET');
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
          : `🎧 𝐌𝐔𝐒𝐈𝐂 𝐏𝐋𝐀𝐘𝐄𝐑\n\n${st.configured ? 'No track is currently playing.' : st.error}`;
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
          const vRes = await callAudioBackend('/volume/status', {}, 'GET');
          if (vRes.ok && vRes.data) {
            vol = Number(vRes.data.volume ?? 80);
            muted = Boolean(vRes.data.muted);
          }
        }
        await tgCall(botToken, 'editMessageText', {
          chat_id: chatId,
          message_id: msgId,
          text: `🎚️ 𝐕𝐎𝐋𝐔𝐌𝐄 𝐂𝐎𝐍𝐓𝐑𝐎𝐋\n\n<  ${muted ? '🔇 MUTED' : `🔊 ${vol}%`}  >\n\nRange: 10% – 200%`,
          reply_markup: volumeKeyboard(),
        });
      } else if (data.startsWith('player:')) {
        const action = data.slice(7);
        const r = await callAudioBackend(`/player/${action}`, { chat_id: chatId });
        await tgCall(botToken, 'editMessageText', {
          chat_id: chatId,
          message_id: msgId,
          text: r.ok ? `🎧 Playback: ${action.toUpperCase()}` : `🎧 Playback (${action.toUpperCase()})\n\nℹ️ ${r.error}`,
          reply_markup: playerKeyboard(action === 'resume'),
        });
      } else if (data === 'menu:live' || data === 'live:leave' || data === 'live:join_hint') {
        if (data === 'live:leave') {
          await callAudioBackend('/live/leave', { chat_id: chatId });
        }
        const lRes = await callAudioBackend('/live/status', {}, 'GET');
        const text = lRes.ok && lRes.data?.active
          ? `🎤 𝐋𝐈𝐕𝐄 𝐂𝐎𝐍𝐍𝐄𝐂𝐓𝐄𝐃\n\n✅ Personal Account: Connected\n🎧 Voice Chat: Active (${String(lRes.data.group_title || 'Group')})`
          : `🎤 𝐋𝐈𝐕𝐄 𝐂𝐎𝐍𝐓𝐑𝐎𝐋 𝐏𝐀𝐍𝐄𝐋\n\nSend /joinlive https://t.me/group_name/123 to auto-join a Voice Chat.\n${lRes.configured ? '' : `\nℹ️ ${lRes.error}`}`;
        await tgCall(botToken, 'editMessageText', {
          chat_id: chatId,
          message_id: msgId,
          text,
          reply_markup: liveKeyboard(),
        });
      } else if (data === 'menu:account' || data.startsWith('account:')) {
        const op = data === 'menu:account' ? 'status' : data.slice(8);
        const aRes = await callAudioBackend(`/account/${op}`, {}, op === 'status' ? 'GET' : 'POST');
        const text = aRes.ok && aRes.data
          ? `👤 𝐏𝐄𝐑𝐒𝐎𝐍𝐀𝐋 𝐀𝐂𝐂𝐎𝐔𝐍𝐓\n\nName: ${String(aRes.data.display_name || 'Connected')}\nUsername: ${String(aRes.data.username || '@account')}\nStatus: ${String(aRes.data.status || 'connected').toUpperCase()}`
          : `👤 𝐏𝐄𝐑𝐒𝐎𝐍𝐀𝐋 𝐀𝐂𝐂𝐎𝐔𝐍𝐓 𝐂𝐎𝐍𝐓𝐑𝐎𝐋\n\nℹ️ ${aRes.error}`;
        await tgCall(botToken, 'editMessageText', {
          chat_id: chatId,
          message_id: msgId,
          text,
          reply_markup: accountKeyboard(),
        });
      } else if (data === 'menu:owner') {
        const st = await callAudioBackend('/health', {}, 'GET');
        await tgCall(botToken, 'editMessageText', {
          chat_id: chatId,
          message_id: msgId,
          text: [
            '👑 𝐎𝐖𝐍𝐄𝐑 𝐃𝐀𝐒𝐇𝐁𝐎𝐀𝐑𝐃',
            '',
            '⚡ Vercel Webhook: Online',
            `🎧 VPS Audio Worker: ${st.ok ? 'Online' : 'Not Connected'}`,
            st.ok && st.data ? `🖥️ CPU / RAM: ${String(st.data.cpu_percent ?? 0)}% / ${String(st.data.ram_percent ?? 0)}%` : '',
          ].filter(Boolean).join('\n'),
          reply_markup: mainKeyboard(),
        });
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
            ? `🎤 𝐋𝐈𝐕𝐄 𝐂𝐎𝐍𝐍𝐄𝐂𝐓𝐄𝐃\n\n✅ Personal Account: Connected\n🎧 Voice Chat: Active\n📍 Group: ${String(jRes.data?.group_title || link)}\n⚡ Connection: Stable`
            : `❌ ${jRes.error}`;
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
      } else if (cmd === '/play' || msg.audio) {
        const source = msg.audio ? `tg_file:${msg.audio.file_id}` : arg;
        if (!source) {
          await tgCall(botToken, 'sendMessage', {
            chat_id: chatId,
            text: '🎵 Usage: /play <song name or direct audio link>',
          });
        } else {
          const pRes = await callAudioBackend('/player/play', {
            chat_id: chatId,
            source,
            requested_by: msg.from?.username || msg.from?.first_name || 'User',
          });
          const final = pRes.ok
            ? `🎧 𝐍𝐎𝐖 𝐏𝐋𝐀𝐘𝐈𝐍𝐆\n\n🎵 Song: ${String(pRes.data?.title || source)}\n▶️ Status: Playing`
            : `❌ ${pRes.error}`;
          await sendAnimatedFrames(
            botToken,
            chatId,
            [
              `🎵 Validating Music Source...\n◉ ○ ○ ○`,
              `🎚️ Processing Audio via FFmpeg...\n◉ ◉ ◉ ○`,
              `🔥 MUSIC STREAMING STARTED!\n◉ ◉ ◉ ◉`,
              final,
            ],
            playerKeyboard(Boolean(pRes.ok)),
          );
        }
      } else if (cmd === '/volume') {
        const volNum = Number(arg);
        const vRes = Number.isFinite(volNum)
          ? await callAudioBackend('/volume/set', { chat_id: chatId, volume: Math.min(200, Math.max(10, volNum)) })
          : await callAudioBackend('/volume/status', {}, 'GET');
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
      } else if (cmd === '/account' || cmd === '/owner' || cmd === '/stats' || cmd === '/status') {
        const r = await callAudioBackend(cmd === '/account' ? '/account/status' : '/health', {}, 'GET');
        await tgCall(botToken, 'sendMessage', {
          chat_id: chatId,
          text: r.ok ? `✅ Status:\n${JSON.stringify(r.data, null, 2)}` : `ℹ️ ${r.error}`,
          reply_markup: cmd === '/account' ? accountKeyboard() : mainKeyboard(),
        });
      } else {
        await tgCall(botToken, 'sendMessage', {
          chat_id: chatId,
          text: 'Send /start to open the Premium Music Bot control panel or /help for all commands.',
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

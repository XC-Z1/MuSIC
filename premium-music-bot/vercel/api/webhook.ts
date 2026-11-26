import crypto from 'node:crypto';
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { EQUALIZER_PRESETS, TELEGRAM_EFFECTS, sendEffectMessage } from '../lib/animations';
import { callAudioBackend } from '../lib/backendClient';
import {
  KEYBOARDS,
  answerCallbackQuery,
  editMessageText,
  sendMessage,
  toSmallCaps,
  type InlineKeyboardMarkup,
} from '../lib/telegram';

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

function isOwner(userId?: number): boolean {
  const ownerId = process.env.TELEGRAM_OWNER_ID || '';
  if (!ownerId) return true;
  return Boolean(userId && String(userId) === ownerId);
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
  return toSmallCaps(
    [
      actionLabel ? `⚡ Action: ${actionLabel}` : '',
      '🤖 Bot Webhook: ✅ Online (Vercel)',
      `🔑 API ID / Hash (Vercel): ${hasApiCreds ? '✅ Found (Redeployed)' : '⚪ Add TELEGRAM_API_ID & TELEGRAM_API_HASH in Vercel & Redeploy'}`,
      `🖥️ Audio Worker: ${hasWorker ? '✅ Linked' : '❌ Not Linked Yet'}`,
      '',
      hasWorker
        ? 'Audio Worker is linked! Open https://<your-worker-url>/setup in Chrome if you still need to verify OTP, or tap Connect.'
        : [
            'ℹ️ Vercel stops every 30s, so live Voice Chat audio needs a free Docker Worker (No VPS needed!):',
            '1️⃣ Deploy premium-music-bot/backend free on Hugging Face Spaces (Docker) or Koyeb/Render',
            '2️⃣ Set TELEGRAM_API_ID, TELEGRAM_API_HASH, TELEGRAM_BOT_TOKEN & AUDIO_BACKEND_API_SECRET there',
            '3️⃣ Open https://<your-worker-url>/setup on your phone Chrome to login with Phone + OTP',
            '4️⃣ Add AUDIO_BACKEND_URL & AUDIO_BACKEND_API_SECRET to Vercel Env Vars & Redeploy.',
          ].join('\n'),
    ]
      .filter(Boolean)
      .join('\n'),
  );
}

const WELCOME_TEXT = toSmallCaps(
  [
    '🎧 Welcome To Music Spam Bot',
    '',
    '🎶 Your Music, Your World!',
    '✨ Premium Music Experience',
    '⚡ Ultra Fast Performance',
    '🎚️ Advanced Music Controls',
    '🎤 Auto Live Join System',
    '🎧 Personal Account Control',
    '🔥 Smart Music Streaming',
  ].join('\n'),
);

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
      const data = cq.data || '';

      if (!chatId || !msgId) {
        await answerCallbackQuery(cq.id);
        return res.status(200).json({ ok: true });
      }

      if (data === 'menu:start') {
        await answerCallbackQuery(cq.id);
        await editMessageText(chatId, msgId, WELCOME_TEXT, KEYBOARDS.mainMenu());
      } else if (data === 'menu:play') {
        await answerCallbackQuery(cq.id, 'Send /search <song>, /play <song/url>, or forward an MP3!');
        await sendEffectMessage(
          chatId,
          cq.message?.chat.type || 'private',
          toSmallCaps(
            [
              '🎵 How To Select & Play Music',
              '',
              '1️⃣ Search & Pick: Send /search Kesariya',
              '2️⃣ Instant Play: Send /play Faded Alan Walker',
              '3️⃣ Paste Song Name, Link or Upload: Send a YouTube/MP3 link or audio file.',
            ].join('\n'),
          ),
          KEYBOARDS.player(false),
          TELEGRAM_EFFECTS.fire,
          EQUALIZER_PRESETS.playMusic,
        );
      } else if (data.startsWith('pick:')) {
        const rawRef = data.slice(5);
        const source = rawRef.startsWith('yt:') ? `https://www.youtube.com/watch?v=${rawRef.slice(3)}` : rawRef;
        await answerCallbackQuery(cq.id, hasWorker ? 'Playing selected track...' : 'VPS Audio Worker not linked yet!', !hasWorker);
        const pRes = await callAudioBackend<{ title?: string }>('/player/play', {
          chat_id: chatId,
          source,
          requested_by: cq.from.username || cq.from.first_name || 'User',
        });
        const text = pRes.ok
          ? toSmallCaps(`🎧 Now Playing\n\n🎵 Song: ${pRes.data?.title || source}\n▶️ Status: Playing`)
          : `❌ ${pRes.error}`;
        await sendEffectMessage(
          chatId,
          cq.message?.chat.type || 'private',
          text,
          KEYBOARDS.player(pRes.ok),
          TELEGRAM_EFFECTS.fire,
          EQUALIZER_PRESETS.playMusic,
        );
      } else if (data === 'menu:player' || data === 'menu:nowplaying' || data === 'menu:queue') {
        await answerCallbackQuery(cq.id);
        const st = await callAudioBackend<{
          title?: string; artist?: string; position?: number; duration?: number;
          volume?: number; muted?: boolean; status?: string; chat_title?: string;
        }>(`/player/status?chat_id=${chatId}`, {}, 'GET');
        if (!st.ok || !st.data) {
          await editMessageText(chatId, msgId, `🎧 𝐌𝐔𝐒𝐈𝐂 𝐏𝐋𝐀𝐘𝐄𝐑\n\n${getWorkerDiagnosticText('Music Player')}`, KEYBOARDS.mainMenu());
        } else {
          const d = st.data;
          const text = d.title
            ? [
                '🎧 𝐍𝐎𝐖 𝐏𝐋𝐀𝐘𝐈𝐍𝐆',
                '',
                `🎵 Song: ${d.title}`,
                `👤 Artist: ${d.artist || 'Unknown'}`,
                `⏱️ Duration: ${d.position ?? 0}s / ${d.duration ?? 0}s`,
                `🔊 Volume: ${d.muted ? 'Muted' : `${d.volume ?? 80}%`}`,
                `▶️ Status: ${d.status || 'Playing'}`,
                `🎤 Live: ${d.chat_title || 'Connected'}`,
                '',
                buildProgressBar(d.position ?? 0, d.duration ?? 100),
              ].join('\n')
            : '🎧 𝐌𝐔𝐒𝐈𝐂 𝐏𝐋𝐀𝐘𝐄𝐑\n\nNo active track. Send /search <song> or /play <url>.';
          await editMessageText(chatId, msgId, text, KEYBOARDS.player(d.status === 'playing'));
        }
      } else if (data === 'menu:volume') {
        await answerCallbackQuery(cq.id);
        const volRes = await callAudioBackend<{ volume: number; muted: boolean }>(`/volume/status?chat_id=${chatId}`, {}, 'GET');
        const fallback = chatVolumeFallback.get(String(chatId)) ?? { volume: 80, muted: false };
        const vol = volRes.ok && volRes.data ? clampVol(volRes.data.volume) : fallback.volume;
        const muted = volRes.ok && volRes.data ? Boolean(volRes.data.muted) : fallback.muted;
        const vText = toSmallCaps(
          `🎚️ Volume Control\n\n<  ${muted ? '🔇 Muted' : `🔊 ${vol}%`}  >\n\nRange: 10% – 200% (FFmpeg Real-Time Gain)`,
        );
        await sendEffectMessage(
          chatId,
          cq.message?.chat.type || 'private',
          vText,
          KEYBOARDS.volume(),
          TELEGRAM_EFFECTS.fire,
          EQUALIZER_PRESETS.volume,
        );
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
        await answerCallbackQuery(
          cq.id,
          nextVol.muted ? 'Audio Muted' : `Volume: ${nextVol.volume}% (10%–200%)`,
        );
        const vText = toSmallCaps(
          `🎚️ Volume Control\n\n<  ${nextVol.muted ? '🔇 Muted' : `🔊 ${nextVol.volume}%`}  >\n\nRange: 10% – 200% (FFmpeg Real-Time Gain)`,
        );
        await editMessageText(chatId, msgId, vText, KEYBOARDS.volume());
      } else if (data.startsWith('player:')) {
        const action = data.slice(7);
        const pRes = await callAudioBackend<{ status?: string; title?: string }>(`/player/${action}`, { chat_id: chatId });
        await answerCallbackQuery(cq.id, pRes.ok ? `Playback: ${action.toUpperCase()}` : pRes.error, !pRes.ok);
        const text = pRes.ok ? `🎧 Playback updated: ${action.toUpperCase()}` : `🎧 Playback (${action})\n\n${getWorkerDiagnosticText()}`;
        await editMessageText(chatId, msgId, text, KEYBOARDS.player(action === 'resume'));
      } else if (data === 'menu:live' || data === 'live:join_hint') {
        await answerCallbackQuery(
          cq.id,
          data === 'live:join_hint' ? 'Paste any https://t.me/group_name link in chat to auto-join!' : undefined,
          data === 'live:join_hint',
        );
        const lRes = await callAudioBackend<{ active: boolean; group_title?: string }>('/live/status', {}, 'GET');
        const text = lRes.ok && lRes.data?.active
          ? `🎤 𝐋𝐈𝐕𝐄 𝐂𝐎𝐍𝐍𝐄𝐂𝐓𝐄𝐃\n\n✅ Personal Account: Connected\n🎧 Voice Chat: Active (${lRes.data.group_title})`
          : `🎤 𝐋𝐈𝐕𝐄 𝐂𝐎𝐍𝐓𝐑𝐎𝐋 𝐏𝐀𝐍𝐄𝐋\n\nSend /joinlive https://t.me/group/123 (or paste the link directly).\n\n${hasWorker ? '' : getWorkerDiagnosticText('Auto Live Join')}`;
        await editMessageText(chatId, msgId, text, KEYBOARDS.live());
      } else if (data === 'live:leave') {
        const lRes = await callAudioBackend('/live/leave', { chat_id: chatId });
        await answerCallbackQuery(cq.id, lRes.ok ? 'Left Voice Chat cleanly.' : lRes.error, !lRes.ok);
        await editMessageText(chatId, msgId, lRes.ok ? '🚪 Left Voice Chat cleanly.' : getWorkerDiagnosticText('Leave Live'), KEYBOARDS.live());
      } else if (data === 'menu:account' || data.startsWith('account:')) {
        const op = data === 'menu:account' ? 'status' : data.slice(8);
        const aRes = await callAudioBackend<{ display_name?: string; username?: string; status?: string }>(
          `/account/${op}`,
          {},
          op === 'status' ? 'GET' : 'POST',
        );
        await answerCallbackQuery(
          cq.id,
          op === 'status'
            ? undefined
            : aRes.ok
              ? `Account ${op} completed.`
              : 'VPS Audio Worker not linked yet!',
          op !== 'status' && !aRes.ok,
        );
        const text = aRes.ok && aRes.data
          ? toSmallCaps(`👤 Personal Account\n\nName: ${aRes.data.display_name || 'Connected'}\nUsername: ${aRes.data.username || '@account'}\nStatus: ${aRes.data.status || 'connected'}`)
          : `${toSmallCaps('👤 Personal Account Control')}\n\n${getWorkerDiagnosticText(`Account ${op.toUpperCase()}`)}`;
        await editMessageText(chatId, msgId, text, KEYBOARDS.account());
      } else if (data === 'menu:owner') {
        await answerCallbackQuery(cq.id);
        if (!isOwner(cq.from.id)) {
          await sendMessage(chatId, '⛔ Owner permission required.');
        } else {
          const st = await callAudioBackend<{ active_calls?: number }>('/health', {}, 'GET');
          await editMessageText(
            chatId,
            msgId,
            `👑 𝐎𝐖𝐍𝐄𝐑 𝐃𝐀𝐒𝐇𝐁𝐎𝐀𝐑𝐃\n\nActive Calls: ${st.data?.active_calls ?? 0}\nBackend: ${st.ok ? 'Online' : 'Not Linked'}`,
            KEYBOARDS.mainMenu(),
          );
        }
      } else if (data === 'menu:help') {
        await answerCallbackQuery(cq.id);
        await editMessageText(
          chatId,
          msgId,
          '📚 Commands:\n/start /search /play /pause /resume /skip /stop /queue /nowplaying /volume /mute /unmute /joinlive /leavelive /live /account /connect /disconnect /reconnect /ping /stats /status',
          KEYBOARDS.mainMenu(),
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

      if (cmd === '/start') {
        await sendEffectMessage(
          chatId,
          chatType,
          WELCOME_TEXT,
          KEYBOARDS.mainMenu(),
          TELEGRAM_EFFECTS.confetti,
          EQUALIZER_PRESETS.welcome,
        );
      } else if (cmd === '/joinlive' || text.includes('t.me/') || text.includes('telegram.me/')) {
        const link = cmd === '/joinlive' ? arg : text;
        if (!link) {
          await sendMessage(chatId, toSmallCaps('❌ Invalid Live Link\nUsage: /joinlive https://t.me/example_group/123'));
        } else {
          const joinRes = await callAudioBackend<{ group_title?: string }>('/live/join', {
            link,
            chat_id: chatId,
            requested_by: msg.from?.id,
          });
          const finalText = joinRes.ok
            ? toSmallCaps(`🎤 Live Connected\n\n✅ Personal Account: Connected\n🎧 Voice Chat: Active\n📍 Group: ${joinRes.data?.group_title || link}\n⚡ Connection: Stable`)
            : `${toSmallCaps('❌ Auto Live Join Failed')}\n\n${hasWorker ? joinRes.error : getWorkerDiagnosticText('Auto Live Join')}`;
          await sendEffectMessage(
            chatId,
            chatType,
            finalText,
            KEYBOARDS.live(),
            TELEGRAM_EFFECTS.heart,
            EQUALIZER_PRESETS.joinLive,
          );
        }
      } else if (cmd === '/search') {
        if (!arg) {
          await sendEffectMessage(chatId, chatType, toSmallCaps('🔍 Usage: /search <song name>'), KEYBOARDS.mainMenu(), TELEGRAM_EFFECTS.fire);
        } else {
          const sRes = await callAudioBackend<{ results?: Array<{ id?: string; title?: string; url?: string }> }>('/player/search', {
            query: arg,
            limit: 5,
          });
          const results = sRes.data?.results || [];
          if (!sRes.ok || results.length === 0) {
            await sendEffectMessage(
              chatId,
              chatType,
              hasWorker ? toSmallCaps(`❌ No tracks found for "${arg}".`) : getWorkerDiagnosticText('Music Search'),
              KEYBOARDS.mainMenu(),
              TELEGRAM_EFFECTS.fire,
              EQUALIZER_PRESETS.searchMusic,
            );
          } else {
            const markup: InlineKeyboardMarkup = {
              inline_keyboard: [
                ...results.slice(0, 5).map((item, idx) => [
                  {
                    text: `${idx + 1}. 🎵 ${toSmallCaps(String(item.title || 'Track').slice(0, 42))}`,
                    callback_data: `pick:${item.id ? `yt:${item.id}` : String(item.url || '').slice(0, 56)}`,
                    style: 'success' as const,
                  },
                ]),
                [{ text: toSmallCaps('🔙 Main Menu'), callback_data: 'menu:start', style: 'primary' as const }],
              ],
            };
            await sendEffectMessage(
              chatId,
              chatType,
              toSmallCaps(`🔍 Select Music For: ${arg}`),
              markup,
              TELEGRAM_EFFECTS.fire,
              EQUALIZER_PRESETS.searchMusic,
            );
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
          await sendEffectMessage(
            chatId,
            chatType,
            toSmallCaps('❌ Provide a song name, URL, or audio file: /play <song>'),
            KEYBOARDS.mainMenu(),
            TELEGRAM_EFFECTS.fire,
            EQUALIZER_PRESETS.playMusic,
          );
        } else {
          const pRes = await callAudioBackend<{ title?: string; artist?: string }>('/player/play', {
            chat_id: chatId,
            source: query,
            requested_by: msg.from?.username || msg.from?.first_name || 'User',
          });
          const finalText = pRes.ok
            ? toSmallCaps(`🎧 Now Playing\n\n🎵 Song: ${pRes.data?.title || query}\n▶️ Status: Playing`)
            : `${toSmallCaps('❌ Cannot Play Music')}\n\n${hasWorker ? pRes.error : getWorkerDiagnosticText('Play Music')}`;
          await sendEffectMessage(
            chatId,
            chatType,
            finalText,
            KEYBOARDS.player(pRes.ok),
            TELEGRAM_EFFECTS.fire,
            EQUALIZER_PRESETS.playMusic,
          );
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
          toSmallCaps(`🎚️ Volume Control\n\n<  ${nextVol.muted ? '🔇 Muted' : `🔊 ${nextVol.volume}%`}  >\n\nRange: 10% – 200% (FFmpeg Real-Time Gain)`),
          KEYBOARDS.volume(),
          TELEGRAM_EFFECTS.fire,
          EQUALIZER_PRESETS.volume,
        );
      } else if (['/pause', '/resume', '/skip', '/stop'].includes(cmd)) {
        const action = cmd.slice(1);
        const r = await callAudioBackend(`/player/${action}`, { chat_id: chatId });
        await sendEffectMessage(
          chatId,
          chatType,
          r.ok ? toSmallCaps(`🎧 ${action.toUpperCase()} executed.`) : `❌ ${r.error}`,
          KEYBOARDS.player(action === 'resume'),
          action === 'stop' ? TELEGRAM_EFFECTS.thumbsDown : TELEGRAM_EFFECTS.fire,
        );
      } else if (cmd === '/leavelive') {
        const r = await callAudioBackend('/live/leave', { chat_id: chatId });
        await sendEffectMessage(chatId, chatType, r.ok ? toSmallCaps('🚪 Left Voice Chat.') : `❌ ${r.error}`, KEYBOARDS.live(), TELEGRAM_EFFECTS.thumbsDown);
      } else if (cmd === '/ping') {
        const t0 = Date.now();
        const r = await callAudioBackend('/health', {}, 'GET');
        await sendEffectMessage(chatId, chatType, toSmallCaps(`⚡ Pong! Vercel Webhook + Backend: ${Date.now() - t0}ms (${r.ok ? 'Online' : 'Offline'})`), KEYBOARDS.mainMenu(), TELEGRAM_EFFECTS.confetti);
      } else if (cmd === '/account' || cmd === '/connect' || cmd === '/disconnect' || cmd === '/reconnect') {
        if (!isOwner(msg.from?.id)) {
          await sendEffectMessage(chatId, chatType, toSmallCaps('⛔ Personal account controls are restricted to the Bot Owner.'), KEYBOARDS.mainMenu(), TELEGRAM_EFFECTS.thumbsDown);
        } else {
          const op = cmd === '/account' ? 'status' : cmd.slice(1);
          const r = await callAudioBackend(`/account/${op}`, {}, op === 'status' ? 'GET' : 'POST');
          await sendEffectMessage(
            chatId,
            chatType,
            r.ok ? toSmallCaps(`👤 Account ${op}: ${JSON.stringify(r.data)}`) : getWorkerDiagnosticText(cmd),
            KEYBOARDS.account(),
            cmd === '/disconnect' ? TELEGRAM_EFFECTS.thumbsDown : TELEGRAM_EFFECTS.heart,
          );
        }
      } else {
        await sendEffectMessage(chatId, chatType, toSmallCaps('Send /start to open the control menu, /search <song> to pick music, or paste a https://t.me/... Voice Chat link.'), KEYBOARDS.mainMenu(), TELEGRAM_EFFECTS.thumbsUp);
      }
    }

    return res.status(200).json({ ok: true });
  } catch (err) {
    console.error('Webhook error:', err instanceof Error ? err.message : 'unknown');
    return res.status(200).json({ ok: true });
  }
}

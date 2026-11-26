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
    message?: { message_id: number; chat: { id: number } };
    data?: string;
  };
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
      `🔑 API ID / Hash (Vercel): ${hasApiCreds ? '✅ Found (must also be in Audio Worker)' : '⚪ Not set'}`,
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
        await editMessageText(
          chatId,
          msgId,
          [
            '🎵 𝐇𝐎𝐖 𝐓𝐎 𝐒𝐄𝐋𝐄𝐂𝐓 & 𝐏𝐋𝐀𝐘 𝐌𝐔𝐒𝐈𝐂',
            '',
            '1️⃣ Search & Pick: Send /search Kesariya',
            '2️⃣ Instant Play: Send /play Faded Alan Walker',
            '3️⃣ Paste Link or Upload: Send a YouTube/MP3 link or audio file.',
          ].join('\n'),
          KEYBOARDS.player(false),
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
          ? `🎧 𝐍𝐎𝐖 𝐏𝐋𝐀𝐘𝐈𝐍𝐆\n\n🎵 Song: ${pRes.data?.title || source}\n▶️ Status: Playing`
          : `❌ ${pRes.error}`;
        await editMessageText(chatId, msgId, text, KEYBOARDS.player(pRes.ok));
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
        const vol = await callAudioBackend<{ volume: number; muted: boolean }>(`/volume/status?chat_id=${chatId}`, {}, 'GET');
        const vText = vol.ok && vol.data
          ? `🎚️ 𝐕𝐎𝐋𝐔𝐌𝐄 𝐂𝐎𝐍𝐓𝐑𝐎𝐋\n\n<  ${vol.data.muted ? '🔇 MUTED' : `🔊 ${vol.data.volume}%`}  >`
          : '🎚️ 𝐕𝐎𝐋𝐔𝐌𝐄 𝐂𝐎𝐍𝐓𝐑𝐎𝐋\n\n<  🔊 80%  >';
        await editMessageText(chatId, msgId, vText, KEYBOARDS.volume());
      } else if (data.startsWith('vol:')) {
        const action = data.slice(4);
        const resVol = await callAudioBackend<{ volume: number; muted: boolean }>('/volume/adjust', {
          chat_id: chatId,
          action,
        });
        await answerCallbackQuery(cq.id, resVol.ok ? `Volume: ${resVol.data?.volume ?? 80}%` : 'VPS Audio Worker not linked', !resVol.ok);
        const vText = resVol.ok && resVol.data
          ? `🎚️ 𝐕𝐎𝐋𝐔𝐌𝐄 𝐂𝐎𝐍𝐓𝐑𝐎𝐋\n\n<  ${resVol.data.muted ? '🔇 MUTED' : `🔊 ${resVol.data.volume}%`}  >`
          : `🎚️ 𝐕𝐎𝐋𝐔𝐌𝐄 𝐂𝐎𝐍𝐓𝐑𝐎𝐋\n\n${getWorkerDiagnosticText(`Volume ${action}`)}`;
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
            joinRes.ok ? TELEGRAM_EFFECTS.star : undefined,
            EQUALIZER_PRESETS.joinLive,
          );
        }
      } else if (cmd === '/search') {
        if (!arg) {
          await sendMessage(chatId, toSmallCaps('🔍 Usage: /search <song name>'));
        } else {
          const sRes = await callAudioBackend<{ results?: Array<{ id?: string; title?: string; url?: string }> }>('/player/search', {
            query: arg,
            limit: 5,
          });
          const results = sRes.data?.results || [];
          if (!sRes.ok || results.length === 0) {
            await sendMessage(chatId, hasWorker ? toSmallCaps(`❌ No tracks found for "${arg}".`) : getWorkerDiagnosticText('Music Search'));
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
              TELEGRAM_EFFECTS.thumbsUp,
            );
          }
        }
      } else if (cmd === '/play' || msg.audio || msg.voice || audioDoc || isMediaUrl(text)) {
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
          await sendMessage(chatId, toSmallCaps('❌ Provide a song name, URL, or audio file: /play <song>'));
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
            pRes.ok ? TELEGRAM_EFFECTS.fire : undefined,
            EQUALIZER_PRESETS.playMusic,
          );
        }
      } else if (cmd === '/volume') {
        const volNum = Number(arg);
        if (!Number.isFinite(volNum) || volNum < 10 || volNum > 200) {
          await sendMessage(chatId, '🎚️ Usage: /volume <10-200>', KEYBOARDS.volume());
        } else {
          const vRes = await callAudioBackend<{ volume: number }>('/volume/set', { chat_id: chatId, volume: volNum });
          await sendMessage(chatId, vRes.ok ? `🎚️ Volume set to ${vRes.data?.volume}%` : `❌ ${vRes.error}`, KEYBOARDS.volume());
        }
      } else if (['/pause', '/resume', '/skip', '/stop'].includes(cmd)) {
        const action = cmd.slice(1);
        const r = await callAudioBackend(`/player/${action}`, { chat_id: chatId });
        await sendMessage(chatId, r.ok ? `🎧 ${action.toUpperCase()} executed.` : `❌ ${r.error}`, KEYBOARDS.player(action === 'resume'));
      } else if (cmd === '/leavelive') {
        const r = await callAudioBackend('/live/leave', { chat_id: chatId });
        await sendMessage(chatId, r.ok ? '🚪 Left Voice Chat.' : `❌ ${r.error}`);
      } else if (cmd === '/ping') {
        const t0 = Date.now();
        const r = await callAudioBackend('/health', {}, 'GET');
        await sendMessage(chatId, `⚡ Pong! Vercel Webhook + Backend: ${Date.now() - t0}ms (${r.ok ? 'Online' : 'Offline'})`);
      } else if (cmd === '/account' || cmd === '/connect' || cmd === '/disconnect' || cmd === '/reconnect') {
        if (!isOwner(msg.from?.id)) {
          await sendMessage(chatId, '⛔ Personal account controls are restricted to the Bot Owner.');
        } else {
          const op = cmd === '/account' ? 'status' : cmd.slice(1);
          const r = await callAudioBackend(`/account/${op}`, {}, op === 'status' ? 'GET' : 'POST');
          await sendMessage(chatId, r.ok ? `👤 Account ${op}: ${JSON.stringify(r.data)}` : getWorkerDiagnosticText(cmd), KEYBOARDS.account());
        }
      } else {
        await sendMessage(chatId, 'Send /start to open the control menu, /search <song> to pick music, or paste a https://t.me/... Voice Chat link.', KEYBOARDS.mainMenu());
      }
    }

    return res.status(200).json({ ok: true });
  } catch (err) {
    console.error('Webhook error:', err instanceof Error ? err.message : 'unknown');
    return res.status(200).json({ ok: true });
  }
}

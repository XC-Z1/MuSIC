import crypto from 'node:crypto';
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { ANIMATION_PRESETS, playAnimatedSequence } from '../lib/animations';
import { callAudioBackend } from '../lib/backendClient';
import { KEYBOARDS, answerCallbackQuery, editMessageText, sendMessage } from '../lib/telegram';

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

function verifySecret(header: string | string[] | undefined): boolean {
  const expected = process.env.TELEGRAM_WEBHOOK_SECRET || '';
  if (!expected || typeof header !== 'string') return false;
  const a = Buffer.from(header, 'utf8');
  const b = Buffer.from(expected, 'utf8');
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

function isOwner(userId?: number): boolean {
  const ownerId = process.env.TELEGRAM_OWNER_ID || '';
  return Boolean(ownerId && userId && String(userId) === ownerId);
}

function buildProgressBar(pos: number, dur: number, width = 17): string {
  const ratio = Math.min(1, Math.max(0, pos / Math.max(1, dur)));
  const idx = Math.min(width - 1, Math.round(ratio * (width - 1)));
  return Array.from({ length: width }, (_, i) => (i === idx ? '●' : '━')).join('');
}

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

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method === 'GET') {
    return res.status(200).json({ ok: true, service: 'premium-music-bot-vercel-webhook' });
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ ok: false, error: 'Method Not Allowed' });
  }

  if (!verifySecret(req.headers['x-telegram-bot-api-secret-token'])) {
    return res.status(401).json({ ok: false, error: 'Unauthorized webhook secret' });
  }

  const update = req.body as TelegramUpdate;

  try {
    if (update.callback_query) {
      const cq = update.callback_query;
      const chatId = cq.message?.chat.id;
      const msgId = cq.message?.message_id;
      const data = cq.data || '';
      await answerCallbackQuery(cq.id);

      if (!chatId || !msgId) {
        return res.status(200).json({ ok: true });
      }

      if (data === 'menu:start') {
        await editMessageText(chatId, msgId, WELCOME_TEXT, KEYBOARDS.mainMenu());
      } else if (data === 'menu:play') {
        await editMessageText(chatId, msgId, '🎵 Send `/play <song name or audio URL>` or forward an MP3 file directly.', KEYBOARDS.mainMenu());
      } else if (data === 'menu:player' || data === 'menu:nowplaying') {
        const st = await callAudioBackend<{
          title?: string; artist?: string; position?: number; duration?: number;
          volume?: number; muted?: boolean; status?: string; chat_title?: string;
        }>('/player/status', {}, 'GET');
        if (!st.ok || !st.data) {
          await editMessageText(chatId, msgId, `❌ ${st.error}`, KEYBOARDS.mainMenu());
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
            : '🎧 𝐌𝐔𝐒𝐈𝐂 𝐏𝐋𝐀𝐘𝐄𝐑\n\nNo active track. Send /play <url or song>.';
          await editMessageText(chatId, msgId, text, KEYBOARDS.player(d.status === 'playing'));
        }
      } else if (data === 'menu:volume') {
        const vol = await callAudioBackend<{ volume: number; muted: boolean }>('/volume/status', {}, 'GET');
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
        const vText = resVol.ok && resVol.data
          ? `🎚️ 𝐕𝐎𝐋𝐔𝐌𝐄 𝐂𝐎𝐍𝐓𝐑𝐎𝐋\n\n<  ${resVol.data.muted ? '🔇 MUTED' : `🔊 ${resVol.data.volume}%`}  >`
          : `❌ ${resVol.error}`;
        await editMessageText(chatId, msgId, vText, KEYBOARDS.volume());
      } else if (data.startsWith('player:')) {
        const action = data.slice(7);
        const pRes = await callAudioBackend<{ status?: string; title?: string }>(`/player/${action}`, { chat_id: chatId });
        const text = pRes.ok ? `🎧 Playback updated: ${action.toUpperCase()}` : `❌ ${pRes.error}`;
        await editMessageText(chatId, msgId, text, KEYBOARDS.player(action === 'resume'));
      } else if (data === 'menu:live') {
        const lRes = await callAudioBackend<{ active: boolean; group_title?: string }>('/live/status', {}, 'GET');
        const text = lRes.ok && lRes.data?.active
          ? `🎤 𝐋𝐈𝐕𝐄 𝐂𝐎𝐍𝐍𝐄𝐂𝐓𝐄𝐃\n\n✅ Personal Account: Connected\n🎧 Voice Chat: Active (${lRes.data.group_title})`
          : '🎤 𝐋𝐈𝐕𝐄 𝐂𝐎𝐍𝐓𝐑𝐎𝐋 𝐏𝐀𝐍𝐄𝐋\n\nSend /joinlive https://t.me/group/123 to join a Voice Chat.';
        await editMessageText(chatId, msgId, text, KEYBOARDS.live());
      } else if (data === 'live:leave') {
        const lRes = await callAudioBackend('/live/leave', { chat_id: chatId });
        await editMessageText(chatId, msgId, lRes.ok ? '🚪 Left Voice Chat cleanly.' : `❌ ${lRes.error}`, KEYBOARDS.live());
      } else if (data === 'menu:account' || data.startsWith('account:')) {
        if (data === 'account:reconnect') {
          await playAnimatedSequence(chatId, ANIMATION_PRESETS.reconnect, KEYBOARDS.account());
        } else {
          if (data === 'account:connect' || data === 'account:disconnect') {
            await callAudioBackend(`/account/${data.split(':')[1]}`, {});
          }
          const aRes = await callAudioBackend<{ name?: string; username?: string; status?: string }>('/account/status', {}, 'GET');
          const text = aRes.ok && aRes.data
            ? `👤 𝐏𝐄𝐑𝐒𝐎𝐍𝐀𝐋 𝐀𝐂𝐂𝐎𝐔𝐍𝐓\n\nName: ${aRes.data.name}\nUsername: ${aRes.data.username}\nStatus: ${aRes.data.status}`
            : `❌ ${aRes.error}`;
          await editMessageText(chatId, msgId, text, KEYBOARDS.account());
        }
      } else if (data === 'menu:owner') {
        if (!isOwner(cq.from.id)) {
          await sendMessage(chatId, '⛔ Owner permission required.');
        } else {
          const st = await callAudioBackend<{ users?: number; groups?: number; active_calls?: number }>('/system/stats', {}, 'GET');
          await editMessageText(
            chatId,
            msgId,
            `👑 𝐎𝐖𝐍𝐄𝐑 𝐃𝐀𝐒𝐇𝐁𝐎𝐀𝐑𝐃\n\nActive Calls: ${st.data?.active_calls ?? 0}\nBackend: ${st.ok ? 'Online' : 'Offline'}`,
            KEYBOARDS.mainMenu(),
          );
        }
      } else if (data === 'menu:help') {
        await editMessageText(
          chatId,
          msgId,
          '📚 Commands:\n/start /play /pause /resume /skip /stop /queue /nowplaying /volume /mute /unmute /joinlive /leavelive /live /account /connect /disconnect /reconnect /ping /stats /status',
          KEYBOARDS.mainMenu(),
        );
      }
      return res.status(200).json({ ok: true });
    }

    if (update.message) {
      const msg = update.message;
      const chatId = msg.chat.id;
      const text = (msg.text || '').trim();
      const [rawCmd, ...rest] = text.split(/\s+/);
      const cmd = rawCmd.toLowerCase().split('@')[0];
      const arg = rest.join(' ').trim();

      if (cmd === '/start') {
        await playAnimatedSequence(chatId, [...ANIMATION_PRESETS.welcome, WELCOME_TEXT], KEYBOARDS.mainMenu());
      } else if (cmd === '/joinlive' || text.startsWith('https://t.me/')) {
        const link = cmd === '/joinlive' ? arg : text;
        if (!link) {
          await sendMessage(chatId, '❌ Invalid Live Link\nUsage: /joinlive https://t.me/example_group/123');
        } else {
          const joinRes = await callAudioBackend<{ group_title?: string }>('/live/join', { link, requested_by: msg.from?.id });
          const finalText = joinRes.ok
            ? `🎤 𝐋𝐈𝐕𝐄 𝐂𝐎𝐍𝐍𝐄𝐂𝐓𝐄𝐃\n\n✅ Personal Account: Connected\n🎧 Voice Chat: Active\n📍 Group: ${joinRes.data?.group_title || link}\n⚡ Connection: Stable`
            : `❌ ${joinRes.error}`;
          await playAnimatedSequence(chatId, [...ANIMATION_PRESETS.joinLive(link), finalText], KEYBOARDS.live());
        }
      } else if (cmd === '/play' || msg.audio) {
        const query = msg.audio ? `tg_file:${msg.audio.file_id}` : arg;
        if (!query) {
          await sendMessage(chatId, '❌ Provide a song URL or audio file: /play <url>');
        } else {
          const pRes = await callAudioBackend<{ title?: string; artist?: string }>('/player/play', {
            chat_id: chatId,
            source: query,
            requested_by: msg.from?.username || msg.from?.first_name || 'User',
          });
          const finalText = pRes.ok
            ? `🎧 𝐍𝐎𝐖 𝐏𝐋𝐀𝐘𝐈𝐍𝐆\n\n🎵 Song: ${pRes.data?.title || query}\n▶️ Status: Playing`
            : `❌ ${pRes.error}`;
          await playAnimatedSequence(chatId, [...ANIMATION_PRESETS.playMusic(query), finalText], KEYBOARDS.player(true));
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
          await sendMessage(chatId, r.ok ? `👤 Account ${op}: ${JSON.stringify(r.data)}` : `❌ ${r.error}`, KEYBOARDS.account());
        }
      } else {
        await sendMessage(chatId, 'Send /start to open the Premium Music Bot control menu or /help for commands.', KEYBOARDS.mainMenu());
      }
    }

    return res.status(200).json({ ok: true });
  } catch (err) {
    console.error('Webhook error:', err instanceof Error ? err.message : 'unknown');
    return res.status(200).json({ ok: true });
  }
}

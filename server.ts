import 'dotenv/config';
import express from 'express';
import fs from 'node:fs';
import path from 'node:path';
import JSZip from 'jszip';
import { createServer as createViteServer } from 'vite';
import {
  clampVolume,
  createInitialBotState,
  processBotInput,
  tickPlayback,
  type BotSystemState,
} from './src/lib/botEngine';
import {
  SlidingWindowRateLimiter,
  redactSecrets,
  validateSafeExternalUrl,
  verifyWebhookSecret,
} from './src/lib/security';

const app = express();
const PORT = 3000;
const PROJECT_BUNDLE_DIR = path.resolve(process.cwd(), 'premium-music-bot');

app.use(express.json({ limit: '1mb' }));

let botState: BotSystemState = createInitialBotState();
const rateLimiter = new SlidingWindowRateLimiter(60, 60_000);

function collectProjectFiles(dir: string, baseDir: string): Array<{ path: string; content: string; size: number }> {
  const results: Array<{ path: string; content: string; size: number }> = [];
  if (!fs.existsSync(dir)) return results;

  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const resolved = path.resolve(dir, entry.name);
    if (!resolved.startsWith(baseDir + path.sep)) {
      continue;
    }
    if (entry.isDirectory()) {
      results.push(...collectProjectFiles(resolved, baseDir));
    } else if (entry.isFile()) {
      const relPath = path.relative(baseDir, resolved).replace(/\\/g, '/');
      const content = fs.readFileSync(resolved, 'utf8');
      results.push({ path: relPath, content, size: Buffer.byteLength(content, 'utf8') });
    }
  }
  return results.sort((a, b) => a.path.localeCompare(b.path));
}

// Health check
app.get('/api/health', (_req, res) => {
  res.json({
    ok: true,
    webhookConfigured: Boolean(process.env.TELEGRAM_BOT_TOKEN && process.env.TELEGRAM_WEBHOOK_SECRET),
    backendConfigured: Boolean(process.env.AUDIO_BACKEND_URL),
  });
});

// Get live studio state
app.get('/api/bot/state', (_req, res) => {
  res.json(botState);
});

// Process simulated or dashboard-triggered command / inline callback
app.post('/api/bot/command', (req, res) => {
  const ipKey = req.ip || 'local';
  if (!rateLimiter.check(ipKey).allowed) {
    res.status(429).json({ ok: false, error: 'Rate limit exceeded. Wait a moment.' });
    return;
  }

  const input = typeof req.body?.input === 'string' ? req.body.input : '';
  const isCallback = Boolean(req.body?.isCallback);
  const senderUsername = typeof req.body?.senderUsername === 'string' ? req.body.senderUsername : '@owner_admin';

  if (!input.trim()) {
    res.status(400).json({ ok: false, error: 'Command or callback input is required.' });
    return;
  }

  botState = processBotInput(botState, input, { isCallback, senderUsername });
  res.json({ ok: true, state: botState });
});

// Advance playback timer (triggered by UI polling when playing)
app.post('/api/bot/tick', (req, res) => {
  const delta = typeof req.body?.deltaSec === 'number' && req.body.deltaSec > 0 && req.body.deltaSec <= 10
    ? req.body.deltaSec
    : 1;
  botState = tickPlayback(botState, delta);
  res.json({ ok: true, state: botState });
});

// Owner dashboard direct mutations
app.post('/api/bot/owner-action', (req, res) => {
  const action = typeof req.body?.action === 'string' ? req.body.action : '';

  if (action === 'toggle_maintenance') {
    botState = processBotInput(botState, 'owner:toggle_maintenance', { isCallback: true });
  } else if (action === 'restart_backend') {
    botState = processBotInput(botState, 'owner:restart_backend', { isCallback: true });
  } else if (action === 'set_volume') {
    const vol = clampVolume(Number(req.body?.volume));
    botState.playback.muted = false;
    botState.playback.volume = vol;
    botState.playback.previousVolume = vol;
  } else if (action === 'toggle_group_autojoin') {
    const groupId = String(req.body?.groupId || '');
    botState.groups = botState.groups.map((g) =>
      g.id === groupId ? { ...g, autoJoin: !g.autoJoin } : g,
    );
  } else if (action === 'toggle_user_ban') {
    const userId = String(req.body?.userId || '');
    botState.users = botState.users.map((u) =>
      u.id === userId && u.role !== 'owner' ? { ...u, banned: !u.banned } : u,
    );
  } else if (action === 'broadcast') {
    const msg = typeof req.body?.message === 'string' ? req.body.message.trim() : '';
    if (!msg) {
      res.status(400).json({ ok: false, error: 'Broadcast message cannot be empty.' });
      return;
    }
    botState = processBotInput(botState, `/broadcast ${msg}`);
  } else if (action === 'reset') {
    botState = createInitialBotState();
  } else {
    res.status(400).json({ ok: false, error: 'Unsupported owner action.' });
    return;
  }

  res.json({ ok: true, state: botState });
});

// Real Telegram Webhook endpoint (ready for Vercel / live Telegram Bot API)
app.post('/api/webhook', async (req, res) => {
  const expectedSecret = process.env.TELEGRAM_WEBHOOK_SECRET;
  if (expectedSecret) {
    const provided = req.header('x-telegram-bot-api-secret-token');
    if (!verifyWebhookSecret(provided, expectedSecret)) {
      res.status(401).json({ ok: false, error: 'Invalid webhook secret token.' });
      return;
    }
  }

  const update = req.body as Record<string, any>;
  const isCallback = Boolean(update?.callback_query);
  const inputText = isCallback
    ? String(update.callback_query?.data || '')
    : String(update?.message?.text || '');
  const chatId = isCallback
    ? update.callback_query?.message?.chat?.id
    : update?.message?.chat?.id;

  if (inputText) {
    botState = processBotInput(botState, inputText, { isCallback });
    const latestBotMsg = [...botState.messages].reverse().find((m) => m.sender === 'bot');

    if (process.env.TELEGRAM_BOT_TOKEN && chatId && latestBotMsg) {
      try {
        await fetch(`https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/sendMessage`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            chat_id: chatId,
            text: latestBotMsg.text,
            ...(latestBotMsg.inlineKeyboard
              ? {
                  reply_markup: {
                    inline_keyboard: latestBotMsg.inlineKeyboard.map((row) =>
                      row.map((btn) => ({ text: btn.text, callback_data: btn.callbackData })),
                    ),
                  },
                }
              : {}),
          }),
        });
      } catch (err) {
        console.error('Telegram API dispatch error:', redactSecrets(String(err)));
      }
    }
  }

  res.json({ ok: true });
});

// Code Explorer file list API (confined strictly to PROJECT_BUNDLE_DIR)
app.get('/api/files', (_req, res) => {
  try {
    const files = collectProjectFiles(PROJECT_BUNDLE_DIR, PROJECT_BUNDLE_DIR);
    res.json({ ok: true, files });
  } catch (err) {
    res.status(500).json({ ok: false, error: redactSecrets(String(err)) });
  }
});

// Download complete project bundle as ZIP
app.get('/api/export-zip', async (_req, res) => {
  try {
    const files = collectProjectFiles(PROJECT_BUNDLE_DIR, PROJECT_BUNDLE_DIR);
    const zip = new JSZip();
    for (const file of files) {
      zip.file(`premium-music-bot/${file.path}`, file.content);
    }
    const buffer = await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' });
    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', 'attachment; filename="premium-music-bot.zip"');
    res.send(buffer);
  } catch (err) {
    res.status(500).json({ ok: false, error: redactSecrets(String(err)) });
  }
});

const BOT_TOKEN_PATTERN = /^\d{8,12}:[A-Za-z0-9_-]{30,55}$/;

// Ephemeral Telegram setWebhook helper (never stores or logs token)
app.post('/api/telegram/set-webhook', async (req, res) => {
  const token = typeof req.body?.botToken === 'string' ? req.body.botToken.trim() : '';
  const webhookUrl = typeof req.body?.webhookUrl === 'string' ? req.body.webhookUrl.trim() : '';
  const secretToken = typeof req.body?.secretToken === 'string' ? req.body.secretToken.trim() : '';

  if (!BOT_TOKEN_PATTERN.test(token)) {
    res.status(400).json({ ok: false, error: 'Invalid Telegram Bot Token format.' });
    return;
  }

  const urlCheck = validateSafeExternalUrl(webhookUrl);
  if (!urlCheck.valid || !urlCheck.normalized?.startsWith('https://')) {
    res.status(400).json({ ok: false, error: urlCheck.reason || 'Webhook URL must use HTTPS.' });
    return;
  }

  try {
    const tgRes = await fetch(`https://api.telegram.org/bot${encodeURIComponent(token)}/setWebhook`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        url: urlCheck.normalized,
        allowed_updates: ['message', 'callback_query'],
        ...(secretToken ? { secret_token: secretToken } : {}),
      }),
    });
    const data = (await tgRes.json()) as Record<string, unknown>;
    res.status(tgRes.ok ? 200 : 400).json(data);
  } catch (err) {
    res.status(502).json({ ok: false, error: redactSecrets(String(err)) });
  }
});

// Ephemeral Telegram getWebhookInfo helper (never stores or logs token)
app.post('/api/telegram/webhook-info', async (req, res) => {
  const token = typeof req.body?.botToken === 'string' ? req.body.botToken.trim() : '';
  if (!BOT_TOKEN_PATTERN.test(token)) {
    res.status(400).json({ ok: false, error: 'Invalid Telegram Bot Token format.' });
    return;
  }

  try {
    const tgRes = await fetch(`https://api.telegram.org/bot${encodeURIComponent(token)}/getWebhookInfo`);
    const data = (await tgRes.json()) as Record<string, unknown>;
    res.status(tgRes.ok ? 200 : 400).json(data);
  } catch (err) {
    res.status(502).json({ ok: false, error: redactSecrets(String(err)) });
  }
});

async function startServer() {
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.resolve(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.resolve(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`TeleStream Studio running on http://localhost:${PORT}`);
  });
}

startServer();

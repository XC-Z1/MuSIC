---
title: TeleStream Audio Worker
emoji: 🎧
colorFrom: blue
colorTo: indigo
sdk: docker
app_port: 8080
pinned: false
---

# TeleStream Personal Account Audio Worker

Free-tier Docker MTProto + PyTgCalls + FFmpeg worker for **MUSIC SPAM BOT**.

## Environment Variables (Add in Space Settings → Variables and Secrets)
- `TELEGRAM_API_ID` (from my.telegram.org)
- `TELEGRAM_API_HASH` (from my.telegram.org)
- `TELEGRAM_BOT_TOKEN` (from @BotFather)
- `AUDIO_BACKEND_API_SECRET` (any strong random secret — use the exact same secret in Vercel)
- `TELEGRAM_STRING_SESSION_ENC` (optional at first — generated automatically when you visit `/setup` on your phone browser!)

## Mobile Login (No Terminal Needed)
1. Deploy this folder as a **Docker** Space (or on Koyeb / Render).
2. Open `https://<your-worker-url>/setup` in Chrome on your phone.
3. Enter your `AUDIO_BACKEND_API_SECRET`, Phone Number, and Telegram OTP to connect live!
4. Paste your Worker URL into Vercel's `AUDIO_BACKEND_URL` environment variable and Redeploy.

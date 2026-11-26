# 🎧 Ultimate Premium Telegram Music Bot — Complete Installation Guide (বাংলা + English)

## গুরুত্বপূর্ণ টেকনিক্যাল সীমাবদ্ধতা (Important Hosting Architecture)
- **Vercel / cPanel Shared Hosting:** এখানে **Bot Webhook, Inline Keyboard, Animated `editMessageText`, Database, এবং Owner Control API** 100% নির্ভুলভাবে চলবে।
- **কেন VPS বা Persistent Python Server দরকার?** Vercel হলো Serverless (প্রতি রিকোয়েস্ট ৩০ সেকেন্ডের মধ্যে বন্ধ হয়) এবং cPanel Shared Hosting-এ persistent MTProto TCP socket বা FFmpeg/PyTgCalls Voice Chat WebRTC stream চালানো সম্ভব নয়। তাই **Personal Account MTProto + PyTgCalls + FFmpeg Audio Worker** চলবে একটি ছোট VPS-এ (যেমন Ubuntu 22.04+), এবং **Vercel বা cPanel PHP** নিরাপদ HMAC-signed HTTPS API-এর মাধ্যমে সেই VPS Worker-কে কন্ট্রোল করবে।

---

## ধাপ ১: নিরাপত্তা সতর্কতা (Security First)
আপনি যদি পূর্বে কোনো চ্যাটে `BOT_TOKEN` বা `API_HASH` শেয়ার করে থাকেন, তবে প্রথমেই:
1. Telegram-এ `@BotFather` ওপেন করে `/revoke` দিয়ে নতুন `TELEGRAM_BOT_TOKEN` নিন।
2. `my.telegram.org` থেকে API credentials নিরাপদ রাখুন এবং কখনোই সোর্স কোডে হার্ডকোড করবেন না। সবকিছু শুধু `.env` অথবা Vercel Environment Variables-এ রাখুন।

---

## ধাপ ২: Vercel-এ Bot Webhook হোস্ট করা (Recommended Mode)
1. `premium-music-bot/vercel/` ফোল্ডারটি GitHub-এ push করুন অথবা `vercel --prod` চালান।
2. Vercel Project Settings → **Environment Variables**-এ নিচের ভেরিয়েবলগুলো দিন:
   - `TELEGRAM_BOT_TOKEN` = আপনার নতুন BotFather টোকেন
   - `TELEGRAM_WEBHOOK_SECRET` = ৩২ অক্ষরের র‍্যান্ডম হেক্স স্ট্রিং
   - `TELEGRAM_OWNER_ID` = আপনার নিজের Telegram Numeric User ID (`@userinfobot` থেকে পাবেন)
   - `AUDIO_BACKEND_URL` = আপনার VPS Python Worker-এর HTTPS URL (যেমন `https://audio.yourdomain.com`)
   - `AUDIO_BACKEND_API_SECRET` = ৬৪ অক্ষরের র‍্যান্ডম হেক্স সিক্রেট (VPS-এর সাথে একই হতে হবে)
3. Deploy শেষ হলে ব্রাউজার বা টার্মিনাল থেকে Webhook সেট করুন:
   ```bash
   curl -X POST "https://api.telegram.org/bot<YOUR_BOT_TOKEN>/setWebhook" \
     -H "Content-Type: application/json" \
     -d '{"url":"https://your-app.vercel.app/api/webhook","secret_token":"<YOUR_WEBHOOK_SECRET>"}'
   ```

---

## ধাপ ৩: cPanel PHP + MySQL সেটআপ (Mode A Alternative)
1. cPanel → **MySQL Databases**-এ নতুন ডাটাবেস তৈরি করুন এবং `database/schema.sql` ফাইলটি phpMyAdmin দিয়ে Import করুন।
2. `premium-music-bot/` ফোল্ডারের ফাইলগুলো আপলোড করুন (`public/` ফোল্ডারকে Document Root হিসেবে সেট করুন যাতে `config/`, `backend/`, `.env` পাবলিকলি অ্যাক্সেসযোগ্য না হয়)।
3. `.env.example` কপি করে `.env` বানান এবং সব তথ্য বসান।
4. CLI থেকে `php setup.php` চালিয়ে MySQL এবং Webhook ভেরিফাই করুন।

---

## ধাপ ৪: VPS-এ Python MTProto & FFmpeg Audio Worker চালু করা (Mode B)
1. Ubuntu VPS-এ Python 3.11+ ও FFmpeg ইনস্টল করুন:
   ```bash
   sudo apt update && sudo apt install -y python3 python3-venv python3-pip ffmpeg
   ```
2. `backend/` ডিরেক্টরিতে virtual environment তৈরি করে ডিপেন্ডেন্সি ইনস্টল করুন:
   ```bash
   cd premium-music-bot/backend
   python3 -m venv venv
   source venv/bin/activate
   pip install -r requirements.txt
   ```
3. Personal Account নিরাপদভাবে লগইন করে Encrypted Session তৈরি করুন (OTP কখনো বট চ্যাটে দেবেন না):
   ```bash
   python3 account_client.py --login
   ```
   আউটপুটে পাওয়া `TELEGRAM_STRING_SESSION_ENC=...` মানটি VPS-এর `.env` ফাইলে সেভ করুন।
4. Audio Streaming Backend চালু করুন:
   ```bash
   uvicorn main:app --host 0.0.0.0 --port 8080
   ```
   *(Production-এ Nginx + SSL Reverse Proxy দিয়ে `https://audio.yourdomain.com` এ পয়েন্ট করুন এবং systemd দিয়ে background service হিসেবে চালান।)*

---

## ধাপ ৫: প্রতিটি ফিচার টেস্ট করার পদ্ধতি
1. **Welcome & Animation Test:** বটে `/start` পাঠান — ৩-ধাপের লোডিং অ্যানিমেশন (`◉ ○ ○ ○`) হয়ে ৮টি বাটনসহ ওয়েলকাম মেসেজ আসবে।
2. **Auto Live Join Test:** আপনার গ্রুপে Voice Chat চালু করে বটে `/joinlive https://t.me/your_group/123` পাঠান — Personal Account স্বয়ংক্রিয়ভাবে জয়েন করে `LIVE CONNECTED` দেখাবে।
3. **Music Streaming & Volume Test:** `/play <direct_mp3_url>` পাঠান, এরপর Inline Keyboard থেকে `⏸️ Pause`, `⏭️ Skip`, এবং `🎚️ Volume Control` (`+10%`, `-10%`, `200%`, `Mute`) টেস্ট করুন।

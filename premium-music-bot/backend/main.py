import asyncio
import hashlib
import hmac
import os
import time
from contextlib import asynccontextmanager
import psutil
from dotenv import load_dotenv
from fastapi import Depends, FastAPI, Header, HTTPException, Request
from fastapi.responses import HTMLResponse
from pydantic import BaseModel
from pytgcalls import PyTgCalls

from account_client import PersonalAccountClient
from audio_stream import AudioStreamProcessor
from music_player import MusicPlayerController
from session_manager import SessionManager
from voice_chat import VoiceChatManager
from volume_control import VolumeController

load_dotenv(os.path.join(os.path.dirname(__file__), "..", ".env"))

API_SECRET = os.getenv("AUDIO_BACKEND_API_SECRET", "")
MUSIC_DIR = os.path.join(os.path.dirname(__file__), "..", "storage", "music")

account = PersonalAccountClient()
session_mgr = SessionManager(account, max_retries=3)
calls: PyTgCalls | None = None
voice_mgr: VoiceChatManager | None = None
processor = AudioStreamProcessor(MUSIC_DIR)
volumes = VolumeController(default_volume=80)
player: MusicPlayerController | None = None


@asynccontextmanager
async def lifespan(_: FastAPI):
    global calls, voice_mgr, player
    try:
        if account.has_session_configured():
            await account.connect()
            calls = PyTgCalls(account.client)
            await calls.start()
            voice_mgr = VoiceChatManager(account.client, calls)
            player = MusicPlayerController(calls, processor, volumes)
    except Exception as exc:
        print(f"[WARN] Startup MTProto init deferred: {exc}")
    task = asyncio.create_task(session_mgr.watchdog_loop())
    yield
    session_mgr.stop()
    task.cancel()
    await account.disconnect()


app = FastAPI(title="Telegram Personal Account Audio Streaming Backend", lifespan=lifespan)


@app.get("/")
async def root_liveness():
    return {
        "ok": True,
        "service": "telestream-audio-worker",
        "connected": account.connected,
        "setup_url": "/setup",
    }


async def verify_api_secret_header(x_api_secret: str = Header(default="")) -> None:
    if not API_SECRET or not hmac.compare_digest(x_api_secret, API_SECRET):
        raise HTTPException(status_code=401, detail="Invalid AUDIO_BACKEND_API_SECRET")


SETUP_HTML = """<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <title>MUSIC SPAM BOT — Mobile Account Setup</title>
  <style>
    body{margin:0;background:#0b1120;color:#e2e8f0;font-family:system-ui,-apple-system,sans-serif;padding:20px}
    .card{max-width:440px;margin:24px auto;background:#111827;border:1px solid #1f2937;border-radius:14px;padding:20px}
    h1{font-size:18px;margin:0 0 6px} p{font-size:13px;color:#94a3b8;line-height:1.5}
    label{display:block;font-size:12px;color:#94a3b8;margin:12px 0 4px}
    input{width:100%;box-sizing:border-box;padding:10px 12px;border-radius:8px;border:1px solid #334155;background:#0b1120;color:#f8fafc;font-size:14px}
    button{width:100%;margin-top:14px;padding:11px;border:0;border-radius:8px;background:#0284c7;color:#fff;font-weight:600;font-size:14px;cursor:pointer}
    button:disabled{opacity:.5}
    .box{margin-top:14px;padding:10px 12px;border-radius:8px;background:#0f172a;border:1px solid #1e293b;font-size:12px;word-break:break-all;white-space:pre-wrap}
    .hidden{display:none}
  </style>
</head>
<body>
  <div class="card">
    <h1>🎧 Personal Account Live Login</h1>
    <p>Connect your Telegram personal account from your phone browser — no laptop or terminal needed.</p>
    <label>Worker Secret (AUDIO_BACKEND_API_SECRET)</label>
    <input id="secret" type="password" placeholder="Paste your AUDIO_BACKEND_API_SECRET" />
    <label>Phone Number (with country code)</label>
    <input id="phone" type="tel" placeholder="+88017XXXXXXXX" />
    <label>API ID (optional if already set in Worker Env)</label>
    <input id="apiId" type="text" placeholder="e.g. 12345678" />
    <label>API Hash (optional if already set in Worker Env)</label>
    <input id="apiHash" type="password" placeholder="32-char API Hash" />
    <button id="sendBtn" type="button">1. Send Telegram OTP Code</button>
    <div id="otpSection" class="hidden">
      <label>Telegram OTP Code</label>
      <input id="code" type="text" placeholder="5-digit code from Telegram" />
      <label>2FA Cloud Password (only if enabled)</label>
      <input id="password" type="password" placeholder="Optional 2FA password" />
      <button id="verifyBtn" type="button">2. Verify &amp; Connect Live</button>
    </div>
    <div id="statusBox" class="box hidden"></div>
  </div>
  <script>
    let codeHash = '';
    const el = (id) => document.getElementById(id);
    const show = (msg) => { const b = el('statusBox'); b.textContent = msg; b.classList.remove('hidden'); };
    el('sendBtn').onclick = async () => {
      try {
        el('sendBtn').disabled = true;
        const r = await fetch('/auth/send-code', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'X-API-Secret': el('secret').value.trim() },
          body: JSON.stringify({
            phone: el('phone').value.trim(),
            api_id: el('apiId').value.trim() ? Number(el('apiId').value.trim()) : null,
            api_hash: el('apiHash').value.trim() || null
          })
        });
        const d = await r.json();
        if (!r.ok) { show('Error: ' + (d.detail || 'Failed')); return; }
        codeHash = d.phone_code_hash;
        el('otpSection').classList.remove('hidden');
        show('OTP sent to your Telegram app! Enter the code below.');
      } catch (e) { show('Network error.'); } finally { el('sendBtn').disabled = false; }
    };
    el('verifyBtn').onclick = async () => {
      try {
        el('verifyBtn').disabled = true;
        const r = await fetch('/auth/verify-code', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'X-API-Secret': el('secret').value.trim() },
          body: JSON.stringify({
            phone: el('phone').value.trim(),
            code: el('code').value.trim(),
            phone_code_hash: codeHash,
            password: el('password').value || null
          })
        });
        const d = await r.json();
        if (!r.ok) { show('Error: ' + (d.detail || 'Verification failed')); return; }
        if (d.requires_2fa) { show('2FA Password required — enter your Telegram Cloud Password and tap Verify again.'); return; }
        const sess = d.encrypted_session ? ('\\n\\nSave in Worker Env Vars for restarts:\\nTELEGRAM_STRING_SESSION_ENC=' + d.encrypted_session) : '';
        show('Connected Live as ' + (d.status && d.status.username ? d.status.username : 'Account') + '!' + sess);
      } catch (e) { show('Network error.'); } finally { el('verifyBtn').disabled = false; }
    };
  </script>
</body>
</html>"""


@app.get("/setup", response_class=HTMLResponse)
async def mobile_setup_page():
    return HTMLResponse(content=SETUP_HTML)


async def verify_hmac_auth(
    request: Request,
    x_api_secret: str = Header(default=""),
    x_timestamp: str = Header(default=""),
    x_signature: str = Header(default=""),
) -> None:
    if not API_SECRET or not hmac.compare_digest(x_api_secret, API_SECRET):
        raise HTTPException(status_code=401, detail="Invalid API Secret")
    try:
        ts = int(x_timestamp)
    except ValueError as exc:
        raise HTTPException(status_code=401, detail="Invalid Timestamp") from exc
    if abs(time.time() - ts) > 300:
        raise HTTPException(status_code=401, detail="Expired Request Timestamp")
    body = (await request.body()).decode("utf-8")
    expected = hmac.new(API_SECRET.encode("utf-8"), f"{ts}.{body}".encode("utf-8"), hashlib.sha256).hexdigest()
    if not hmac.compare_digest(x_signature, expected):
        raise HTTPException(status_code=401, detail="Invalid HMAC Signature")


class JoinLivePayload(BaseModel):
    link: str
    chat_id: int | None = None


class PlayPayload(BaseModel):
    chat_id: int
    source: str
    requested_by: str = "User"


class SearchPayload(BaseModel):
    query: str
    limit: int = 5


class VolumePayload(BaseModel):
    chat_id: int
    volume: int | None = None
    muted: bool = False
    action: str | None = None


class ChatPayload(BaseModel):
    chat_id: int


class AuthSendCodePayload(BaseModel):
    phone: str
    api_id: int | None = None
    api_hash: str | None = None


class AuthVerifyCodePayload(BaseModel):
    phone: str
    code: str
    phone_code_hash: str
    password: str | None = None


def _target_chat(chat_id: int) -> int:
    return voice_mgr.resolve_target_chat(chat_id) if voice_mgr else chat_id


@app.get("/health", dependencies=[Depends(verify_hmac_auth)])
async def health():
    return {
        "ok": True,
        "account": account.status(),
        "cpu_percent": psutil.cpu_percent(),
        "ram_percent": psutil.virtual_memory().percent,
        "active_calls": len(voice_mgr.active_chats) if voice_mgr else 0,
    }


@app.get("/account/status", dependencies=[Depends(verify_hmac_auth)])
async def account_status():
    return account.status()


@app.post("/account/connect", dependencies=[Depends(verify_hmac_auth)])
async def account_connect():
    global calls, voice_mgr, player
    st = await account.connect()
    if calls is None and account.client:
        calls = PyTgCalls(account.client)
        await calls.start()
        voice_mgr = VoiceChatManager(account.client, calls)
        player = MusicPlayerController(calls, processor, volumes)
    return st


@app.post("/account/disconnect", dependencies=[Depends(verify_hmac_auth)])
async def account_disconnect():
    return await account.disconnect()


@app.post("/auth/send-code", dependencies=[Depends(verify_api_secret_header)])
async def auth_send_code(payload: AuthSendCodePayload):
    try:
        return await account.start_web_login(payload.phone, payload.api_id, payload.api_hash)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(status_code=400, detail=f"Telegram login error: {exc}") from exc


@app.post("/auth/verify-code", dependencies=[Depends(verify_api_secret_header)])
async def auth_verify_code(payload: AuthVerifyCodePayload):
    global calls, voice_mgr, player
    try:
        res = await account.complete_web_login(payload.phone, payload.code, payload.phone_code_hash, payload.password)
        if res.get("ok") and account.client:
            calls = PyTgCalls(account.client)
            await calls.start()
            voice_mgr = VoiceChatManager(account.client, calls)
            player = MusicPlayerController(calls, processor, volumes)
        return res
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(status_code=400, detail=f"OTP verification failed: {exc}") from exc


@app.post("/account/reconnect", dependencies=[Depends(verify_hmac_auth)])
async def account_reconnect():
    await account.disconnect()
    return await account.connect()


@app.post("/live/join", dependencies=[Depends(verify_hmac_auth)])
async def live_join(payload: JoinLivePayload):
    if not voice_mgr or not account.connected:
        raise HTTPException(status_code=503, detail="Personal account is not connected.")
    return await voice_mgr.resolve_and_join(payload.link, controller_chat_id=payload.chat_id)


@app.post("/live/leave", dependencies=[Depends(verify_hmac_auth)])
async def live_leave(payload: ChatPayload):
    if not voice_mgr:
        return {"ok": True}
    await voice_mgr.leave(payload.chat_id)
    return {"ok": True}


@app.get("/live/status", dependencies=[Depends(verify_hmac_auth)])
async def live_status():
    active = list(voice_mgr.active_chats.values()) if voice_mgr else []
    return {"active": bool(active), "sessions": active, "group_title": active[0]["group_title"] if active else None}


@app.post("/player/search", dependencies=[Depends(verify_hmac_auth)])
async def player_search(payload: SearchPayload):
    try:
        results = await asyncio.to_thread(processor.search_tracks, payload.query, payload.limit)
        return {"results": results}
    except Exception as exc:
        raise HTTPException(status_code=400, detail=f"Search failed: {exc}") from exc


@app.post("/player/play", dependencies=[Depends(verify_hmac_auth)])
async def player_play(payload: PlayPayload):
    if not player:
        raise HTTPException(status_code=503, detail="Streaming Backend Offline")
    target = _target_chat(payload.chat_id)
    return await player.play(target, payload.source, payload.requested_by)


@app.post("/player/{action}", dependencies=[Depends(verify_hmac_auth)])
async def player_action(action: str, payload: ChatPayload):
    if not player:
        raise HTTPException(status_code=503, detail="Streaming Backend Offline")
    target = _target_chat(payload.chat_id)
    if action == "pause":
        return await player.pause(target)
    if action == "resume":
        return await player.resume(target)
    if action == "skip":
        return await player.skip(target)
    if action == "stop":
        return await player.stop(target)
    raise HTTPException(status_code=400, detail="Unsupported action")


@app.get("/player/status", dependencies=[Depends(verify_hmac_auth)])
async def player_status(chat_id: int = 0):
    if not player:
        return {"status": "idle", "volume": 80, "muted": False}
    return player.status(_target_chat(chat_id))


@app.post("/volume/set", dependencies=[Depends(verify_hmac_auth)])
@app.post("/volume/adjust", dependencies=[Depends(verify_hmac_auth)])
async def volume_update(payload: VolumePayload):
    target = _target_chat(payload.chat_id)
    if payload.action:
        st = volumes.adjust(target, payload.action)
    else:
        st = volumes.set_volume(target, payload.volume or 80, payload.muted)
    if player:
        await player.apply_volume(target)
    return st


@app.get("/volume/status", dependencies=[Depends(verify_hmac_auth)])
async def volume_status(chat_id: int = 0):
    return volumes.get_state(_target_chat(chat_id))

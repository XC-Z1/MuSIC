import asyncio
import hashlib
import hmac
import os
import time
from contextlib import asynccontextmanager
import psutil
from dotenv import load_dotenv
from fastapi import Depends, FastAPI, Header, HTTPException, Request
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
    return {"ok": True, "service": "telestream-audio-worker", "connected": account.connected}


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

import time
from collections import deque
from pytgcalls import PyTgCalls
from audio_stream import AudioStreamProcessor
from volume_control import VolumeController


class MusicPlayerController:
    """Manages playback queue, repeat modes, FFmpeg streaming, and live volume updates."""

    def __init__(self, calls: PyTgCalls, processor: AudioStreamProcessor, volumes: VolumeController) -> None:
        self.calls = calls
        self.processor = processor
        self.volumes = volumes
        self.queues: dict[int, deque] = {}
        self.history: dict[int, deque] = {}
        self.current: dict[int, dict] = {}
        self.repeat_mode: dict[int, str] = {}

    async def play(self, chat_id: int, source: str, requested_by: str) -> dict:
        meta = self.processor.resolve_audio_source(source)
        track = {
            **meta,
            "requested_by": requested_by,
            "started_at": time.time(),
            "status": "playing",
        }
        q = self.queues.setdefault(chat_id, deque())
        if chat_id in self.current and self.current[chat_id].get("status") in {"playing", "paused"}:
            q.append(track)
            return {**track, "queued": True, "queue_size": len(q)}

        await self._start_stream(chat_id, track)
        return {**track, "queued": False, "queue_size": len(q)}

    async def _start_stream(self, chat_id: int, track: dict) -> None:
        vol = self.volumes.effective_volume(chat_id)
        stream = self.processor.build_media_stream(track["stream_url"], max(10, vol) if vol > 0 else 10)
        await self.calls.play(chat_id, stream)
        if vol == 0:
            await self.calls.mute(chat_id)
        track["started_at"] = time.time()
        track["status"] = "playing"
        self.current[chat_id] = track

    async def pause(self, chat_id: int) -> dict:
        await self.calls.pause(chat_id)
        if chat_id in self.current:
            self.current[chat_id]["status"] = "paused"
        return self.status(chat_id)

    async def resume(self, chat_id: int) -> dict:
        await self.calls.resume(chat_id)
        if chat_id in self.current:
            self.current[chat_id]["status"] = "playing"
        return self.status(chat_id)

    async def skip(self, chat_id: int) -> dict:
        prev = self.current.get(chat_id)
        if prev:
            self.history.setdefault(chat_id, deque(maxlen=20)).appendleft(prev)
        q = self.queues.setdefault(chat_id, deque())
        if q:
            nxt = q.popleft()
            await self._start_stream(chat_id, nxt)
        else:
            await self.stop(chat_id)
        return self.status(chat_id)

    async def stop(self, chat_id: int) -> dict:
        try:
            await self.calls.leave_call(chat_id)
        except Exception:
            pass
        self.queues.get(chat_id, deque()).clear()
        self.current.pop(chat_id, None)
        return {"status": "stopped"}

    async def apply_volume(self, chat_id: int) -> dict:
        vol_state = self.volumes.get_state(chat_id)
        if vol_state["muted"]:
            await self.calls.mute(chat_id)
        else:
            await self.calls.unmute(chat_id)
            if chat_id in self.current:
                stream = self.processor.build_media_stream(
                    self.current[chat_id]["stream_url"],
                    vol_state["volume"],
                )
                await self.calls.play(chat_id, stream)
        return vol_state

    def status(self, chat_id: int) -> dict:
        cur = self.current.get(chat_id)
        vol = self.volumes.get_state(chat_id)
        if not cur:
            return {"status": "idle", "volume": vol["volume"], "muted": vol["muted"]}
        elapsed = int(max(0, time.time() - cur["started_at"]))
        return {
            "title": cur["title"],
            "artist": cur["artist"],
            "duration": cur["duration"],
            "position": min(cur["duration"], elapsed),
            "status": cur["status"],
            "volume": vol["volume"],
            "muted": vol["muted"],
        }

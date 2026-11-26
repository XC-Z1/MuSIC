import ipaddress
import json
import os
import re
import socket
import subprocess
import urllib.request
from urllib.parse import urlparse
from pytgcalls.types import AudioQuality, MediaStream


class AudioStreamProcessor:
    """Validates safe media URLs, searches tracks, downloads Telegram audio, and builds FFmpeg MediaStreams."""

    def __init__(self, cache_dir: str) -> None:
        self.cache_dir = cache_dir
        os.makedirs(self.cache_dir, exist_ok=True)

    @staticmethod
    def validate_safe_url(url: str) -> None:
        parsed = urlparse(url.strip())
        if parsed.scheme not in {"http", "https"} or not parsed.hostname:
            raise ValueError("Only HTTP/HTTPS audio URLs are allowed.")
        host = parsed.hostname.lower()
        if host in {"localhost", "127.0.0.1", "0.0.0.0", "169.254.169.254"}:
            raise ValueError("Blocked unsafe network address.")
        try:
            ip = ipaddress.ip_address(socket.gethostbyname(host))
            if ip.is_private or ip.is_loopback or ip.is_link_local or ip.is_reserved:
                raise ValueError("Blocked private/loopback IP.")
        except socket.gaierror:
            pass

    @staticmethod
    def search_tracks(query: str, limit: int = 5) -> list[dict]:
        clean = query.strip()
        if not clean:
            return []
        safe_limit = max(1, min(10, int(limit)))
        proc = subprocess.run(
            [
                "yt-dlp",
                "--flat-playlist",
                "--dump-single-json",
                "--no-warnings",
                f"ytsearch{safe_limit}:{clean}",
            ],
            capture_output=True,
            text=True,
            timeout=20,
            check=True,
        )
        data = json.loads(proc.stdout or "{}")
        entries = data.get("entries") or []
        results: list[dict] = []
        for entry in entries[:safe_limit]:
            vid = str(entry.get("id") or "")
            url = str(entry.get("url") or entry.get("webpage_url") or "")
            if vid and not url.startswith("http"):
                url = f"https://www.youtube.com/watch?v={vid}"
            results.append(
                {
                    "id": vid,
                    "title": str(entry.get("title") or "Unknown Track"),
                    "artist": str(entry.get("uploader") or entry.get("channel") or "YouTube"),
                    "duration": int(entry.get("duration") or 210),
                    "url": url,
                }
            )
        return results

    def _download_telegram_file(self, file_id: str) -> dict:
        bot_token = os.getenv("TELEGRAM_BOT_TOKEN", "").strip()
        if not bot_token:
            raise ValueError("TELEGRAM_BOT_TOKEN missing in VPS .env to download uploaded Telegram audio.")
        safe_id = re.sub(r"[^a-zA-Z0-9_-]", "", file_id)
        if not safe_id:
            raise ValueError("Invalid Telegram audio file_id.")

        meta_url = f"https://api.telegram.org/bot{bot_token}/getFile?file_id={safe_id}"
        with urllib.request.urlopen(meta_url, timeout=15) as resp:
            meta = json.loads(resp.read().decode("utf-8"))
        file_path = str((meta.get("result") or {}).get("file_path") or "")
        if not file_path:
            raise ValueError("Could not resolve Telegram audio file path.")

        ext = os.path.splitext(file_path)[1] or ".mp3"
        ext = re.sub(r"[^a-zA-Z0-9.]", "", ext)[:10] or ".mp3"
        dest = os.path.abspath(os.path.join(self.cache_dir, f"tg_{safe_id[:32]}{ext}"))
        if not dest.startswith(os.path.abspath(self.cache_dir) + os.sep):
            raise ValueError("Unsafe cache file path.")

        dl_url = f"https://api.telegram.org/file/bot{bot_token}/{file_path}"
        with urllib.request.urlopen(dl_url, timeout=30) as src, open(dest, "wb") as out:
            out.write(src.read())

        return {
            "title": os.path.basename(file_path) or "Telegram Audio",
            "artist": "Telegram Upload",
            "stream_url": dest,
            "duration": 210,
        }

    def resolve_audio_source(self, source: str) -> dict:
        clean = source.strip()
        if not clean:
            raise ValueError("Provide a song name, direct audio URL, or Telegram audio file.")

        if clean.startswith("tg_file:"):
            return self._download_telegram_file(clean.split(":", 1)[1])

        if clean.startswith("http://") or clean.startswith("https://"):
            self.validate_safe_url(clean)
            if clean.lower().split("?")[0].endswith((".mp3", ".ogg", ".wav", ".m4a", ".aac", ".flac")):
                return {
                    "title": os.path.basename(urlparse(clean).path) or "Direct Audio Stream",
                    "artist": "Direct Audio Link",
                    "stream_url": clean,
                    "duration": 240,
                }
            proc = subprocess.run(
                ["yt-dlp", "--no-playlist", "-f", "bestaudio", "-g", "--get-title", "--get-duration", clean],
                capture_output=True,
                text=True,
                timeout=20,
                check=True,
            )
            lines = [line.strip() for line in proc.stdout.splitlines() if line.strip()]
            return {
                "title": lines[0] if len(lines) > 0 else "Stream Track",
                "artist": "Supported Media Source",
                "stream_url": lines[1] if len(lines) > 1 else clean,
                "duration": self._parse_duration(lines[2] if len(lines) > 2 else "3:45"),
            }

        # Server local music library fallback (strict path confinement)
        safe_name = re.sub(r"[^a-zA-Z0-9._ -]", "", clean)
        candidate = os.path.abspath(os.path.join(self.cache_dir, safe_name))
        if safe_name and candidate.startswith(os.path.abspath(self.cache_dir) + os.sep) and os.path.isfile(candidate):
            return {
                "title": safe_name,
                "artist": "Server Library",
                "stream_url": candidate,
                "duration": 210,
            }

        # Song name search via yt-dlp ytsearch1
        proc = subprocess.run(
            [
                "yt-dlp",
                "--no-playlist",
                "-f",
                "bestaudio",
                "-g",
                "--get-title",
                "--get-duration",
                f"ytsearch1:{clean}",
            ],
            capture_output=True,
            text=True,
            timeout=20,
            check=True,
        )
        lines = [line.strip() for line in proc.stdout.splitlines() if line.strip()]
        if len(lines) < 2:
            raise ValueError(f"No playable audio stream found for '{clean}'.")
        return {
            "title": lines[0],
            "artist": "YouTube Search",
            "stream_url": lines[1],
            "duration": self._parse_duration(lines[2] if len(lines) > 2 else "3:45"),
        }

    @staticmethod
    def build_media_stream(stream_url: str, volume_percent: int) -> MediaStream:
        gain = max(0.1, min(2.0, volume_percent / 100.0))
        return MediaStream(
            stream_url,
            audio_parameters=AudioQuality.STUDIO,
            ffmpeg_parameters=f"-af volume={gain:.2f}",
        )

    @staticmethod
    def _parse_duration(raw: str) -> int:
        parts = [int(p) for p in raw.split(":") if p.isdigit()]
        if len(parts) == 3:
            return parts[0] * 3600 + parts[1] * 60 + parts[2]
        if len(parts) == 2:
            return parts[0] * 60 + parts[1]
        return parts[0] if parts else 210

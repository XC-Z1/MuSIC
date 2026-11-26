import ipaddress
import os
import re
import socket
import subprocess
from urllib.parse import urlparse
from pytgcalls.types import AudioQuality, MediaStream


class AudioStreamProcessor:
    """Validates safe media URLs and builds FFmpeg-processed MediaStream pipelines."""

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

    def resolve_audio_source(self, source: str) -> dict:
        clean = source.strip()
        if clean.startswith("http://") or clean.startswith("https://"):
            self.validate_safe_url(clean)
            if clean.lower().endswith((".mp3", ".ogg", ".wav", ".m4a", ".aac", ".flac")):
                return {
                    "title": os.path.basename(urlparse(clean).path) or "Direct Audio Stream",
                    "artist": "Direct Audio Link",
                    "stream_url": clean,
                    "duration": 240,
                }
            # Extract direct stream via yt-dlp without executing shell
            proc = subprocess.run(
                ["yt-dlp", "--no-playlist", "-f", "bestaudio", "-g", "--get-title", "--get-duration", clean],
                capture_output=True,
                text=True,
                timeout=15,
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
        if candidate.startswith(os.path.abspath(self.cache_dir) + os.sep) and os.path.isfile(candidate):
            return {
                "title": safe_name,
                "artist": "Server Library",
                "stream_url": candidate,
                "duration": 210,
            }

        raise ValueError("Provide a valid direct audio URL, supported stream link, or server music filename.")

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

import asyncio
import base64
import hashlib
import os
import re
import time
from typing import Optional
from cryptography.fernet import Fernet
from pyrogram import Client
from pyrogram.errors import SessionPasswordNeeded


def _derive_fernet_key(secret: str) -> bytes:
    digest = hashlib.sha256(secret.encode("utf-8")).digest()
    return base64.urlsafe_b64encode(digest)


def decrypt_session_string(encrypted_blob: str, encryption_key: str) -> str:
    if not encrypted_blob or not encryption_key:
        return ""
    f = Fernet(_derive_fernet_key(encryption_key))
    return f.decrypt(encrypted_blob.encode("utf-8")).decode("utf-8")


def encrypt_session_string(session_string: str, encryption_key: str) -> str:
    f = Fernet(_derive_fernet_key(encryption_key))
    return f.encrypt(session_string.encode("utf-8")).decode("utf-8")


class PersonalAccountClient:
    """Manages the Personal Telegram Account MTProto Client securely."""

    def __init__(self) -> None:
        raw_api_id = os.getenv("TELEGRAM_API_ID") or os.getenv("API_ID") or "0"
        self.api_id = int(raw_api_id) if raw_api_id.isdigit() else 0
        self.api_hash = (os.getenv("TELEGRAM_API_HASH") or os.getenv("API_HASH") or "").strip()
        self.enc_key = (
            os.getenv("TELEGRAM_SESSION_ENCRYPTION_KEY")
            or os.getenv("AUDIO_BACKEND_API_SECRET")
            or ""
        ).strip()
        self.enc_session = os.getenv("TELEGRAM_STRING_SESSION_ENC", "").strip()
        self.plain_session = (os.getenv("TELEGRAM_STRING_SESSION") or os.getenv("SESSION_STRING") or "").strip()
        self.client: Optional[Client] = None
        self.connected = False
        self.display_name = "Not Connected"
        self.username = "@unlinked"
        self.user_id: Optional[int] = None
        self._pending_logins: dict[str, dict] = {}

    def has_session_configured(self) -> bool:
        return bool((self.enc_session and self.enc_key) or self.plain_session)

    async def connect_with_session(
        self,
        session_str: str,
        api_id: Optional[int] = None,
        api_hash: Optional[str] = None,
    ) -> dict:
        if api_id:
            self.api_id = api_id
        if api_hash:
            self.api_hash = api_hash.strip()
        if not self.api_id or not self.api_hash:
            raise RuntimeError("TELEGRAM_API_ID (or API_ID) and TELEGRAM_API_HASH (or API_HASH) must be set.")
        if not session_str.strip():
            raise RuntimeError("Session string cannot be empty.")

        if self.client and self.client.is_connected:
            await self.client.stop()

        self.plain_session = session_str.strip()
        self.client = Client(
            name="personal_music_controller",
            api_id=self.api_id,
            api_hash=self.api_hash,
            session_string=self.plain_session,
            in_memory=True,
        )
        await self.client.start()
        me = await self.client.get_me()
        self.connected = True
        self.user_id = me.id
        self.display_name = f"{me.first_name or ''} {me.last_name or ''}".strip() or "Personal Account"
        self.username = f"@{me.username}" if me.username else f"id:{me.id}"
        return self.status()

    async def connect(self) -> dict:
        if not self.api_id or not self.api_hash:
            raise RuntimeError("TELEGRAM_API_ID (or API_ID) and TELEGRAM_API_HASH (or API_HASH) must be set.")

        session_str = (
            decrypt_session_string(self.enc_session, self.enc_key)
            if self.enc_session and self.enc_key
            else self.plain_session.strip()
        )
        if not session_str:
            raise RuntimeError("Session string missing. Open /setup on your Audio Worker or set SESSION_STRING.")

        if self.client is None:
            self.client = Client(
                name="personal_music_controller",
                api_id=self.api_id,
                api_hash=self.api_hash,
                session_string=session_str,
                in_memory=True,
            )

        if not self.client.is_connected:
            await self.client.start()

        me = await self.client.get_me()
        self.connected = True
        self.user_id = me.id
        self.display_name = f"{me.first_name or ''} {me.last_name or ''}".strip() or "Personal Account"
        self.username = f"@{me.username}" if me.username else f"id:{me.id}"
        return self.status()

    def _prune_pending_logins(self) -> None:
        now = time.time()
        expired = [k for k, v in self._pending_logins.items() if now - v["created_at"] > 300]
        for k in expired:
            entry = self._pending_logins.pop(k, None)
            if entry and entry.get("client"):
                try:
                    asyncio.create_task(entry["client"].disconnect())
                except Exception:
                    pass

    async def start_web_login(
        self,
        phone: str,
        api_id: Optional[int] = None,
        api_hash: Optional[str] = None,
    ) -> dict:
        self._prune_pending_logins()
        clean_phone = re.sub(r"[\s()-]", "", phone.strip())
        if not re.match(r"^\+?\d{7,16}$", clean_phone):
            raise ValueError("Enter a valid phone number with country code (e.g. +88017...).")

        use_api_id = api_id or self.api_id
        use_api_hash = (api_hash or self.api_hash).strip()
        if not use_api_id or not use_api_hash:
            raise ValueError("API ID and API Hash are required (in env vars or form).")

        if len(self._pending_logins) >= 5:
            oldest_key = min(self._pending_logins, key=lambda k: self._pending_logins[k]["created_at"])
            old = self._pending_logins.pop(oldest_key, None)
            if old and old.get("client"):
                try:
                    await old["client"].disconnect()
                except Exception:
                    pass

        temp = Client(
            name=f"web_login_{int(time.time())}",
            api_id=use_api_id,
            api_hash=use_api_hash,
            in_memory=True,
        )
        await temp.connect()
        sent = await temp.send_code(clean_phone)
        key = f"{clean_phone}:{sent.phone_code_hash}"
        self._pending_logins[key] = {
            "client": temp,
            "phone": clean_phone,
            "phone_code_hash": sent.phone_code_hash,
            "api_id": use_api_id,
            "api_hash": use_api_hash,
            "created_at": time.time(),
        }
        return {"ok": True, "phone": clean_phone, "phone_code_hash": sent.phone_code_hash}

    async def complete_web_login(
        self,
        phone: str,
        code: str,
        phone_code_hash: str,
        password: Optional[str] = None,
    ) -> dict:
        self._prune_pending_logins()
        clean_phone = re.sub(r"[\s()-]", "", phone.strip())
        clean_code = re.sub(r"\s+", "", code.strip())
        key = f"{clean_phone}:{phone_code_hash.strip()}"
        pending = self._pending_logins.get(key)
        if not pending:
            raise ValueError("Login code expired or invalid. Request a fresh OTP code.")

        temp: Client = pending["client"]
        try:
            try:
                await temp.sign_in(clean_phone, pending["phone_code_hash"], clean_code)
            except SessionPasswordNeeded:
                if not password:
                    return {"ok": False, "requires_2fa": True, "message": "2FA Cloud Password required."}
                await temp.check_password(password)

            raw_session = await temp.export_session_string()
            enc_session = encrypt_session_string(raw_session, self.enc_key) if self.enc_key else ""
        finally:
            if raw_session_ready := locals().get("raw_session"):
                self._pending_logins.pop(key, None)
                try:
                    await temp.disconnect()
                except Exception:
                    pass

        if raw_session_ready:
            status = await self.connect_with_session(
                raw_session_ready,
                api_id=pending["api_id"],
                api_hash=pending["api_hash"],
            )
            return {
                "ok": True,
                "status": status,
                "encrypted_session": enc_session,
            }
        raise ValueError("Failed to verify Telegram login.")

    async def disconnect(self) -> dict:
        if self.client and self.client.is_connected:
            await self.client.stop()
        self.connected = False
        return self.status()

    def status(self) -> dict:
        return {
            "status": "connected" if self.connected else "disconnected",
            "online": self.connected,
            "display_name": self.display_name,
            "username": self.username,
            "session_encrypted": bool(self.enc_session),
            "api_configured": bool(self.api_id and self.api_hash),
        }


async def interactive_cli_login() -> None:
    """Secure terminal-only login helper (OTP/2FA never enters public bot chats)."""
    from dotenv import load_dotenv
    load_dotenv(os.path.join(os.path.dirname(__file__), "..", ".env"))

    api_id = int(input("Enter TELEGRAM_API_ID: ").strip())
    api_hash = input("Enter TELEGRAM_API_HASH: ").strip()
    enc_key = os.getenv("TELEGRAM_SESSION_ENCRYPTION_KEY") or input("Enter Encryption Secret: ").strip()

    async with Client("cli_login", api_id=api_id, api_hash=api_hash, in_memory=True) as app:
        raw_session = await app.export_session_string()
        encrypted = encrypt_session_string(raw_session, enc_key)
        print("\n=== COPY TO WORKER ENV VARS (NEVER SHARE IN CHAT) ===")
        print(f"TELEGRAM_STRING_SESSION_ENC={encrypted}")


if __name__ == "__main__":
    import sys
    if "--login" in sys.argv:
        asyncio.run(interactive_cli_login())

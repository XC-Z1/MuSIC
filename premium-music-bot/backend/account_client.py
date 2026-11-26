import asyncio
import base64
import hashlib
import os
from typing import Optional
from cryptography.fernet import Fernet
from pyrogram import Client


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
        self.api_id = int(raw_api_id or 0)
        self.api_hash = os.getenv("TELEGRAM_API_HASH") or os.getenv("API_HASH") or ""
        self.enc_key = os.getenv("TELEGRAM_SESSION_ENCRYPTION_KEY", "")
        self.enc_session = os.getenv("TELEGRAM_STRING_SESSION_ENC", "")
        self.plain_session = os.getenv("TELEGRAM_STRING_SESSION") or os.getenv("SESSION_STRING") or ""
        self.client: Optional[Client] = None
        self.connected = False
        self.display_name = "Not Connected"
        self.username = "@unlinked"
        self.user_id: Optional[int] = None

    def has_session_configured(self) -> bool:
        return bool((self.enc_session and self.enc_key) or self.plain_session)

    async def connect(self) -> dict:
        if not self.api_id or not self.api_hash:
            raise RuntimeError("TELEGRAM_API_ID (or API_ID) and TELEGRAM_API_HASH (or API_HASH) must be set.")

        session_str = (
            decrypt_session_string(self.enc_session, self.enc_key)
            if self.enc_session and self.enc_key
            else self.plain_session.strip()
        )
        if not session_str:
            raise RuntimeError("Session string missing. Set TELEGRAM_STRING_SESSION_ENC (or SESSION_STRING) in environment.")

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

import re
from urllib.parse import urlparse
from pyrogram import Client
from pyrogram.errors import ChatAdminRequired, InviteHashExpired, UserNotParticipant
from pytgcalls import PyTgCalls


class VoiceChatManager:
    """Resolves Telegram group/voice-chat links and manages active voice-chat membership."""

    def __init__(self, account_client: Client, calls: PyTgCalls) -> None:
        self.client = account_client
        self.calls = calls
        self.active_chats: dict[int, dict] = {}
        self.max_concurrent_streams = 3

    @staticmethod
    def parse_telegram_link(link: str) -> str | int:
        trimmed = link.strip()
        if trimmed.startswith("@"):
            return trimmed
        parsed = urlparse(trimmed)
        if parsed.netloc.lower() not in {"t.me", "telegram.me", "telegram.dog"}:
            raise ValueError("Invalid Live Link")
        parts = [p for p in parsed.path.split("/") if p]
        if not parts:
            raise ValueError("Invalid Live Link")
        if parts[0].startswith("+") or parts[0] == "joinchat":
            return trimmed
        if parts[0] == "c" and len(parts) >= 2 and parts[1].isdigit():
            return int(f"-100{parts[1]}")
        username = re.sub(r"[^a-zA-Z0-9_]", "", parts[0])
        if len(username) < 3:
            raise ValueError("Invalid Live Link")
        return f"@{username}"

    async def resolve_and_join(self, link: str) -> dict:
        if len(self.active_chats) >= self.max_concurrent_streams:
            raise RuntimeError(f"Concurrent stream limit reached ({self.max_concurrent_streams}).")

        target = self.parse_telegram_link(link)
        try:
            if isinstance(target, str) and ("+" in target or "joinchat" in target):
                chat = await self.client.join_chat(target)
            else:
                chat = await self.client.get_chat(target)
                try:
                    await self.client.get_chat_member(chat.id, "me")
                except UserNotParticipant:
                    await self.client.join_chat(chat.id)
        except (InviteHashExpired, ChatAdminRequired) as exc:
            raise RuntimeError("Account Has No Access") from exc
        except Exception as exc:
            raise RuntimeError(f"Voice Chat Not Available: {exc}") from exc

        self.active_chats[chat.id] = {
            "chat_id": chat.id,
            "group_title": chat.title or str(target),
            "link": link,
            "active": True,
        }
        return self.active_chats[chat.id]

    async def leave(self, chat_id: int) -> None:
        try:
            await self.calls.leave_call(chat_id)
        finally:
            self.active_chats.pop(chat_id, None)

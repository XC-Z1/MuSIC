import re
from urllib.parse import urlparse
from pyrogram import Client
from pyrogram.errors import ChatAdminRequired, InviteHashExpired, UserNotParticipant
from pytgcalls import PyTgCalls


class VoiceChatManager:
    """Resolves Telegram group/voice-chat links and maps controller chats to active Voice Chats."""

    def __init__(self, account_client: Client, calls: PyTgCalls) -> None:
        self.client = account_client
        self.calls = calls
        self.active_chats: dict[int, dict] = {}
        self.chat_target_map: dict[int, int] = {}
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

    def resolve_target_chat(self, controller_chat_id: int) -> int:
        """Maps a user's DM or bot chat ID to the active Group/Channel Voice Chat ID."""
        if controller_chat_id in self.chat_target_map:
            return self.chat_target_map[controller_chat_id]
        if controller_chat_id in self.active_chats:
            return controller_chat_id
        if len(self.active_chats) == 1:
            return next(iter(self.active_chats.keys()))
        if self.active_chats:
            return next(reversed(list(self.active_chats.keys())))
        return controller_chat_id

    async def resolve_and_join(self, link: str, controller_chat_id: int | None = None) -> dict:
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

        session_info = {
            "chat_id": chat.id,
            "group_title": chat.title or str(target),
            "link": link,
            "active": True,
        }
        self.active_chats[chat.id] = session_info
        if controller_chat_id is not None:
            self.chat_target_map[controller_chat_id] = chat.id
        return session_info

    async def leave(self, chat_id: int) -> None:
        target_id = self.resolve_target_chat(chat_id)
        try:
            await self.calls.leave_call(target_id)
        finally:
            self.active_chats.pop(target_id, None)
            stale_keys = [k for k, v in self.chat_target_map.items() if v == target_id]
            for k in stale_keys:
                self.chat_target_map.pop(k, None)

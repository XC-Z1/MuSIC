class VolumeController:
    """Manages per-group volume levels (10% - 200%) with mute memory."""

    def __init__(self, default_volume: int = 80) -> None:
        self.default_volume = default_volume
        self.group_volumes: dict[int, dict] = {}

    def get_state(self, chat_id: int) -> dict:
        if chat_id not in self.group_volumes:
            self.group_volumes[chat_id] = {
                "volume": self.default_volume,
                "muted": False,
                "previous_volume": self.default_volume,
            }
        return self.group_volumes[chat_id]

    def set_volume(self, chat_id: int, volume: int, muted: bool = False) -> dict:
        state = self.get_state(chat_id)
        if muted:
            if not state["muted"]:
                state["previous_volume"] = state["volume"]
            state["muted"] = True
        else:
            clamped = max(10, min(200, int(volume)))
            state["volume"] = clamped
            state["previous_volume"] = clamped
            state["muted"] = False
        return state

    def adjust(self, chat_id: int, action: str) -> dict:
        state = self.get_state(chat_id)
        if action == "mute":
            return self.set_volume(chat_id, state["volume"], muted=True)
        if action == "unmute":
            return self.set_volume(chat_id, state["previous_volume"], muted=False)
        delta = int(action)
        return self.set_volume(chat_id, state["volume"] + delta, muted=False)

    def effective_volume(self, chat_id: int) -> int:
        state = self.get_state(chat_id)
        return 0 if state["muted"] else state["volume"]

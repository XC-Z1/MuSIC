import asyncio
import logging
from account_client import PersonalAccountClient

logger = logging.getLogger("session_manager")


class SessionManager:
    """Monitors MTProto personal account health and performs bounded auto-reconnects."""

    def __init__(self, account: PersonalAccountClient, max_retries: int = 3) -> None:
        self.account = account
        self.max_retries = max_retries
        self.retry_count = 0
        self._running = False

    async def watchdog_loop(self) -> None:
        self._running = True
        while self._running:
            await asyncio.sleep(20)
            if self.account.client and not self.account.connected:
                if self.retry_count >= self.max_retries:
                    logger.warning("Max reconnect retries (%d) reached; awaiting manual /reconnect.", self.max_retries)
                    continue
                self.retry_count += 1
                backoff = min(30, 2 ** self.retry_count)
                logger.info("Attempting reconnect %d/%d in %ds...", self.retry_count, self.max_retries, backoff)
                await asyncio.sleep(backoff)
                try:
                    await self.account.connect()
                    self.retry_count = 0
                except Exception as exc:
                    logger.error("Reconnect attempt failed: %s", exc)

    def stop(self) -> None:
        self._running = False

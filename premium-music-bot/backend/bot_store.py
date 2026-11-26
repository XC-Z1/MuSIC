import os
import sqlite3
import threading
from datetime import datetime, timezone
from typing import Any, Optional


class BotStateStore:
    """Thread-safe SQLite persistence for users, blocklist, maintenance mode, and owner state."""

    def __init__(self, db_path: str) -> None:
        self.db_path = db_path
        os.makedirs(os.path.dirname(db_path), exist_ok=True)
        self._lock = threading.Lock()
        self._init_db()

    def _connect(self) -> sqlite3.Connection:
        conn = sqlite3.connect(self.db_path, check_same_thread=False)
        conn.row_factory = sqlite3.Row
        return conn

    def _init_db(self) -> None:
        with self._lock, self._connect() as conn:
            conn.execute(
                """
                CREATE TABLE IF NOT EXISTS settings (
                    key TEXT PRIMARY KEY,
                    value TEXT NOT NULL
                )
                """
            )
            conn.execute(
                """
                CREATE TABLE IF NOT EXISTS users (
                    user_id INTEGER PRIMARY KEY,
                    chat_id INTEGER NOT NULL,
                    first_name TEXT NOT NULL DEFAULT '',
                    last_name TEXT NOT NULL DEFAULT '',
                    username TEXT NOT NULL DEFAULT '',
                    is_blocked INTEGER NOT NULL DEFAULT 0,
                    plays_count INTEGER NOT NULL DEFAULT 0,
                    joined_at TEXT NOT NULL,
                    last_seen_at TEXT NOT NULL
                )
                """
            )
            conn.execute(
                "INSERT OR IGNORE INTO settings (key, value) VALUES ('maintenance_mode', '0')"
            )
            conn.execute(
                "INSERT OR IGNORE INTO settings (key, value) VALUES ('total_plays', '0')"
            )
            conn.commit()

    def _get_setting(self, conn: sqlite3.Connection, key: str, default: str = "") -> str:
        row = conn.execute("SELECT value FROM settings WHERE key = ?", (key,)).fetchone()
        return str(row["value"]) if row else default

    def _set_setting(self, conn: sqlite3.Connection, key: str, value: str) -> None:
        conn.execute(
            "INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
            (key, value),
        )

    @staticmethod
    def _row_to_user(row: sqlite3.Row) -> dict[str, Any]:
        return {
            "user_id": int(row["user_id"]),
            "chat_id": int(row["chat_id"]),
            "first_name": row["first_name"],
            "last_name": row["last_name"],
            "username": row["username"],
            "is_blocked": bool(row["is_blocked"]),
            "plays_count": int(row["plays_count"]),
            "joined_at": row["joined_at"],
            "last_seen_at": row["last_seen_at"],
        }

    def get_config(self) -> dict[str, Any]:
        with self._lock, self._connect() as conn:
            maintenance = self._get_setting(conn, "maintenance_mode", "0") == "1"
            claimed_owner = self._get_setting(conn, "claimed_owner_id", "")
            total_plays = int(self._get_setting(conn, "total_plays", "0") or 0)
            counts = conn.execute(
                "SELECT COUNT(*) AS total, SUM(CASE WHEN is_blocked = 1 THEN 1 ELSE 0 END) AS blocked FROM users"
            ).fetchone()
            total = int(counts["total"] or 0)
            blocked = int(counts["blocked"] or 0)
            return {
                "maintenance_mode": maintenance,
                "claimed_owner_id": int(claimed_owner) if claimed_owner.isdigit() else None,
                "total_users": total,
                "active_users": max(0, total - blocked),
                "blocked_users": blocked,
                "total_plays": total_plays,
            }

    def track_user(
        self,
        user_id: int,
        chat_id: int,
        first_name: str = "",
        last_name: str = "",
        username: str = "",
    ) -> dict[str, Any]:
        now = datetime.now(timezone.utc).isoformat()
        clean_username = username.lstrip("@").strip()
        with self._lock, self._connect() as conn:
            existing = conn.execute("SELECT * FROM users WHERE user_id = ?", (user_id,)).fetchone()
            if existing is None:
                conn.execute(
                    """
                    INSERT INTO users (user_id, chat_id, first_name, last_name, username, is_blocked, plays_count, joined_at, last_seen_at)
                    VALUES (?, ?, ?, ?, ?, 0, 0, ?, ?)
                    """,
                    (user_id, chat_id, first_name.strip(), last_name.strip(), clean_username, now, now),
                )
                is_new = True
            else:
                conn.execute(
                    """
                    UPDATE users
                    SET chat_id = ?, first_name = ?, last_name = ?, username = ?, last_seen_at = ?
                    WHERE user_id = ?
                    """,
                    (
                        chat_id,
                        first_name.strip() or existing["first_name"],
                        last_name.strip() or existing["last_name"],
                        clean_username or existing["username"],
                        now,
                        user_id,
                    ),
                )
                is_new = False
            conn.commit()
            row = conn.execute("SELECT * FROM users WHERE user_id = ?", (user_id,)).fetchone()

        cfg = self.get_config()
        return {
            "is_new": is_new,
            "is_blocked": bool(row["is_blocked"]) if row else False,
            "user": self._row_to_user(row) if row else None,
            **cfg,
        }

    def set_maintenance(self, enabled: bool) -> dict[str, Any]:
        with self._lock, self._connect() as conn:
            self._set_setting(conn, "maintenance_mode", "1" if enabled else "0")
            conn.commit()
        return self.get_config()

    def claim_owner(self, user_id: int) -> dict[str, Any]:
        with self._lock, self._connect() as conn:
            existing = self._get_setting(conn, "claimed_owner_id", "")
            if existing and existing.isdigit() and int(existing) != user_id:
                raise ValueError("Owner already claimed.")
            self._set_setting(conn, "claimed_owner_id", str(user_id))
            conn.commit()
        return self.get_config()

    def set_user_blocked(self, user_id: int, blocked: bool) -> Optional[dict[str, Any]]:
        with self._lock, self._connect() as conn:
            existing = conn.execute("SELECT * FROM users WHERE user_id = ?", (user_id,)).fetchone()
            if existing is None:
                return None
            conn.execute(
                "UPDATE users SET is_blocked = ? WHERE user_id = ?",
                (1 if blocked else 0, user_id),
            )
            conn.commit()
            row = conn.execute("SELECT * FROM users WHERE user_id = ?", (user_id,)).fetchone()
            return self._row_to_user(row) if row else None

    def get_user(self, user_id: int) -> Optional[dict[str, Any]]:
        with self._lock, self._connect() as conn:
            row = conn.execute("SELECT * FROM users WHERE user_id = ?", (user_id,)).fetchone()
            return self._row_to_user(row) if row else None

    def list_users(self, page: int = 0, limit: int = 5) -> dict[str, Any]:
        safe_limit = max(1, min(20, limit))
        safe_page = max(0, page)
        offset = safe_page * safe_limit
        with self._lock, self._connect() as conn:
            rows = conn.execute(
                "SELECT * FROM users ORDER BY joined_at DESC LIMIT ? OFFSET ?",
                (safe_limit, offset),
            ).fetchall()
        cfg = self.get_config()
        return {
            "users": [self._row_to_user(r) for r in rows],
            "page": safe_page,
            "limit": safe_limit,
            **cfg,
        }

    def get_broadcast_targets(self) -> list[dict[str, Any]]:
        with self._lock, self._connect() as conn:
            rows = conn.execute(
                "SELECT user_id, chat_id FROM users WHERE is_blocked = 0"
            ).fetchall()
            return [{"user_id": int(r["user_id"]), "chat_id": int(r["chat_id"])} for r in rows]

    def record_play(self, user_id: Optional[int] = None) -> dict[str, Any]:
        with self._lock, self._connect() as conn:
            current = int(self._get_setting(conn, "total_plays", "0") or 0)
            self._set_setting(conn, "total_plays", str(current + 1))
            if user_id is not None:
                conn.execute(
                    "UPDATE users SET plays_count = plays_count + 1 WHERE user_id = ?",
                    (user_id,),
                )
            conn.commit()
        return self.get_config()

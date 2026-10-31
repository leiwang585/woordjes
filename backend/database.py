import os
import sqlite3
from contextlib import contextmanager
from pathlib import Path

# On Railway, set DATA_DIR to the volume mount path so the database survives redeploys.
DATA_DIR = Path(
    os.environ.get("DATA_DIR") or Path(__file__).resolve().parent.parent / "data"
)
DB_PATH = DATA_DIR / "vocab.db"

SCHEMA = """
CREATE TABLE IF NOT EXISTS users (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    username      TEXT NOT NULL UNIQUE COLLATE NOCASE,
    password_hash TEXT NOT NULL,
    created_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS sessions (
    token_hash  TEXT PRIMARY KEY,
    user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    expires_at  TEXT NOT NULL
);

-- Lists are shared by everyone; only the owner may change or delete them.
CREATE TABLE IF NOT EXISTS lists (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    name        TEXT NOT NULL,
    owner_id    INTEGER REFERENCES users(id) ON DELETE SET NULL,
    created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS words (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    list_id     INTEGER NOT NULL REFERENCES lists(id) ON DELETE CASCADE,
    dutch       TEXT NOT NULL,
    english     TEXT NOT NULL,
    chapter     TEXT,
    example_nl  TEXT,
    example_en  TEXT,
    created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Per-user right/wrong counts.
CREATE TABLE IF NOT EXISTS progress (
    user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    word_id     INTEGER NOT NULL REFERENCES words(id) ON DELETE CASCADE,
    correct     INTEGER NOT NULL DEFAULT 0,
    incorrect   INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (user_id, word_id)
);

-- Progress recorded before accounts existed; handed to the first account that signs up.
CREATE TABLE IF NOT EXISTS legacy_progress (
    word_id     INTEGER PRIMARY KEY REFERENCES words(id) ON DELETE CASCADE,
    correct     INTEGER NOT NULL,
    incorrect   INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_words_list_id ON words(list_id);
CREATE INDEX IF NOT EXISTS idx_sessions_user_id ON sessions(user_id);
"""


@contextmanager
def get_conn():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    try:
        yield conn
        conn.commit()
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()


def init_db() -> None:
    DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    with get_conn() as conn:
        conn.executescript(SCHEMA)
        columns = {r["name"] for r in conn.execute("PRAGMA table_info(words)")}
        # example_nl: NULL = not looked up yet, '' = no example found.
        for column in ("chapter", "example_nl", "example_en"):
            if column not in columns:
                conn.execute(f"ALTER TABLE words ADD COLUMN {column} TEXT")
        # Older databases kept a single set of counts on the words table.
        if "correct" in columns:
            conn.execute("""
                INSERT OR IGNORE INTO legacy_progress (word_id, correct, incorrect)
                SELECT id, correct, incorrect FROM words WHERE correct > 0 OR incorrect > 0
                """)
            conn.execute("ALTER TABLE words DROP COLUMN correct")
            conn.execute("ALTER TABLE words DROP COLUMN incorrect")
        list_columns = {r["name"] for r in conn.execute("PRAGMA table_info(lists)")}
        if "owner_id" not in list_columns:
            conn.execute(
                "ALTER TABLE lists ADD COLUMN owner_id INTEGER REFERENCES users(id) ON DELETE SET NULL"
            )
        conn.execute("DELETE FROM sessions WHERE expires_at < datetime('now')")


def claim_legacy_data(conn: sqlite3.Connection, user_id: int) -> None:
    """Give data from before accounts existed to the first user."""
    conn.execute("UPDATE lists SET owner_id = ? WHERE owner_id IS NULL", (user_id,))
    conn.execute(
        """
        INSERT OR IGNORE INTO progress (user_id, word_id, correct, incorrect)
        SELECT ?, word_id, correct, incorrect FROM legacy_progress
        """,
        (user_id,),
    )
    conn.execute("DELETE FROM legacy_progress")

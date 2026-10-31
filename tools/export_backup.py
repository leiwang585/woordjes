"""Export the server database (lists, chapters, example sentences, one user's progress)
as a Woordjes backup file that the on-device app can restore.

Usage:  python tools/export_backup.py [output.json] [--user USERNAME]
"""

import argparse
import json
import sqlite3
import sys
from datetime import datetime, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from backend.database import DB_PATH  # noqa: E402


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("output", nargs="?", default="woordjes-backup.json")
    parser.add_argument("--user", help="whose progress to include (default: the first account)")
    args = parser.parse_args()

    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    tables = {r[0] for r in conn.execute("SELECT name FROM sqlite_master WHERE type = 'table'")}
    user_id = None
    if "users" in tables:
        query = "SELECT id, username FROM users "
        row = (
            conn.execute(query + "WHERE username = ? COLLATE NOCASE", (args.user,)).fetchone()
            if args.user
            else conn.execute(query + "ORDER BY id LIMIT 1").fetchone()
        )
        if args.user and row is None:
            sys.exit(f"No user named {args.user!r}")
        if row:
            user_id = row["id"]
            print(f"Including progress of user {row['username']!r}")

    lists = []
    for lst in conn.execute("SELECT id, name, created_at FROM lists ORDER BY id"):
        words = conn.execute(
            """
            SELECT w.dutch, w.english, w.chapter, w.example_nl, w.example_en,
                   COALESCE(p.correct, 0) AS correct, COALESCE(p.incorrect, 0) AS incorrect
            FROM words w LEFT JOIN progress p ON p.word_id = w.id AND p.user_id = ?
            WHERE w.list_id = ? ORDER BY w.id
            """,
            (user_id, lst["id"]),
        ).fetchall()
        lists.append({
            "name": lst["name"],
            "created_at": lst["created_at"],
            "words": [dict(w) for w in words],
        })

    backup = {
        "app": "woordjes",
        "version": 1,
        "exported_at": datetime.now(timezone.utc).isoformat(),
        "lists": lists,
    }
    Path(args.output).write_text(json.dumps(backup, ensure_ascii=False, indent=1), encoding="utf-8")
    total = sum(len(lst["words"]) for lst in lists)
    print(f"Wrote {len(lists)} list(s), {total} words to {args.output}")


if __name__ == "__main__":
    main()

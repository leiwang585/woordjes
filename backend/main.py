import mimetypes
import sqlite3
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import Depends, FastAPI, File, HTTPException, Query, Request, Response, UploadFile
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field

from .auth import (
    MAX_ATTEMPTS_PER_IP,
    MAX_ATTEMPTS_PER_USER,
    MIN_PASSWORD,
    USERNAME_RE,
    check_rate_limit,
    client_ip,
    current_user,
    end_session,
    hash_password,
    start_session,
    verify_password,
)
from .database import claim_legacy_data, get_conn, init_db
from .examples import find_example
from .icons import ensure_icons
from .pdf_parser import extract_pairs
from .tts import clean, synthesize

FRONTEND_DIR = Path(__file__).resolve().parent.parent / "frontend"
MAX_UPLOAD_BYTES = 10 * 1024 * 1024

# Windows registry can map .js to text/plain, which breaks the service worker.
mimetypes.add_type("application/javascript", ".js")
mimetypes.add_type("text/css", ".css")
mimetypes.add_type("application/manifest+json", ".webmanifest")


@asynccontextmanager
async def lifespan(_: FastAPI):
    init_db()
    ensure_icons(FRONTEND_DIR / "icons")
    yield


app = FastAPI(title="Dutch Vocabulary", lifespan=lifespan)

User = dict


class Credentials(BaseModel):
    username: str = Field(min_length=1, max_length=30)
    password: str = Field(min_length=1, max_length=200)


class Pair(BaseModel):
    dutch: str = Field(min_length=1, max_length=200)
    english: str = Field(min_length=1, max_length=200)
    chapter: str | None = Field(default=None, max_length=20)


def clean_chapter(chapter: str | None) -> str | None:
    return (chapter or "").strip() or None


class ListCreate(BaseModel):
    name: str = Field(min_length=1, max_length=100)
    pairs: list[Pair] = Field(default_factory=list, max_length=5000)


class WordCreate(Pair):
    list_id: int


class Result(BaseModel):
    correct: bool


def require_list_owner(conn: sqlite3.Connection, list_id: int, user: User) -> None:
    row = conn.execute("SELECT owner_id FROM lists WHERE id = ?", (list_id,)).fetchone()
    if row is None:
        raise HTTPException(404, "List not found")
    if row["owner_id"] != user["id"]:
        raise HTTPException(403, "Only the person who created this list can change it")


# ---------- Auth ----------


@app.post("/api/auth/register", status_code=201)
def register(payload: Credentials, request: Request, response: Response):
    check_rate_limit(f"ip:{client_ip(request)}", MAX_ATTEMPTS_PER_IP)
    username = payload.username.strip()
    if not USERNAME_RE.match(username):
        raise HTTPException(
            422, "Username must be 3–30 characters: letters, numbers, '.', '_' or '-'"
        )
    if len(payload.password) < MIN_PASSWORD:
        raise HTTPException(422, f"Password must be at least {MIN_PASSWORD} characters")
    password_hash = hash_password(payload.password)
    with get_conn() as conn:
        try:
            user_id = conn.execute(
                "INSERT INTO users (username, password_hash) VALUES (?, ?)",
                (username, password_hash),
            ).lastrowid
        except sqlite3.IntegrityError:
            raise HTTPException(409, "That username is already taken")
        if conn.execute("SELECT COUNT(*) FROM users").fetchone()[0] == 1:
            claim_legacy_data(conn, user_id)
    start_session(request, response, user_id)
    return {"id": user_id, "username": username}


@app.post("/api/auth/login")
def login(payload: Credentials, request: Request, response: Response):
    username = payload.username.strip()
    check_rate_limit(f"ip:{client_ip(request)}", MAX_ATTEMPTS_PER_IP)
    check_rate_limit(f"user:{username.lower()}", MAX_ATTEMPTS_PER_USER)
    with get_conn() as conn:
        row = conn.execute(
            "SELECT id, username, password_hash FROM users WHERE username = ?", (username,)
        ).fetchone()
    if row is None or not verify_password(payload.password, row["password_hash"]):
        raise HTTPException(401, "Wrong username or password")
    start_session(request, response, row["id"])
    return {"id": row["id"], "username": row["username"]}


@app.post("/api/auth/logout", status_code=204)
def logout(request: Request):
    response = Response(status_code=204)
    end_session(request, response)
    return response


@app.get("/api/auth/me")
def me(user: User = Depends(current_user)):
    return user


# ---------- Lists & words ----------


@app.get("/api/lists")
def get_lists(user: User = Depends(current_user)):
    with get_conn() as conn:
        rows = conn.execute(
            """
            SELECT l.id, l.name, l.created_at, u.username AS owner,
                   l.owner_id = ? AS mine,
                   (SELECT COUNT(*) FROM words w WHERE w.list_id = l.id) AS word_count
            FROM lists l LEFT JOIN users u ON u.id = l.owner_id
            ORDER BY l.created_at DESC, l.id DESC
            """,
            (user["id"],),
        ).fetchall()
    return [{**dict(r), "mine": bool(r["mine"])} for r in rows]


@app.post("/api/lists", status_code=201)
def create_list(payload: ListCreate, user: User = Depends(current_user)):
    name = payload.name.strip()
    pairs = [
        (p.dutch.strip(), p.english.strip(), clean_chapter(p.chapter))
        for p in payload.pairs
    ]
    pairs = [p for p in pairs if p[0] and p[1]]
    if not name:
        raise HTTPException(422, "List name is required")
    with get_conn() as conn:
        list_id = conn.execute(
            "INSERT INTO lists (name, owner_id) VALUES (?, ?)", (name, user["id"])
        ).lastrowid
        conn.executemany(
            "INSERT INTO words (list_id, dutch, english, chapter) VALUES (?, ?, ?, ?)",
            [(list_id, d, e, c) for d, e, c in pairs],
        )
    return {"id": list_id, "name": name, "word_count": len(pairs)}


@app.delete("/api/lists/{list_id}", status_code=204)
def delete_list(list_id: int, user: User = Depends(current_user)):
    with get_conn() as conn:
        require_list_owner(conn, list_id, user)
        conn.execute("DELETE FROM lists WHERE id = ?", (list_id,))
    return Response(status_code=204)


@app.get("/api/words")
def get_words(list_id: int | None = None, user: User = Depends(current_user)):
    query = """
        SELECT w.id, w.list_id, w.dutch, w.english, w.chapter, w.example_nl, w.example_en,
               COALESCE(p.correct, 0) AS correct, COALESCE(p.incorrect, 0) AS incorrect
        FROM words w
        LEFT JOIN progress p ON p.word_id = w.id AND p.user_id = ?
        """
    params: tuple = (user["id"],)
    if list_id is not None:
        query += " WHERE w.list_id = ?"
        params += (list_id,)
    with get_conn() as conn:
        rows = conn.execute(query + " ORDER BY w.id", params).fetchall()
    return [dict(r) for r in rows]


@app.post("/api/words", status_code=201)
def create_word(payload: WordCreate, user: User = Depends(current_user)):
    dutch, english = payload.dutch.strip(), payload.english.strip()
    chapter = clean_chapter(payload.chapter)
    if not dutch or not english:
        raise HTTPException(422, "Both Dutch and English are required")
    with get_conn() as conn:
        require_list_owner(conn, payload.list_id, user)
        word_id = conn.execute(
            "INSERT INTO words (list_id, dutch, english, chapter) VALUES (?, ?, ?, ?)",
            (payload.list_id, dutch, english, chapter),
        ).lastrowid
    return {
        "id": word_id,
        "list_id": payload.list_id,
        "dutch": dutch,
        "english": english,
        "chapter": chapter,
        "example_nl": None,
        "example_en": None,
        "correct": 0,
        "incorrect": 0,
    }


@app.delete("/api/words/{word_id}", status_code=204)
def delete_word(word_id: int, user: User = Depends(current_user)):
    with get_conn() as conn:
        row = conn.execute("SELECT list_id FROM words WHERE id = ?", (word_id,)).fetchone()
        if row is None:
            raise HTTPException(404, "Word not found")
        require_list_owner(conn, row["list_id"], user)
        conn.execute("DELETE FROM words WHERE id = ?", (word_id,))
    return Response(status_code=204)


@app.post("/api/words/{word_id}/result")
def record_result(word_id: int, payload: Result, user: User = Depends(current_user)):
    with get_conn() as conn:
        if not conn.execute("SELECT 1 FROM words WHERE id = ?", (word_id,)).fetchone():
            raise HTTPException(404, "Word not found")
        conn.execute(
            """
            INSERT INTO progress (user_id, word_id, correct, incorrect) VALUES (?, ?, ?, ?)
            ON CONFLICT (user_id, word_id) DO UPDATE SET
                correct = correct + excluded.correct,
                incorrect = incorrect + excluded.incorrect
            """,
            (user["id"], word_id, int(payload.correct), int(not payload.correct)),
        )
    return {"ok": True}


@app.get("/api/words/{word_id}/example")
def get_example(word_id: int, _: User = Depends(current_user)):
    """Example sentence for a word, looked up on Tatoeba once and then cached."""
    with get_conn() as conn:
        row = conn.execute(
            "SELECT dutch, example_nl, example_en FROM words WHERE id = ?", (word_id,)
        ).fetchone()
    if row is None:
        raise HTTPException(404, "Word not found")
    if row["example_nl"] is None:
        try:
            found = find_example(row["dutch"])
        except Exception:
            raise HTTPException(503, "Example service unavailable")
        dutch, english = found or ("", "")
        with get_conn() as conn:
            conn.execute(
                "UPDATE words SET example_nl = ?, example_en = ? WHERE id = ?",
                (dutch, english, word_id),
            )
    else:
        dutch, english = row["example_nl"], row["example_en"] or ""
    return {"example_nl": dutch, "example_en": english}


@app.get("/api/tts")
async def text_to_speech(
    text: str = Query(min_length=1, max_length=200), _: User = Depends(current_user)
):
    text = clean(text)
    if not text:
        raise HTTPException(422, "Nothing to pronounce")
    try:
        path = await synthesize(text)
    except Exception:
        raise HTTPException(503, "Speech service unavailable")
    return FileResponse(
        path, media_type="audio/mpeg", headers={"Cache-Control": "private, max-age=31536000"}
    )


@app.post("/api/upload")
async def upload_pdf(file: UploadFile = File(...), _: User = Depends(current_user)):
    data = await file.read(MAX_UPLOAD_BYTES + 1)
    if len(data) > MAX_UPLOAD_BYTES:
        raise HTTPException(413, "PDF is larger than 10 MB")
    if not data.startswith(b"%PDF"):
        raise HTTPException(400, "File is not a valid PDF")
    try:
        pairs = extract_pairs(data)
    except Exception:
        raise HTTPException(400, "Could not read this PDF")
    if not pairs:
        raise HTTPException(
            422,
            "No word pairs found. Use one pair per line, e.g. 'de hond - the dog' "
            "or a two-column table. Scanned (image-only) PDFs are not supported.",
        )
    suggested = Path(file.filename or "Vocabulary").stem.strip()[:100] or "Vocabulary"
    return {"suggested_name": suggested, "pairs": pairs}


# Must be mounted last so /api routes take precedence.
app.mount("/", StaticFiles(directory=FRONTEND_DIR, html=True), name="frontend")

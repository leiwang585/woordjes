"""Username/password accounts with cookie sessions."""

import hashlib
import hmac
import re
import secrets
import time
from collections import defaultdict, deque

from fastapi import HTTPException, Request, Response

from .database import get_conn

COOKIE = "woordjes_session"
SESSION_DAYS = 365  # long-lived so the home-screen app stays signed in
PBKDF2_ITERATIONS = 600_000
USERNAME_RE = re.compile(r"^[A-Za-z0-9_.-]{3,30}$")
MIN_PASSWORD = 8

MAX_ATTEMPTS_PER_USER = 10
MAX_ATTEMPTS_PER_IP = 30  # higher: a household shares one IP
ATTEMPT_WINDOW = 15 * 60
_attempts: dict[str, deque[float]] = defaultdict(deque)


def hash_password(password: str) -> str:
    salt = secrets.token_bytes(16)
    digest = hashlib.pbkdf2_hmac("sha256", password.encode(), salt, PBKDF2_ITERATIONS)
    return f"pbkdf2_sha256${PBKDF2_ITERATIONS}${salt.hex()}${digest.hex()}"


def verify_password(password: str, stored: str) -> bool:
    try:
        _, iterations, salt, digest = stored.split("$")
        candidate = hashlib.pbkdf2_hmac(
            "sha256", password.encode(), bytes.fromhex(salt), int(iterations)
        )
    except (ValueError, TypeError):
        return False
    return hmac.compare_digest(candidate.hex(), digest)


def _token_hash(token: str) -> str:
    return hashlib.sha256(token.encode()).hexdigest()


def client_ip(request: Request) -> str:
    forwarded = request.headers.get("x-forwarded-for", "")
    return forwarded.split(",")[0].strip() or (request.client.host if request.client else "?")


def check_rate_limit(key: str, limit: int) -> None:
    now = time.monotonic()
    attempts = _attempts[key]
    while attempts and now - attempts[0] > ATTEMPT_WINDOW:
        attempts.popleft()
    if len(attempts) >= limit:
        raise HTTPException(429, "Too many attempts. Please wait a few minutes and try again.")
    attempts.append(now)


def start_session(request: Request, response: Response, user_id: int) -> None:
    token = secrets.token_urlsafe(32)
    with get_conn() as conn:
        conn.execute(
            "INSERT INTO sessions (token_hash, user_id, expires_at)"
            " VALUES (?, ?, datetime('now', ?))",
            (_token_hash(token), user_id, f"+{SESSION_DAYS} days"),
        )
    # Railway terminates HTTPS at its proxy, so trust the forwarded scheme.
    https = request.headers.get("x-forwarded-proto", request.url.scheme) == "https"
    response.set_cookie(
        COOKIE, token, max_age=SESSION_DAYS * 86400,
        httponly=True, secure=https, samesite="lax", path="/",
    )


def end_session(request: Request, response: Response) -> None:
    token = request.cookies.get(COOKIE)
    if token:
        with get_conn() as conn:
            conn.execute("DELETE FROM sessions WHERE token_hash = ?", (_token_hash(token),))
    response.delete_cookie(COOKIE, path="/")


def current_user(request: Request) -> dict:
    """FastAPI dependency: the signed-in user, or 401."""
    token = request.cookies.get(COOKIE)
    if token:
        with get_conn() as conn:
            row = conn.execute(
                """
                SELECT u.id, u.username FROM sessions s JOIN users u ON u.id = s.user_id
                WHERE s.token_hash = ? AND s.expires_at > datetime('now')
                """,
                (_token_hash(token),),
            ).fetchone()
        if row:
            return dict(row)
    raise HTTPException(401, "Please sign in")

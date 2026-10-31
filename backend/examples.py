"""Find a Dutch example sentence with an English translation on Tatoeba.org (CC BY 2.0 FR)."""

import json
import re
import urllib.parse
import urllib.request

API_URL = "https://api.tatoeba.org/unstable/sentences"
TIMEOUT = 8
IDEAL_WORDS = 7
MAX_WORDS = 14

_ARTICLE = re.compile(r"^(?:de|het|een)\s+", re.I)


def search_term(dutch: str) -> str:
    """'aanbieding, de' -> 'aanbieding'; 'aankleden (zich -)' -> 'aankleden'."""
    text = re.sub(r"\([^)]*\)|\[[^\]]*\]", " ", dutch)
    text = re.split(r"[,/;]", text)[0]
    text = _ARTICLE.sub("", text.strip())
    return re.sub(r"\s+", " ", text.replace('"', " ")).strip(" -")


def _query(q: str) -> list[dict]:
    params = urllib.parse.urlencode({
        "lang": "nld",
        "q": q,
        "trans:lang": "eng",
        "is_unapproved": "no",
        "sort": "relevance",
        "limit": 40,
    })
    req = urllib.request.Request(
        f"{API_URL}?{params}", headers={"User-Agent": "woordjes-vocab-app"}
    )
    with urllib.request.urlopen(req, timeout=TIMEOUT) as res:
        return json.load(res).get("data", [])


def _english(sentence: dict) -> str | None:
    translations = [
        t for t in sentence.get("translations", [])
        if t.get("lang") == "eng" and not t.get("is_unapproved")
    ]
    translations.sort(key=lambda t: not t.get("is_direct"))
    return translations[0]["text"] if translations else None


def _pick(sentences: list[dict]) -> tuple[str, str] | None:
    candidates = []
    for s in sentences:
        english = _english(s)
        words = len(s["text"].split())
        if english and words <= MAX_WORDS:
            # Prefer sentences of moderate length: long enough to show usage, short enough to read.
            candidates.append((abs(words - IDEAL_WORDS) + (2 if words < 4 else 0), s["text"], english))
    if not candidates:
        return None
    _, dutch, english = min(candidates)
    return dutch, english


def find_example(dutch: str) -> tuple[str, str] | None:
    """Return (dutch_sentence, english_translation), or None if nothing suitable exists.

    Raises on network errors so the caller can retry later instead of caching a miss.
    """
    term = search_term(dutch)
    if not term:
        return None
    exact = f'"{term}"' if " " in term else f"={term}"
    for q in dict.fromkeys((exact, f'"{term}"')):
        found = _pick(_query(q))
        if found:
            return found
    return None

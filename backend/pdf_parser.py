"""Extract Dutch-English word pairs from vocabulary-list PDFs.

Supported line formats (one pair per line), e.g.:
    de hond - the dog        de hond = the dog       de hond : the dog
    de hond | the dog        de hond <TAB> the dog   de hond      the dog (table columns)
    1. de hond – the dog     • de hond -> the dog

An optional trailing chapter number in its own column is kept, e.g.
    de hond      the dog      4
"""

import io
import re

from pypdf import PdfReader

MAX_FIELD_LEN = 120
MAX_FIELD_WORDS = 12

_PREFIX = re.compile(r"^\s*(?:\d{1,4}\s*[.)]\s*|\d{1,4}\s+|[-•*·▪●◦]\s+)")

# Tried in order; the first separator that yields two valid parts wins.
_SEPARATORS = [
    re.compile(r"\t+"),
    re.compile(r"\s*(?:=>|->|→|=|\|)\s*"),
    re.compile(r"\s+[-–—]+\s+|\s*[–—]\s*"),
    re.compile(r"\s*[:;]\s+"),
    re.compile(r"\s{2,}"),
]

_HEADER_WORDS = {
    "dutch",
    "english",
    "nederlands",
    "engels",
    "woord",
    "woorden",
    "word",
    "words",
    "vertaling",
    "translation",
    "nl",
    "en",
    "betekenis",
    "meaning",
}

_LETTER = re.compile(r"[^\W\d_]")

# A chapter number in its own trailing column (separated by a tab or 2+ spaces).
_CHAPTER = re.compile(r"^(.*\S)(?:\t|\s{2,})(\d{1,3})\s*$")


def _valid(part: str) -> bool:
    return (
        bool(_LETTER.search(part))
        and len(part) <= MAX_FIELD_LEN
        and len(part.split()) <= MAX_FIELD_WORDS
    )


def _split_line(line: str) -> tuple[str, str] | None:
    line = _PREFIX.sub("", line.strip()).strip()
    if not line:
        return None
    for sep in _SEPARATORS:
        parts = [p.strip(" \t.,") for p in sep.split(line)]
        parts = [p for p in parts if p]
        if len(parts) >= 2 and _valid(parts[0]) and _valid(parts[1]):
            return parts[0], parts[1]
    return None


def _english_first(line: str) -> bool | None:
    low = line.lower()
    en = min(
        (i for i in (low.find("english"), low.find("engels")) if i >= 0), default=-1
    )
    nl = min(
        (i for i in (low.find("dutch"), low.find("nederlands")) if i >= 0), default=-1
    )
    if en >= 0 and nl >= 0:
        return en < nl
    return None


def _split_chapter(line: str) -> tuple[str, str | None]:
    match = _CHAPTER.match(line)
    if match and _split_line(match.group(1)):
        return match.group(1), match.group(2)
    return line, None


def parse_text(text: str) -> list[dict[str, str]]:
    pairs: list[tuple[str, str, str | None]] = []
    swap = False
    seen: set[tuple[str, str]] = set()

    for raw in text.splitlines():
        line, chapter = _split_chapter(raw)
        result = _split_line(line)
        if result is None:
            continue
        a, b = result
        if a.lower() in _HEADER_WORDS and b.lower() in _HEADER_WORDS:
            order = _english_first(raw)
            if order is not None:
                swap = order
            continue
        key = (a.lower(), b.lower())
        if key in seen:
            continue
        seen.add(key)
        pairs.append((a, b, chapter))

    result = []
    for a, b, chapter in pairs:
        pair = {"dutch": b, "english": a} if swap else {"dutch": a, "english": b}
        if chapter:
            pair["chapter"] = chapter
        result.append(pair)
    return result


def _extract_text(reader: PdfReader, layout: bool) -> str:
    chunks = []
    for page in reader.pages:
        if layout:
            chunks.append(page.extract_text(extraction_mode="layout") or "")
        else:
            chunks.append(page.extract_text() or "")
    return "\n".join(chunks)


def extract_pairs(data: bytes) -> list[dict[str, str]]:
    reader = PdfReader(io.BytesIO(data))
    if reader.is_encrypted:
        reader.decrypt("")

    # Layout mode keeps column spacing (good for tables); fall back to plain mode.
    best: list[dict[str, str]] = []
    for layout in (True, False):
        try:
            pairs = parse_text(_extract_text(reader, layout))
        except Exception:
            continue
        if len(pairs) > len(best):
            best = pairs
    return best

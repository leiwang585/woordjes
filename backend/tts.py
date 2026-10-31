import hashlib
import re
from pathlib import Path

import edge_tts

CACHE_DIR = Path(__file__).resolve().parent.parent / "data" / "tts"
VOICE = "nl-NL-FennaNeural"
RATE = "-10%"


def clean(text: str) -> str:
    """Drop bracketed notes like '(het)' and collapse whitespace."""
    text = re.sub(r"\([^)]*\)|\[[^\]]*\]", " ", text)
    return re.sub(r"\s+", " ", text).strip()


async def synthesize(text: str) -> Path:
    """Return the path to an MP3 of `text`, generating and caching it on first use."""
    key = hashlib.sha1(f"{VOICE}|{RATE}|{text}".encode()).hexdigest()
    path = CACHE_DIR / f"{key}.mp3"
    if not path.exists():
        CACHE_DIR.mkdir(parents=True, exist_ok=True)
        tmp = path.with_suffix(".tmp")
        await edge_tts.Communicate(text, VOICE, rate=RATE).save(str(tmp))
        tmp.replace(path)
    return path

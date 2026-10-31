"""Create a natural-voice audio pack for the Woordjes app.

Reads a Woordjes backup file (made in the app with "Save backup", or with
tools/export_backup.py) and renders every Dutch word with Microsoft's neural voice
(nl-NL-FennaNeural, via edge-tts). Import the resulting file in the app under
Lists → Dutch voice → Import voice pack.

Usage:  python tools/make_audio_pack.py BACKUP.json [-o woordjes-audio.json]
"""

import argparse
import asyncio
import base64
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from backend.tts import VOICE, clean, synthesize  # noqa: E402

CONCURRENCY = 4


async def render_all(texts: list[str]) -> dict[str, bytes]:
    semaphore = asyncio.Semaphore(CONCURRENCY)
    clips: dict[str, bytes] = {}
    failed: list[str] = []
    done = 0

    async def render(text: str) -> None:
        nonlocal done
        async with semaphore:
            for attempt in range(3):
                try:
                    clips[text] = (await synthesize(text)).read_bytes()
                    break
                except Exception:
                    await asyncio.sleep(2 * (attempt + 1))
            else:
                failed.append(text)
            done += 1
            if done % 100 == 0 or done == len(texts):
                print(f"  {done}/{len(texts)}", flush=True)

    await asyncio.gather(*(render(t) for t in texts))
    if failed:
        print(f"Could not render {len(failed)} words (they'll use the device voice): {failed[:10]}")
    return clips


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("backup", help="Woordjes backup file (.json)")
    parser.add_argument("-o", "--output", default="woordjes-audio.json")
    args = parser.parse_args()

    backup = json.loads(Path(args.backup).read_text(encoding="utf-8"))
    if backup.get("app") != "woordjes":
        sys.exit("This is not a Woordjes backup file")
    # Keys match the app's cleanSpeech(), which is what it looks up when speaking.
    texts = sorted({
        clean(w["dutch"])
        for lst in backup.get("lists", [])
        for w in lst.get("words", [])
        if clean(w.get("dutch", ""))
    })
    print(f"Rendering {len(texts)} words with {VOICE} (cached clips are reused)…")
    clips = asyncio.run(render_all(texts))

    pack = {
        "app": "woordjes-audio",
        "version": 1,
        "voice": VOICE,
        "format": "audio/mpeg",
        "clips": {t: base64.b64encode(clips[t]).decode("ascii") for t in texts if t in clips},
    }
    Path(args.output).write_text(json.dumps(pack, ensure_ascii=False), encoding="utf-8")
    size = Path(args.output).stat().st_size / 1e6
    print(f"Wrote {len(pack['clips'])} clips to {args.output} ({size:.1f} MB)")


if __name__ == "__main__":
    main()

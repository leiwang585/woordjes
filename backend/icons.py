"""Generate the PWA / Apple touch icons as PNG files (pure Python, no Pillow)."""

import struct
import zlib
from pathlib import Path

ORANGE = (255, 107, 0)
RED = (174, 28, 40)
WHITE = (255, 255, 255)
BLUE = (33, 70, 139)


def _pixel(x: int, y: int, size: int) -> tuple[int, int, int]:
    margin = size * 0.2
    radius = size * 0.08
    left, top, right, bottom = (
        margin,
        margin * 1.25,
        size - margin,
        size - margin * 1.25,
    )
    if not (left <= x < right and top <= y < bottom):
        return ORANGE
    # Rounded corners of the flag "card".
    cx = min(max(x, left + radius), right - radius)
    cy = min(max(y, top + radius), bottom - radius)
    if (x - cx) ** 2 + (y - cy) ** 2 > radius**2:
        return ORANGE
    third = (bottom - top) / 3
    if y < top + third:
        return RED
    if y < top + 2 * third:
        return WHITE
    return BLUE


def _write_png(path: Path, size: int) -> None:
    raw = bytearray()
    for y in range(size):
        raw.append(0)
        for x in range(size):
            raw.extend(_pixel(x, y, size))

    def chunk(tag: bytes, data: bytes) -> bytes:
        return (
            struct.pack(">I", len(data))
            + tag
            + data
            + struct.pack(">I", zlib.crc32(tag + data) & 0xFFFFFFFF)
        )

    png = (
        b"\x89PNG\r\n\x1a\n"
        + chunk(b"IHDR", struct.pack(">IIBBBBB", size, size, 8, 2, 0, 0, 0))
        + chunk(b"IDAT", zlib.compress(bytes(raw), 9))
        + chunk(b"IEND", b"")
    )
    path.write_bytes(png)


def ensure_icons(icon_dir: Path) -> None:
    icon_dir.mkdir(parents=True, exist_ok=True)
    for size in (180, 192, 512):
        path = icon_dir / f"icon-{size}.png"
        if not path.exists():
            _write_png(path, size)

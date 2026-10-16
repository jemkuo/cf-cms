#!/usr/bin/env python3
"""Draw public/og.png without third-party image libraries."""

import struct
import zlib
from pathlib import Path

W, H = 1200, 630
FONT = {
    "A": ["01110", "10001", "10001", "11111", "10001", "10001", "10001"],
    "C": ["01110", "10001", "10000", "10000", "10000", "10001", "01110"],
    "D": ["11110", "10001", "10001", "10001", "10001", "10001", "11110"],
    "E": ["11111", "10000", "10000", "11110", "10000", "10000", "11111"],
    "F": ["11111", "10000", "10000", "11110", "10000", "10000", "10000"],
    "G": ["01110", "10001", "10000", "10111", "10001", "10001", "01111"],
    "H": ["10001", "10001", "10001", "11111", "10001", "10001", "10001"],
    "I": ["11111", "00100", "00100", "00100", "00100", "00100", "11111"],
    "J": ["00111", "00010", "00010", "00010", "00010", "10010", "01100"],
    "L": ["10000", "10000", "10000", "10000", "10000", "10000", "11111"],
    "M": ["10001", "11011", "10101", "10001", "10001", "10001", "10001"],
    "N": ["10001", "11001", "10101", "10011", "10001", "10001", "10001"],
    "O": ["01110", "10001", "10001", "10001", "10001", "10001", "01110"],
    "R": ["11110", "10001", "10001", "11110", "10100", "10010", "10001"],
    "S": ["01111", "10000", "10000", "01110", "00001", "00001", "11110"],
    "T": ["11111", "00100", "00100", "00100", "00100", "00100", "00100"],
    " ": ["00000", "00000", "00000", "00000", "00000", "00000", "00000"],
    ".": ["00000", "00000", "00000", "00000", "00000", "01100", "01100"],
    "·": ["00000", "00000", "00100", "00000", "00100", "00000", "00000"],
}


def px(buf, x, y, color):
    if 0 <= x < W and 0 <= y < H:
        i = (y * W + x) * 3
        buf[i : i + 3] = color


def rect(buf, x, y, w, h, color):
    for yy in range(y, y + h):
        for xx in range(x, x + w):
            px(buf, xx, yy, color)


def text(buf, value, x, y, scale, color):
    cursor = x
    for ch in value:
        glyph = FONT.get(ch, FONT[" "])
        for row, bits in enumerate(glyph):
            for col, bit in enumerate(bits):
                if bit == "1":
                    rect(buf, cursor + col * scale, y + row * scale, scale, scale, color)
        cursor += 6 * scale
    return cursor


def main():
    bg = bytes((20, 19, 17))
    ink = bytes((244, 239, 230))
    accent = bytes((184, 67, 31))
    mute = bytes((201, 191, 176))
    buf = bytearray(bg * (W * H))
    rect(buf, 0, 0, 18, H, accent)
    rect(buf, 96, 150, 86, 8, ink)
    text(buf, "FIELD NOTES", 96, 210, 10, ink)
    text(buf, "NOTES FROM THE EDGE", 96, 390, 5, mute)
    rect(buf, 96, 470, 36, 36, accent)
    raw = bytearray()
    stride = W * 3
    for y in range(H):
        raw.append(0)
        raw.extend(buf[y * stride : (y + 1) * stride])

    def chunk(tag, data):
        return struct.pack(">I", len(data)) + tag + data + struct.pack(">I", zlib.crc32(tag + data) & 0xFFFFFFFF)

    ihdr = struct.pack(">IIBBBBB", W, H, 8, 2, 0, 0, 0)
    png = b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", ihdr) + chunk(b"IDAT", zlib.compress(bytes(raw), 9)) + chunk(b"IEND", b"")
    path = Path(__file__).resolve().parents[1] / "public" / "og.png"
    path.write_bytes(png)
    print(path, len(png))


if __name__ == "__main__":
    main()

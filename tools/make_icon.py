"""Vykreslí web/icon.ico (otáčkomer ako web/icon.svg) bez ďalších knižníc – PNG vo vnútri ICO."""
import math
import struct
import zlib
from pathlib import Path

SIZE = 256
SS = 3  # supersampling pre hladké okraje
OUT = Path(__file__).resolve().parent.parent / "web" / "icon.ico"

BG = (11, 13, 18)
TRACK = (42, 49, 69)
RED = (255, 59, 48)
WHITE = (255, 255, 255)

CX, CY, R, W = 128, 184, 80, 20          # oblúk (z SVG 512 -> 256)
RED_END = math.atan2(-145, 68)           # koniec červenej časti
NEEDLE = (170, 118)                      # hrot ručičky


def in_round_rect(x, y):
    r = 48
    dx = max(r - x, 0, x - (SIZE - r))
    dy = max(r - y, 0, y - (SIZE - r))
    return dx * dx + dy * dy <= r * r


def on_arc(x, y, a_from, a_to):
    d = math.hypot(x - CX, y - CY)
    a = math.atan2(y - CY, x - CX)
    if abs(d - R) <= W / 2 and a_from <= a <= a_to:
        return True
    for a_end in (a_from, a_to):  # zaoblené konce
        ex, ey = CX + R * math.cos(a_end), CY + R * math.sin(a_end)
        if math.hypot(x - ex, y - ey) <= W / 2:
            return True
    return False


def on_segment(x, y, x1, y1, x2, y2, w):
    vx, vy = x2 - x1, y2 - y1
    t = max(0.0, min(1.0, ((x - x1) * vx + (y - y1) * vy) / (vx * vx + vy * vy)))
    return math.hypot(x - (x1 + t * vx), y - (y1 + t * vy)) <= w / 2


def color_at(x, y):
    if not in_round_rect(x, y):
        return None
    if math.hypot(x - CX, y - CY) <= 15:
        return WHITE
    if on_segment(x, y, CX, CY, *NEEDLE, 11):
        return WHITE
    if on_arc(x, y, -math.pi, RED_END):
        return RED
    if on_arc(x, y, -math.pi, 0):
        return TRACK
    return BG


def render():
    rows = []
    for py in range(SIZE):
        row = bytearray([0])  # PNG filter: none
        for px in range(SIZE):
            r = g = b = a = 0
            for sy in range(SS):
                for sx in range(SS):
                    c = color_at(px + (sx + 0.5) / SS, py + (sy + 0.5) / SS)
                    if c:
                        r += c[0]; g += c[1]; b += c[2]; a += 1
            n = SS * SS
            row += bytes((r // a, g // a, b // a, 255 * a // n) if a else (0, 0, 0, 0))
        rows.append(bytes(row))
    return b"".join(rows)


def png(raw):
    def chunk(kind, data):
        return struct.pack(">I", len(data)) + kind + data + struct.pack(">I", zlib.crc32(kind + data))
    ihdr = struct.pack(">IIBBBBB", SIZE, SIZE, 8, 6, 0, 0, 0)
    return (b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", ihdr)
            + chunk(b"IDAT", zlib.compress(raw, 9)) + chunk(b"IEND", b""))


def main():
    data = png(render())
    header = struct.pack("<HHH", 0, 1, 1)
    entry = struct.pack("<BBBBHHII", 0, 0, 0, 0, 1, 32, len(data), 6 + 16)  # 0 = 256 px
    OUT.write_bytes(header + entry + data)
    print(f"{OUT} ({len(data)} B)")


if __name__ == "__main__":
    main()

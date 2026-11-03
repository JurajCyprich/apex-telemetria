"""Gran Turismo 7 (PlayStation) - šifrované UDP pakety (Salsa20).

Aplikácia posiela heartbeat na PlayStation (port 33739) a GT7 odpovedá paketmi na port 33740."""
import asyncio
import socket
import struct
import time

from ..model import Frame
from .base import UdpSource

KEY = b"Simulator Interface Packet GT7 ver 0.0"[:32]
MAGIC = 0x47375330
SEND_PORT, RECV_PORT = 33739, 33740
M = 0xFFFFFFFF


def _rotl(v, c):
    return ((v << c) & M) | (v >> (32 - c))


def _qr(x, a, b, c, d):
    x[b] ^= _rotl((x[a] + x[d]) & M, 7)
    x[c] ^= _rotl((x[b] + x[a]) & M, 9)
    x[d] ^= _rotl((x[c] + x[b]) & M, 13)
    x[a] ^= _rotl((x[d] + x[c]) & M, 18)


def salsa20_block(key, nonce, counter):
    c = struct.unpack("<4I", b"expand 32-byte k")
    k = struct.unpack("<8I", key)
    n = struct.unpack("<2I", nonce)
    state = [c[0], k[0], k[1], k[2], k[3], c[1], n[0], n[1],
             counter & M, (counter >> 32) & M, c[2], k[4], k[5], k[6], k[7], c[3]]
    x = state[:]
    for _ in range(10):
        _qr(x, 0, 4, 8, 12)
        _qr(x, 5, 9, 13, 1)
        _qr(x, 10, 14, 2, 6)
        _qr(x, 15, 3, 7, 11)
        _qr(x, 0, 1, 2, 3)
        _qr(x, 5, 6, 7, 4)
        _qr(x, 10, 11, 8, 9)
        _qr(x, 15, 12, 13, 14)
    return struct.pack("<16I", *((x[i] + state[i]) & M for i in range(16)))


def salsa20_xor(key, nonce, data):
    out = bytearray(len(data))
    for block in range(0, len(data), 64):
        ks = salsa20_block(key, nonce, block // 64)
        chunk = data[block:block + 64]
        out[block:block + len(chunk)] = bytes(a ^ b for a, b in zip(chunk, ks))
    return bytes(out)


def decrypt(data):
    iv1 = struct.unpack_from("<I", data, 0x40)[0]
    nonce = struct.pack("<II", iv1 ^ 0xDEADBEAF, iv1)
    dec = salsa20_xor(KEY, nonce, data)
    if struct.unpack_from("<I", dec, 0)[0] != MAGIC:
        return None
    return dec


class GT7Source(UdpSource):
    id = "gt7"
    name = "Gran Turismo 7"
    port = RECV_PORT

    def __init__(self, settings, emit):
        super().__init__(settings, emit)
        self.ps_ip = (settings.get("gt7_ip") or "").strip()
        self._lap_no = None
        self._lap_start = None
        self._last_pkt = None

    async def background(self):
        sock = self.transport.get_extra_info("socket")
        if not self.ps_ip:
            sock.setsockopt(socket.SOL_SOCKET, socket.SO_BROADCAST, 1)
        target = (self.ps_ip or "255.255.255.255", SEND_PORT)
        while True:
            try:
                self.transport.sendto(b"A", target)
            except OSError:
                pass
            await asyncio.sleep(1.0)

    def on_packet(self, data, addr):
        if len(data) < 0x128:
            return
        d = decrypt(data)
        if d is None:
            return
        f = Frame(source=self.id, game=self.name, connected=True)
        flags = struct.unpack_from("<h", d, 0x8E)[0]
        on_track, paused, loading = flags & 1, flags & 2, flags & 4
        if loading or not on_track:
            f.paused = True
            self.emit(f)
            return
        f.paused = bool(paused)
        pkt_id = struct.unpack_from("<i", d, 0x70)[0]
        f.pos_x, _y, f.pos_z = struct.unpack_from("<3f", d, 0x04)
        f.rpm = struct.unpack_from("<f", d, 0x3C)[0]
        f.fuel, f.fuel_capacity = struct.unpack_from("<2f", d, 0x44)
        f.fuel = round(f.fuel, 2)
        f.speed = struct.unpack_from("<f", d, 0x4C)[0] * 3.6
        f.water_temp = round(struct.unpack_from("<f", d, 0x58)[0], 1)
        f.tyre_temp = [round(t, 1) for t in struct.unpack_from("<4f", d, 0x60)]
        cur_lap, total_laps, best_ms, last_ms = struct.unpack_from("<hhii", d, 0x74)
        pos, _cars, _rpm_min, rpm_max = struct.unpack_from("<hhhh", d, 0x84)
        gear_byte, throttle, brake = struct.unpack_from("<BBB", d, 0x90)
        f.lap = max(0, cur_lap - 1)
        f.total_laps = max(0, total_laps)
        f.best_lap = best_ms / 1000 if best_ms > 0 else 0
        f.last_lap = last_ms / 1000 if last_ms > 0 else 0
        f.position = max(0, pos)
        f.max_rpm = max(0, rpm_max)
        f.gear = gear_byte & 0x0F
        f.throttle, f.brake = throttle / 255, brake / 255
        f.pit_limiter = False
        f.lights = 1 if flags & (1 << 7) else 0
        f.tc = 1 if flags & (1 << 11) else 0  # TCS práve zasahuje
        car_code = struct.unpack_from("<i", d, 0x124)[0]
        f.car = f"Auto #{car_code}"
        f.track = "GT7"

        # GT7 neposiela čas aktuálneho kola - počítame ho z čísla paketu (60 Hz)
        if cur_lap != self._lap_no:
            self._lap_no = cur_lap
            self._lap_start = pkt_id
        if self._lap_start is not None and cur_lap > 0:
            f.lap_time = max(0, pkt_id - self._lap_start) / 60
        self.emit(f)

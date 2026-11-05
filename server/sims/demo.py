"""Demo zdroj - simulované auto na vymyslenej trati, na skúšanie bez hry."""
import asyncio
import math
import time

from ..model import Frame
from .base import Source

N = 2000  # bodov trate


def _track():
    pts = []
    for i in range(N):
        a = 2 * math.pi * i / N
        r = 520 + 160 * math.sin(3 * a) + 90 * math.cos(5 * a)
        pts.append((r * math.cos(a), 0.7 * r * math.sin(a)))
    dist = [0.0]
    for i in range(1, N + 1):
        (x0, z0), (x1, z1) = pts[i - 1], pts[i % N]
        dist.append(dist[-1] + math.hypot(x1 - x0, z1 - z0))
    ds = 8 * dist[-1] / N
    curv = []
    for i in range(N):
        (x0, z0), (x1, z1), (x2, z2) = pts[i - 4], pts[i], pts[(i + 4) % N]
        h1 = math.atan2(z1 - z0, x1 - x0)
        h2 = math.atan2(z2 - z1, x2 - x1)
        dh = (h2 - h1 + math.pi) % (2 * math.pi) - math.pi
        curv.append(dh / ds)
    # cieľová rýchlosť z krivosti, vyhladená dopredu (brzdenie pred zákrutou)
    vmax = [min(78.0, math.sqrt(16.0 / max(abs(c), 1e-4))) for c in curv]
    for _ in range(3):
        for i in range(N - 1, -1, -1):
            nxt = vmax[(i + 1) % N]
            seg = dist[i + 1] - dist[i]
            vmax[i] = min(vmax[i], math.sqrt(nxt * nxt + 2 * 11.0 * seg))
    return pts, dist, curv, vmax


class DemoSource(Source):
    id = "demo"
    name = "Demo"

    async def run(self):
        pts, dist, curv, vmax = _track()
        length = dist[-1]
        gears = [0, 60, 95, 130, 165, 205, 240, 400]
        s, v, lap, t_lap, best, last = 0.0, 20.0, 0, 0.0, 0.0, 0.0
        fuel = 60.0
        tc, abs_, emap, bb = 4, 3, 1, 54.0
        prev = time.monotonic()
        while True:
            # asyncio na Windows spí ~16 ms namiesto 1/60 s, preto reálny čas
            now = time.monotonic()
            dt, prev = min(0.1, now - prev), now
            i = int(s / length * N) % N
            target = vmax[i]
            if v < target - 1:
                thr, brk = 1.0, 0.0
                v += 9.0 * dt * max(0.25, 1 - v / 90)
            elif v > target + 1:
                thr, brk = 0.0, min(1.0, (v - target) / 6)
                v -= 13.0 * brk * dt
            else:
                thr, brk = 0.55, 0.0
                v = target
            s += v * dt
            t_lap += dt
            fuel = max(0.0, fuel - (0.01 + 0.05 * thr) * dt)
            if s >= length:
                s -= length
                lap += 1
                last = t_lap
                best = last if not best else min(best, last)
                t_lap = 0.0
            kmh = v * 3.6
            gear = next((g for g in range(1, 8) if kmh < gears[g]), 7)
            lo, hi = gears[gear - 1], gears[gear]
            rpm = 3500 + (kmh - lo) / max(1, hi - lo) * 4600

            f = Frame(source=self.id, game="Demo (simulácia)", connected=True)
            f.car, f.track, f.track_length = "Demo GT3", "Demo okruh", length
            f.speed, f.rpm, f.max_rpm, f.gear = kmh, rpm, 8500, gear
            f.throttle, f.brake, f.steer = thr, brk, max(-1, min(1, curv[i] * 60))
            f.fuel, f.fuel_capacity = round(fuel, 2), 120.0
            f.lap, f.position, f.total_laps = lap, 3, 0
            f.lap_time, f.last_lap, f.best_lap = t_lap, last, best
            f.lap_dist = s
            f.pos_x, f.pos_z = pts[i]
            f.g_lat = v * v * curv[i] / 9.81
            f.g_lon = (thr * 0.6) - brk * 1.6
            base = 80 + 10 * thr + 15 * brk
            f.tyre_temp = [round(base + d, 1) for d in (3, 1, -2, -3)]
            f.tyre_pressure = [27.6, 27.8, 27.3, 27.5]
            f.tyre_wear = [round(100 - lap * 0.8 - d, 1) for d in (0.2, 0.1, 0.4, 0.3)]
            f.brake_temp = [round(300 + 400 * brk + d) for d in (20, 15, -40, -45)]
            f.tyre_compound = "DHE"
            f.tc, f.tc2, f.abs, f.engine_map, f.brake_bias = tc, 2, abs_, emap, bb
            f.water_temp, f.air_temp, f.track_temp = 88.0, 22.0, 31.0
            # správanie auta pre vibrácie a rady k nastaveniu: pri brzdení nedotáča, na plyne pretáča
            if abs(f.g_lat) > 0.5:
                f.balance = 0.32 if brk > 0 else (-0.18 if thr >= 1 else 0.05)
                f.fx_kerb = 0.6 if abs(f.g_lat) > 1.4 else 0.0
            if brk > 0.6 and lap % 2 == 0:
                f.fx_lock, f.lock_axle = 0.6, 1
            if thr >= 1 and abs(f.g_lat) > 0.8:
                f.fx_spin = 0.4
            self.emit(f)
            await asyncio.sleep(1 / 60)

"""Záznam kôl, delta voči najlepšiemu kolu a spotreba paliva."""
import bisect
import json
import logging
import re
import time
from datetime import datetime
from pathlib import Path

log = logging.getLogger("laps")

CHANNELS = ("d", "t", "speed", "throttle", "brake", "gear", "steer", "rpm", "x", "z")


def _safe(s):
    return re.sub(r"[^\w\-. ]+", "_", s or "unknown").strip()[:60] or "unknown"


class LapStore:
    """Kolá uložené ako JSON v data/laps/<hra>/<trať>/<auto>/<id>.json."""

    def __init__(self, root: Path):
        self.root = root
        self.root.mkdir(parents=True, exist_ok=True)

    def _dir(self, game, track, car):
        return self.root / _safe(game) / _safe(track) / _safe(car)

    def save(self, lap):
        d = self._dir(lap["game"], lap["track"], lap["car"])
        d.mkdir(parents=True, exist_ok=True)
        path = d / f"{lap['id']}.json"
        path.write_text(json.dumps(lap, separators=(",", ":")), encoding="utf-8")
        return path

    def _path(self, lap_id):
        if not re.fullmatch(r"[\w\-]+", lap_id):
            return None
        hits = list(self.root.glob(f"*/*/*/{lap_id}.json"))
        return hits[0] if hits else None

    def load(self, lap_id):
        p = self._path(lap_id)
        return json.loads(p.read_text(encoding="utf-8")) if p else None

    def delete(self, lap_id):
        p = self._path(lap_id)
        if p:
            p.unlink()
            return True
        return False

    def list(self):
        out = []
        for p in self.root.glob("*/*/*/*.json"):
            try:
                with p.open(encoding="utf-8") as fh:
                    lap = json.load(fh)
            except (OSError, ValueError):
                continue
            out.append({k: lap.get(k) for k in
                        ("id", "game", "track", "car", "time", "date", "lap", "track_length")})
        out.sort(key=lambda x: x.get("date") or "", reverse=True)
        return out

    def best(self, game, track, car):
        best = None
        d = self._dir(game, track, car)
        for p in d.glob("*.json") if d.exists() else []:
            try:
                lap = json.loads(p.read_text(encoding="utf-8"))
            except (OSError, ValueError):
                continue
            if best is None or lap["time"] < best["time"]:
                best = lap
        return best


class LapRecorder:
    def __init__(self, store: LapStore):
        self.store = store
        self.key = None
        self.on_lap = None  # callback(lap_summary)
        self._reset_session()

    def _reset_session(self):
        self.ref = None
        self.session_best = 0.0
        self.fuel_used = []
        self.map_version = 0
        self._reset_lap(None)
        self.last_lap_count = None
        self.pending = None

    def _reset_lap(self, frame, valid_start=False):
        self.samples = {c: [] for c in CHANNELS}
        self.valid_start = valid_start
        self.dist = 0.0
        self.timer = 0.0
        self.fuel_start = frame.fuel if frame is not None else None

    def map_points(self):
        src = self.ref["channels"] if self.ref else self.samples
        xs, zs = src.get("x", []), src.get("z", [])
        step = max(1, len(xs) // 800)
        return [[round(xs[i], 1), round(zs[i], 1)] for i in range(0, len(xs), step)]

    def update(self, f, dt):
        """Spracuje rámec, vráti doplnkové údaje (delta, palivo...)."""
        extra = {"delta": None, "ref_time": self.ref["time"] if self.ref else None,
                 "session_best": self.session_best or None,
                 "fuel_per_lap": None, "fuel_laps_left": None, "map_version": self.map_version}
        if self.fuel_used:
            per_lap = sum(self.fuel_used[-5:]) / len(self.fuel_used[-5:])
            extra["fuel_per_lap"] = round(per_lap, 2)
            if f.fuel is not None and per_lap > 0:
                extra["fuel_laps_left"] = round(f.fuel / per_lap, 1)
        if not f.connected or f.paused:
            return extra

        key = (f.game, f.track, f.car)
        if key != self.key:
            self.key = key
            self._reset_session()
            self.ref = self.store.best(*key)
            self.map_version = int(time.time() * 1000) % 1_000_000_000
            extra["map_version"] = self.map_version
            extra["ref_time"] = self.ref["time"] if self.ref else None

        if self.pending and time.monotonic() >= self.pending["at"]:
            self._finish(self.pending, f)
            self.pending = None

        dt = min(dt, 0.25)
        if self.last_lap_count is None:
            self.last_lap_count = f.lap
            near_start = 0 <= f.lap_dist < 50 or (f.lap_dist < 0 and f.lap_time < 1.0)
            self._reset_lap(f, valid_start=near_start)
        elif f.lap > self.last_lap_count:
            measured = self.samples["t"][-1] if self.samples["t"] else 0.0
            self.pending = {"samples": self.samples, "valid": self.valid_start,
                            "measured": measured, "fuel_start": self.fuel_start,
                            "lap": self.last_lap_count + 1, "fuel_end": f.fuel,
                            "track_length": f.track_length, "at": time.monotonic() + 0.6}
            self.last_lap_count = f.lap
            self._reset_lap(f, valid_start=True)
        elif f.lap < self.last_lap_count:
            # reštart session
            self.last_lap_count = f.lap
            self._reset_lap(f, valid_start=f.lap_dist < 50)

        self.timer += dt
        if f.lap_dist >= 0:
            d = f.lap_dist
        else:
            self.dist += f.speed / 3.6 * dt
            d = self.dist
        lap_t = f.lap_time if f.lap_time > 0 else self.timer
        s = self.samples
        if not s["d"] or d - s["d"][-1] >= 1.0:
            if s["d"] and d < s["d"][-1] - 200:
                self.valid_start = False  # skok dozadu (reset na box) - kolo neplatné
            for c, v in zip(CHANNELS, (d, lap_t, f.speed, f.throttle, f.brake, f.gear, f.steer,
                                       f.rpm, f.pos_x, f.pos_z)):
                s[c].append(round(v, 3))

        if self.ref:
            rd, rt = self.ref["channels"]["d"], self.ref["channels"]["t"]
            i = bisect.bisect_left(rd, d)
            if 0 < i < len(rd):
                frac = (d - rd[i - 1]) / max(1e-6, rd[i] - rd[i - 1])
                ref_t = rt[i - 1] + frac * (rt[i] - rt[i - 1])
                extra["delta"] = round(lap_t - ref_t, 3)
        return extra

    def _finish(self, p, f):
        s = p["samples"]
        measured = p["measured"]
        lap_time = f.last_lap if f.last_lap > 0 and abs(f.last_lap - measured) < 1.5 else measured
        if p["fuel_start"] is not None and p["fuel_end"] is not None:
            used = p["fuel_start"] - p["fuel_end"]
            if used > 0:
                self.fuel_used.append(used)
        n = len(s["d"])
        span = s["d"][-1] - s["d"][0] if n else 0
        full = span > 0.9 * p["track_length"] if p["track_length"] else span > 300
        if not (p["valid"] and full and lap_time > 10 and n > 50):
            log.info("Kolo %d nezaznamenané (neúplné)", p["lap"])
            return
        if not self.session_best or lap_time < self.session_best:
            self.session_best = lap_time
        now = datetime.now()
        lap = {"id": now.strftime("%Y%m%d%H%M%S") + f"{now.microsecond // 1000:03d}",
               "game": f.game, "track": f.track or "unknown", "car": f.car or "unknown",
               "time": round(lap_time, 3), "lap": p["lap"], "date": now.isoformat(timespec="seconds"),
               "track_length": p["track_length"], "channels": s}
        self.store.save(lap)
        log.info("Uložené kolo %d: %.3f s", p["lap"], lap_time)
        if self.ref is None or lap_time < self.ref["time"]:
            self.ref = lap
            self.map_version += 1
        if self.on_lap:
            self.on_lap({k: lap[k] for k in ("id", "time", "lap", "game", "track", "car")})

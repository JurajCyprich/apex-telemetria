"""EA SPORTS F1 25 (a F1 23/24) - UDP telemetria, predvolený port 20777."""
import struct
import time

from ..model import Frame, balance_from, wheel_fx
from .base import UdpSource

HEADER = struct.Struct("<HBBBBBQfIIBB")  # 29 B
NUM_CARS = 22

# per-car štruktúry
MOTION = struct.Struct("<ffffffhhhhhhffffff")  # 60 B
LAP = struct.Struct("<IIHBHBHBHBfffBBBBBBBBBBBBBBBHHBfB")  # 57 B
TELEMETRY = struct.Struct("<HfffBbHBBH4H4B4BH4f4B")  # 60 B
STATUS = struct.Struct("<BBBBBfffHHBBHBBBbfffBfffB")  # 55 B

PKT_MOTION, PKT_SESSION, PKT_LAP, PKT_PARTICIPANTS, PKT_TELEMETRY, PKT_STATUS, PKT_DAMAGE = 0, 1, 2, 4, 6, 7, 10
PKT_EVENT, PKT_MOTION_EX = 3, 13
# povrch pod kolesom: 1 obrubník, 11 vrúbkovaný obrubník; 3-9 kamene, štrk, blato, piesok, tráva, voda, dlažba
KERB_SURFACES = {1, 11}
ROUGH_SURFACES = {3, 4, 5, 6, 7, 9}
# počasie F1 (0 jasno, 1 polojasno, 2 zamračené, 3 slabý dážď, 4 silný dážď, 5 búrka) -> 0..5 ako ACC
F1_RAIN = {0: 0, 1: 0, 2: 0, 3: 3, 4: 4, 5: 5}
F1_PENALTY = {0: "drive", 1: "stopgo", 2: "grid", 4: "time", 5: "warning", 6: "dsq", 10: "lap", 11: "lap",
              12: "lap", 13: "lap", 14: "lap", 15: "lap", 17: "black"}

TRACKS = {
    0: "Melbourne", 1: "Paul Ricard", 2: "Shanghai", 3: "Bahrajn", 4: "Barcelona", 5: "Monako",
    6: "Montreal", 7: "Silverstone", 8: "Hockenheim", 9: "Hungaroring", 10: "Spa", 11: "Monza",
    12: "Singapur", 13: "Suzuka", 14: "Abu Dhabi", 15: "Austin", 16: "Interlagos",
    17: "Red Bull Ring", 18: "Soči", 19: "Mexiko", 20: "Baku", 21: "Bahrajn krátka",
    22: "Silverstone krátka", 23: "Austin krátka", 24: "Suzuka krátka", 25: "Hanoj",
    26: "Zandvoort", 27: "Imola", 28: "Portimão", 29: "Džidda", 30: "Miami", 31: "Las Vegas",
    32: "Katar", 39: "Silverstone (opačne)", 40: "Red Bull Ring (opačne)", 41: "Zandvoort (opačne)",
}
TEAMS_FORMULA = {0: "F1", 1: "F1 klasika", 2: "F2", 3: "F1 generické", 4: "Beta", 6: "Esports",
                 8: "F1 World", 9: "F1 Elimination"}
FIA_FLAGS = {1: "green", 2: "blue", 3: "yellow"}
# F1 posiela kolesá v poradí RL, RR, FL, FR -> prevedieme na FL, FR, RL, RR
ORDER = (2, 3, 0, 1)


def _fl(vals, fn=lambda v: v):
    return [round(fn(vals[i]), 1) for i in ORDER]


class F1Source(UdpSource):
    id = "f1"
    name = "F1 25"

    def __init__(self, settings, emit):
        super().__init__(settings, emit)
        self.port = int(settings.get("f1_port", 20777))
        self.frame = Frame(source=self.id, game=self.name, connected=True)
        self.names = {}    # index auta -> meno jazdca (paket Participants)
        self.numbers = {}  # index auta -> štartové číslo
        self.fmt = 2025

    def on_packet(self, data, addr):
        if len(data) < HEADER.size:
            return
        fmt, year, _maj, _min, _ver, pid, _uid, _t, _frame, _oframe, player, _sec = \
            HEADER.unpack_from(data, 0)
        if fmt < 2023 or player >= NUM_CARS:
            return
        f = self.frame
        f.game = f"F1 {year}" if year else self.name
        self.fmt = fmt
        off = HEADER.size
        if pid == PKT_TELEMETRY:
            self._telemetry(data, off + player * TELEMETRY.size)
            f.connected = True
            self.emit(Frame(**f.__dict__))
        elif pid == PKT_LAP:
            self._lap(data, off, player)
        elif pid == PKT_PARTICIPANTS:
            self._participants(data, off, fmt)
        elif pid == PKT_STATUS:
            self._status(data, off + player * STATUS.size)
        elif pid == PKT_MOTION:
            self._motion(data, off + player * MOTION.size)
        elif pid == PKT_SESSION:
            self._session(data, off)
        elif pid == PKT_DAMAGE:
            size = (len(data) - off) // NUM_CARS
            o = off + player * size
            wear = struct.unpack_from("<4f", data, o)
            f.tyre_wear = _fl(wear, lambda w: 100 - w)
            # krídla, podlaha, difúzor, bočnice (F1 25 má pred nimi 4 B pľuzgierov na gumách)
            parts = o + (28 if fmt >= 2025 else 24)
            if parts + 6 <= len(data):
                f.damage = float(max(data[parts:parts + 6]))
        elif pid == PKT_MOTION_EX:
            self._motion_ex(data, off)
        elif pid == PKT_EVENT:
            self._event(data, off, player)

    def _telemetry(self, data, o):
        (speed, throttle, steer, brake, clutch, gear, rpm, drs, _revpct, _revbits,
         *rest) = TELEMETRY.unpack_from(data, o)
        brakes = rest[0:4]
        surface = rest[4:8]
        _inner = rest[8:12]
        _engine_temp = rest[12]
        pressure = rest[13:17]
        f = self.frame
        f.speed, f.throttle, f.steer, f.brake = speed, throttle, steer, brake
        f.clutch = clutch / 100
        f.gear, f.rpm, f.drs = gear, rpm, bool(drs)
        f.brake_temp = _fl(brakes)
        f.tyre_temp = _fl(surface)
        f.tyre_pressure = _fl(pressure)
        f.water_temp = float(_engine_temp)
        ground = rest[17:21]
        if ground:
            f.fx_kerb = min(1.0, sum(1 for s in ground if s in KERB_SURFACES) / 2)
            f.fx_rough = min(1.0, sum(1 for s in ground if s in ROUGH_SURFACES) / 2)

    def _motion_ex(self, data, o):
        """Len hráčovo auto: rýchlosť kolies (m/s) a uhly sklzu, poradie RL RR FL FR."""
        if o + 96 > len(data):
            return
        v = struct.unpack_from("<24f", data, o)
        f = self.frame
        wheel_fx(f, [v[12 + i] for i in ORDER])
        angle = [abs(v[20 + i]) for i in ORDER]
        f.balance = None
        balance_from(f, (angle[0] + angle[1]) / 2, (angle[2] + angle[3]) / 2)

    def _event(self, data, o, player):
        code = data[o:o + 4]
        if code == b"PENA" and o + 11 <= len(data):
            ptype, _inf, car, _other, secs = data[o + 4:o + 9]
            if car == player and ptype in F1_PENALTY:
                f = self.frame
                kind = F1_PENALTY[ptype]
                f.penalty = f"time:{secs}" if kind == "time" else kind
                f.penalty_n += 1

    def _participants(self, data, o, fmt):
        # F1 25: 57 B na auto, meno 32 znakov; F1 23/24: meno 48 znakov. Meno je vždy od 7. bajtu.
        size = (len(data) - o - 1) // NUM_CARS
        name_len = 32 if fmt >= 2025 else 48
        if size < 7 + name_len:
            return
        for i in range(NUM_CARS):
            p = o + 1 + i * size
            self.names[i] = data[p + 7:p + 7 + name_len].split(b"\0", 1)[0].decode("utf-8", "replace").strip()
            self.numbers[i] = data[p + 5]

    def _lap(self, data, off, player):
        cars = [LAP.unpack_from(data, off + i * LAP.size) for i in range(NUM_CARS)
                if off + (i + 1) * LAP.size <= len(data)]
        if player >= len(cars):
            return
        self._standings(cars, player)
        v = cars[player]
        f = self.frame
        f.last_lap = v[0] / 1000
        f.lap_time = v[1] / 1000
        f.lap_dist = v[10] if v[10] >= 0 else -1.0
        f.position = v[13]
        f.lap = max(0, v[14] - 1)
        f.in_pit = v[15] > 0
        f.sector = v[17]
        if f.last_lap and (not f.best_lap or f.last_lap < f.best_lap):
            f.best_lap = f.last_lap

    def _standings(self, cars, player):
        """Poradie a odstupy zo všetkých áut (v[13] pozícia, v[6..9] odstupy, v[26] stav jazdca)."""
        def ahead(c):
            return c[7] * 60 + c[6] / 1000  # k autu pred ním (minúty + ms)

        def leader(c):
            return c[9] * 60 + c[8] / 1000
        active = [(i, c) for i, c in enumerate(cars) if c[26] >= 2 and c[13] > 0]  # 2+ = jazdí / v cieli / mimo
        active.sort(key=lambda x: x[1][13])
        f = self.frame
        me = cars[player]
        f.gap_ahead = round(ahead(me), 3) if me[13] > 1 and ahead(me) > 0 else None
        behind = next((c for _, c in active if c[13] == me[13] + 1), None)
        f.gap_behind = round(ahead(behind), 3) if behind and ahead(behind) > 0 else None
        f.standings = [{
            "pos": c[13], "name": self.names.get(i) or f"#{self.numbers.get(i, i + 1)}",
            "leader": round(leader(c), 3), "ahead": round(ahead(c), 3), "last": round(c[0] / 1000, 3),
            "pit": c[15] > 0, "me": i == player, "lap": c[14], "out": c[26] > 3,
        } for i, c in active]

    def _status(self, data, o):
        v = STATUS.unpack_from(data, o)
        f = self.frame
        f.tc, f.abs, f.engine_map, f.brake_bias = v[0], v[1], v[2], v[3]
        f.pit_limiter = bool(v[4])
        f.fuel, f.fuel_capacity = round(v[5], 2), round(v[6], 1)
        f.max_rpm = v[8]
        f.flag = FIA_FLAGS.get(v[16], "")
        compound = {16: "C5", 17: "C4", 18: "C3", 19: "C2", 20: "C1", 21: "C0", 22: "C6", 7: "Inter",
                    8: "Wet"}
        f.tyre_compound = compound.get(v[13], "")
        if v[13] in compound:
            f.wet_tyres = v[13] in (7, 8)

    def _motion(self, data, o):
        v = MOTION.unpack_from(data, o)
        f = self.frame
        f.pos_x, f.pos_z = v[0], v[2]
        f.g_lat, f.g_lon = v[12], v[13]

    def _session(self, data, o):
        _weather, track_temp, air_temp, total_laps, track_len, _stype, track_id, formula = \
            struct.unpack_from("<BbbBHBbB", data, o)
        f = self.frame
        f.track_temp, f.air_temp = float(track_temp), float(air_temp)
        f.total_laps = total_laps
        f.track_length = float(track_len)
        f.track = TRACKS.get(track_id, f"Trať {track_id}")
        f.car = TEAMS_FORMULA.get(formula, "F1")
        f.rain = F1_RAIN.get(_weather)
        # safety car (bajt 125) a predpoveď počasia (od bajtu 128, 8 B na vzorku)
        if len(data) > o + 128:
            f.safety_car = {1: "SC", 2: "VSC"}.get(data[o + 125], "")
            n = data[o + 127]
            r10 = r30 = None
            for i in range(min(n, 64)):
                p = o + 128 + i * 8
                if p + 8 > len(data):
                    break
                stype, offset, weather = data[p], data[p + 1], data[p + 2]
                if stype != _stype or offset == 0:
                    continue
                rain = F1_RAIN.get(weather, 0)
                if offset <= 10:
                    r10 = max(r10 or 0, rain)
                elif offset <= 30:
                    r30 = max(r30 or 0, rain)
            f.rain_10 = r10
            f.rain_30 = r30 if r30 is not None else r10

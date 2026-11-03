"""Forza Horizon 5/6 a Forza Motorsport - "Data Out" UDP (formát Dash), predvolený port 5300."""
import struct

from ..model import Frame
from .base import UdpSource

SLED = struct.Struct("<iI" + "f" * 15 + "4f4f4f4i4f4f4f4f4f" + "iiiii")  # 232 B
DASH = struct.Struct("<" + "f" * 17 + "HBBBBBBbbb")  # 79 B
assert SLED.size == 232 and DASH.size == 79

FH_EXTRA = 12  # Forza Horizon má medzi Sled a Dash 12 bajtov navyše
CLASSES = {0: "D", 1: "C", 2: "B", 3: "A", 4: "S1", 5: "S2", 6: "X", 7: "P"}


def f_to_c(v):
    return round((v - 32) * 5 / 9, 1)


class ForzaSource(UdpSource):
    id = "forza"
    name = "Forza"

    def __init__(self, settings, emit):
        super().__init__(settings, emit)
        self.port = int(settings.get("forza_port", 5300))

    def on_packet(self, data, addr):
        n = len(data)
        if n == 331:            # Forza Motorsport (2023)
            game, dash_off = "Forza Motorsport", 232
        elif n == 311:          # Forza Motorsport 7
            game, dash_off = "Forza Motorsport 7", 232
        elif n >= 323:          # Forza Horizon 4/5/6
            game, dash_off = "Forza Horizon", 232 + FH_EXTRA
        else:
            return
        s = SLED.unpack_from(data, 0)
        d = DASH.unpack_from(data, dash_off)
        f = Frame(source=self.id, game=game, connected=True)
        if not s[0]:  # IsRaceOn == 0 -> menu / pauza
            f.paused = True
            self.emit(f)
            return
        f.max_rpm, f.rpm = s[2], s[4]
        f.g_lat = s[5] / 9.81
        f.g_lon = s[7] / 9.81
        car_ordinal, car_class, pi = s[53], s[54], s[55]
        f.car = f"Auto #{car_ordinal} ({CLASSES.get(car_class, '?')} {pi})"
        f.pos_x, f.pos_z = d[0], d[2]
        f.speed = d[3] * 3.6
        f.tyre_temp = [f_to_c(t) for t in d[6:10]]
        f.fuel = round(d[11] * 100, 1)  # Forza posiela 0..1 -> zobrazíme v %
        f.fuel_capacity = 100.0
        f.best_lap, f.last_lap, f.lap_time = d[13], d[14], d[15]
        f.lap = d[17]
        f.position = d[18]
        f.throttle, f.brake, f.clutch = d[19] / 255, d[20] / 255, d[21] / 255
        gear = d[23]
        f.gear = -1 if gear == 0 else (0 if gear >= 11 else gear)
        f.steer = d[24] / 127
        if n == 331:
            wear = struct.unpack_from("<4f", data, 311)
            f.tyre_wear = [round((1 - w) * 100, 1) for w in wear]
            track = struct.unpack_from("<i", data, 327)[0]
            f.track = f"Trať #{track}"
        else:
            f.track = "Voľná jazda" if game == "Forza Horizon" else ""
        self.emit(f)

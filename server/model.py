"""Normalizovaný telemetrický rámec - spoločný formát pre všetky hry."""
from dataclasses import dataclass, field, asdict
from typing import Optional


def _wheels():
    return [None, None, None, None]  # FL, FR, RL, RR


@dataclass
class Frame:
    source: str = ""            # interné id zdroja (ac, r3e, f1, forza, gt7, demo)
    game: str = ""              # zobrazovaný názov hry
    connected: bool = False
    paused: bool = False
    car: str = ""
    track: str = ""
    track_length: float = 0.0   # m, 0 = neznáma

    speed: float = 0.0          # km/h
    rpm: float = 0.0
    max_rpm: float = 0.0
    gear: int = 0               # -1 = R, 0 = N
    throttle: float = 0.0       # 0..1
    brake: float = 0.0          # 0..1
    clutch: float = 0.0         # 0..1
    steer: float = 0.0          # -1..1

    fuel: Optional[float] = None           # litre
    fuel_capacity: Optional[float] = None

    lap: int = 0                # počet dokončených kôl
    total_laps: int = 0
    position: int = 0
    lap_time: float = 0.0       # s, aktuálne kolo (0 = hra neposiela)
    last_lap: float = 0.0
    best_lap: float = 0.0
    lap_dist: float = -1.0      # m od štartovej čiary, -1 = hra neposiela
    sector: int = 0

    pos_x: float = 0.0
    pos_z: float = 0.0
    g_lat: float = 0.0
    g_lon: float = 0.0

    tyre_temp: list = field(default_factory=_wheels)      # °C
    tyre_pressure: list = field(default_factory=_wheels)  # psi
    tyre_wear: list = field(default_factory=_wheels)      # % zostávajúce
    brake_temp: list = field(default_factory=_wheels)     # °C
    tyre_compound: str = ""

    tc: Optional[float] = None
    tc2: Optional[float] = None
    abs: Optional[float] = None
    engine_map: Optional[float] = None
    brake_bias: Optional[float] = None    # % vpredu
    pit_limiter: bool = False
    in_pit: bool = False
    drs: bool = False
    lights: Optional[int] = None
    wipers: Optional[int] = None
    rain_lights: Optional[bool] = None
    water_temp: Optional[float] = None
    air_temp: Optional[float] = None
    track_temp: Optional[float] = None
    flag: str = ""

    # súperi (len hry, ktoré to posielajú: F1, ACC, RaceRoom)
    gap_ahead: Optional[float] = None     # s k autu pred tebou
    gap_behind: Optional[float] = None    # s k autu za tebou
    standings: Optional[list] = None      # [{pos, name, leader, ahead, last, pit, me, lap}] – zatiaľ F1

    # čo cíti auto (0..1) – pre vibrácie mobilu a rady k nastaveniu; len hry, ktoré to posielajú
    fx_kerb: float = 0.0        # obrubník
    fx_rough: float = 0.0       # tráva, štrk, mimo trate
    fx_lock: float = 0.0        # zablokované koleso pri brzdení
    fx_spin: float = 0.0        # pretáčanie kolies pri plyne
    fx_abs: float = 0.0         # ABS práve zasahuje
    lock_axle: int = 0          # 1 = predná náprava, 2 = zadná, 3 = obe
    balance: Optional[float] = None  # -1..1 v zákrute: + nedotáča (predné kĺžu viac), - pretáča

    # preteky
    damage: Optional[float] = None   # % najväčšieho poškodenia (krídla, podlaha…)
    penalty: str = ""                # drive / stopgo / time:5 / warning / lap / dsq …
    penalty_n: int = 0               # zvýši sa pri každom novom treste (aj keď je rovnaký)
    safety_car: str = ""             # "SC" / "VSC"
    rain: Optional[int] = None       # 0 sucho, 1 mrholenie, 2 slabý, 3 stredný, 4 silný dážď, 5 búrka
    rain_10: Optional[int] = None    # predpoveď o 10 minút
    rain_30: Optional[int] = None    # predpoveď o 30 minút
    wet_tyres: Optional[bool] = None

    def to_dict(self):
        return asdict(self)


def wheel_fx(f, wheel_ms):
    """Zablokovanie / pretáčanie kolies z obvodovej rýchlosti kolies (m/s, poradie FL FR RL RR)."""
    f.fx_lock = f.fx_spin = 0.0
    f.lock_axle = 0
    v = f.speed / 3.6
    if v < 5 or not wheel_ms or len(wheel_ms) != 4:
        return
    ratios = [(abs(w) - v) / v for w in wheel_ms]
    if f.brake > 0.05:
        # do 12 % sklzu je to ešte normálne brzdenie, pri 62 % je koleso prakticky zablokované
        lock = [max(0.0, -r - 0.12) / 0.5 for r in ratios]
        front, rear = max(lock[0], lock[1]), max(lock[2], lock[3])
        f.fx_lock = round(min(1.0, max(front, rear)), 2)
        if f.fx_lock >= 0.1:
            f.lock_axle = (1 if front >= 0.1 else 0) | (2 if rear >= 0.1 else 0)
    if f.throttle > 0.1:
        # v pomalej zákrute sa vonkajšie koleso točí rýchlejšie – preto rezerva 15 %
        f.fx_spin = round(min(1.0, max(0.0, max(ratios) - 0.15) / 0.5), 2)


def balance_from(f, front, rear):
    """Vyváženie v zákrute z priemerného |uhla sklzu| prednej a zadnej nápravy (jednotky nehrajú rolu)."""
    if abs(f.g_lat) < 0.5 or f.speed < 40:
        return
    s = front + rear
    if s > 1e-6:
        f.balance = round((front - rear) / s, 3)


def r(v, n=1):
    """Zaokrúhli číslo alebo vráti None."""
    return None if v is None else round(float(v), n)

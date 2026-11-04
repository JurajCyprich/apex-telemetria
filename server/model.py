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

    def to_dict(self):
        return asdict(self)


def r(v, n=1):
    """Zaokrúhli číslo alebo vráti None."""
    return None if v is None else round(float(v), n)

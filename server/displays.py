"""Vlastné displeje: rozloženie prvkov (prevod, rýchlosť, delta…) na mriežke, uložené v data/displays.json.

Rozloženie: {"name", "cols", "rows", "widgets": [{"id", "type", "x", "y", "w", "h", "o": {voľby}}]}
Upravovať sa dá z ľubovoľného zariadenia v sieti – displej nič neovláda, tlačidlá na ňom
používajú len tlačidlá, ktoré sú už nastavené v button boxe.
"""
import copy
import json
import re

from .config import DATA

DISPLAYS_FILE = DATA / "displays.json"
WIDGET_TYPES = {"gear", "value", "shift", "rpmbar", "delta", "pedals", "tyres", "map", "gforce", "flag",
                "text", "button", "standings"}
ID_RE = re.compile(r"^[a-z0-9_-]{1,40}$")
MAX_WIDGETS = 150


def _w(id_, type_, x, y, w, h, **o):
    return {"id": id_, "type": type_, "x": x, "y": y, "w": w, "h": h, "o": o}


# rozloženie pre OBS (16:9, prvky v rohoch, stred voľný pre obraz hry); /overlay?l=stream
STREAM = {
    "name": "Stream (OBS)", "cols": 32, "rows": 18,
    "widgets": [
        _w("rpm", "rpmbar", 0, 11, 12, 1, text=False),
        _w("gear", "gear", 0, 12, 4, 6),
        _w("speed", "value", 4, 12, 5, 3, f="speed", label="km/h"),
        _w("lapt", "value", 4, 15, 5, 3, f="lap_time", label="Kolo"),
        _w("pedals", "pedals", 9, 12, 3, 6),
        _w("delta", "delta", 12, 15, 6, 3),
        _w("pred", "value", 18, 15, 5, 3, f="predicted", label="Predpoveď"),
        _w("pos", "value", 0, 0, 3, 3, f="position", label="Poz."),
        _w("stand", "standings", 25, 0, 7, 9),
    ],
}

DEFAULT_DISPLAYS = {
    "palubovka": {
        "name": "Palubovka", "cols": 24, "rows": 14,
        "widgets": [
            _w("shift", "shift", 0, 0, 24, 2),
            _w("speed", "value", 0, 2, 7, 4, f="speed", label="km/h"),
            _w("lapt", "value", 0, 6, 7, 2, f="lap_time", label="Kolo"),
            _w("last", "value", 0, 8, 7, 2, f="last_lap", label="Posledné"),
            _w("gear", "gear", 7, 2, 10, 8),
            _w("delta", "delta", 17, 2, 7, 4),
            _w("ref", "value", 17, 6, 7, 2, f="ref_time", label="Najlepšie", color="purple"),
            _w("fuel", "value", 17, 8, 7, 2, f="fuel_laps_left", label="Palivo (kolá)"),
            _w("rpm", "rpmbar", 0, 10, 24, 1),
            _w("tc", "value", 0, 11, 4, 3, f="tc", label="TC", color="blue"),
            _w("abs", "value", 4, 11, 4, 3, f="abs", label="ABS", color="yellow"),
            _w("map", "value", 8, 11, 4, 3, f="engine_map", label="MAPA", color="green"),
            _w("bb", "value", 12, 11, 4, 3, f="brake_bias", label="BB %", color="orange"),
            _w("pos", "value", 16, 11, 4, 3, f="position", label="Pozícia"),
            _w("lap", "value", 20, 11, 4, 3, f="lap_no", label="Kolo č."),
        ],
    },
    "casomiera": {
        "name": "Časomiera", "cols": 12, "rows": 9,
        "widgets": [
            _w("delta", "delta", 0, 0, 12, 3),
            _w("lapt", "value", 0, 3, 6, 2, f="lap_time", label="Aktuálne kolo"),
            _w("last", "value", 6, 3, 6, 2, f="last_lap", label="Posledné"),
            _w("ref", "value", 0, 5, 6, 2, f="ref_time", label="Najlepšie (uložené)", color="purple"),
            _w("best", "value", 6, 5, 6, 2, f="best_lap", label="Najlepšie (hra)"),
            _w("pos", "value", 0, 7, 6, 2, f="position", label="Pozícia"),
            _w("lap", "value", 6, 7, 6, 2, f="lap_no", label="Kolo"),
        ],
    },
    "auto": {
        "name": "Pneumatiky a auto", "cols": 24, "rows": 14,
        "widgets": [
            _w("tyres", "tyres", 0, 0, 12, 8),
            _w("map", "map", 12, 0, 12, 8),
            _w("pedals", "pedals", 0, 8, 6, 6),
            _w("g", "gforce", 6, 8, 6, 6),
            _w("fuel", "value", 12, 8, 6, 3, f="fuel", label="Palivo", d=1),
            _w("fpl", "value", 18, 8, 6, 3, f="fuel_per_lap", label="Spotreba / kolo", d=2),
            _w("water", "value", 12, 11, 6, 3, f="water_temp", label="Voda °C"),
            _w("flag", "flag", 18, 11, 6, 3),
        ],
    },
}


def load():
    if DISPLAYS_FILE.exists():
        try:
            data = json.loads(DISPLAYS_FILE.read_text(encoding="utf-8"))
            if isinstance(data.get("layouts"), dict):
                if not data.get("stream_added"):  # nové predvolené rozloženie pre OBS (pridá sa raz)
                    data["layouts"].setdefault("stream", copy.deepcopy(STREAM))
                    data["stream_added"] = True
                return data
        except ValueError:
            pass
    return {"layouts": {**copy.deepcopy(DEFAULT_DISPLAYS), "stream": copy.deepcopy(STREAM)}, "stream_added": True}


def save(data):
    DATA.mkdir(parents=True, exist_ok=True)
    DISPLAYS_FILE.write_text(json.dumps(data, indent=1, ensure_ascii=False), encoding="utf-8")


def _int(v, lo, hi):
    if not isinstance(v, (int, float)) or isinstance(v, bool):
        raise ValueError("čakal som číslo")
    return max(lo, min(hi, int(v)))


def _opts(o):
    """Voľby prvku: len jednoduché hodnoty (texty skrátené), žiadne vnorené objekty."""
    out = {}
    for k, v in (o or {}).items():
        if not isinstance(k, str) or len(k) > 20:
            continue
        if isinstance(v, str):
            out[k] = v[:80]
        elif isinstance(v, (bool, int, float)) or v is None:
            out[k] = v
    return out


def validate(layout):
    """Vráti očistené rozloženie alebo vyhodí ValueError so slovenským popisom."""
    if not isinstance(layout, dict):
        raise ValueError("Neplatné rozloženie")
    cols = _int(layout.get("cols", 24), 4, 48)
    rows = _int(layout.get("rows", 14), 3, 40)
    widgets = layout.get("widgets") or []
    if not isinstance(widgets, list) or len(widgets) > MAX_WIDGETS:
        raise ValueError(f"Najviac {MAX_WIDGETS} prvkov")
    clean = []
    for w in widgets:
        if not isinstance(w, dict) or w.get("type") not in WIDGET_TYPES:
            raise ValueError(f"Neznámy prvok: {w.get('type') if isinstance(w, dict) else w}")
        x = _int(w.get("x", 0), 0, cols - 1)
        y = _int(w.get("y", 0), 0, rows - 1)
        clean.append({
            "id": str(w.get("id", ""))[:40] or f"w{len(clean)}",
            "type": w["type"],
            "x": x, "y": y,
            "w": _int(w.get("w", 1), 1, cols - x),
            "h": _int(w.get("h", 1), 1, rows - y),
            "o": _opts(w.get("o")),
        })
    name = str(layout.get("name") or "Displej").strip()[:60] or "Displej"
    return {"name": name, "cols": cols, "rows": rows, "widgets": clean}

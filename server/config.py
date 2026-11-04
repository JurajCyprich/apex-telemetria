import copy
import json
import sys
from pathlib import Path

if getattr(sys, "frozen", False):
    # zabalené ako .exe: web je vo vnútri balíka, dáta (kolá, nastavenia) vedľa .exe
    ROOT = Path(sys.executable).resolve().parent
    WEB = Path(sys._MEIPASS) / "web"
else:
    ROOT = Path(__file__).resolve().parent.parent
    WEB = ROOT / "web"
DATA = ROOT / "data"
SETTINGS_FILE = DATA / "settings.json"
BUTTONBOX_FILE = DATA / "buttonbox.json"

DEFAULT_SETTINGS = {
    "http_port": 8777,
    "https_port": 8778,
    "f1_port": 20777,
    "forza_port": 5300,
    "gt7_ip": "",
    "sources": {"ac": True, "r3e": True, "f1": True, "forza": True, "gt7": True, "demo": False},
    "capture": {"on": False, "monitor": 1, "fps": 6, "width": 960},
}


def _btn(id_, label, key, color="", value=None, mode="tap"):
    b = {"id": id_, "label": label, "key": key, "mode": mode, "color": color}
    if value:
        b["value"] = value
    return b


DEFAULT_BUTTONBOX = {
    "active": "gt3",
    "hold_ms": 100,
    "profiles": {
        "gt3": {
            "name": "GT3 / GT4",
            "columns": 4,
            "buttons": [
                _btn("tc_dn", "TC −", "num1", "blue", "tc"),
                _btn("tc_up", "TC +", "num7", "blue", "tc"),
                _btn("abs_dn", "ABS −", "num3", "yellow", "abs"),
                _btn("abs_up", "ABS +", "num9", "yellow", "abs"),
                _btn("tc2_dn", "TC2 −", "num2", "blue", "tc2"),
                _btn("tc2_up", "TC2 +", "num8", "blue", "tc2"),
                _btn("map_dn", "MAPA −", "num0", "green", "engine_map"),
                _btn("map_up", "MAPA +", "num.", "green", "engine_map"),
                _btn("bb_dn", "BB −", "num4", "orange", "brake_bias"),
                _btn("bb_up", "BB +", "num6", "orange", "brake_bias"),
                _btn("limiter", "PIT LIMITER", "num5", "red", "pit_limiter"),
                _btn("pit", "PIT MENU", "delete", "red"),
                _btn("lights", "SVETLÁ", "num/", "", "lights"),
                _btn("flash", "FLASH", "num*", "", None, "hold"),
                _btn("wipers", "STIERAČE", "num-", "", "wipers"),
                _btn("rain", "DAŽĎ. SVETLO", "num+", "", "rain_lights"),
                _btn("ignition", "ZAPAĽ.", "insert", "red"),
                _btn("starter", "ŠTARTÉR", "home", "red", None, "hold"),
                _btn("mfd", "MFD", "pageup", ""),
                _btn("hud", "HUD", "pagedown", ""),
                _btn("ind_l", "◀ SMEROVKA", "end", ""),
                _btn("ind_r", "SMEROVKA ▶", "numenter", ""),
            ],
        },
        "formula": {
            "name": "Formula / F1",
            "columns": 4,
            "buttons": [
                _btn("drs", "DRS", "num5", "green", "drs"),
                _btn("limiter", "PIT LIMITER", "num0", "red", "pit_limiter"),
                _btn("ers_dn", "ERS −", "num1", "blue"),
                _btn("ers_up", "ERS +", "num7", "blue"),
                _btn("bb_dn", "BB −", "num4", "orange", "brake_bias"),
                _btn("bb_up", "BB +", "num6", "orange", "brake_bias"),
                _btn("diff_dn", "DIFF −", "num2", "yellow"),
                _btn("diff_up", "DIFF +", "num8", "yellow"),
                _btn("mix_dn", "MIX −", "num3", "green", "engine_map"),
                _btn("mix_up", "MIX +", "num9", "green", "engine_map"),
                _btn("mfd", "MFD", "pageup", ""),
                _btn("radio", "RÁDIO", "num.", "", None, "hold"),
            ],
        },
    },
}


def _load(path, default):
    data = copy.deepcopy(default)
    if path.exists():
        try:
            stored = json.loads(path.read_text(encoding="utf-8"))
            for k, v in stored.items():
                if isinstance(v, dict) and isinstance(data.get(k), dict) and k != "profiles":
                    data[k].update(v)
                else:
                    data[k] = v
        except ValueError:
            pass
    return data


def _save(path, data):
    DATA.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(data, indent=2, ensure_ascii=False), encoding="utf-8")


def load_settings():
    return _load(SETTINGS_FILE, DEFAULT_SETTINGS)


def save_settings(s):
    _save(SETTINGS_FILE, s)


def load_buttonbox():
    return _load(BUTTONBOX_FILE, DEFAULT_BUTTONBOX)


def save_buttonbox(b):
    _save(BUTTONBOX_FILE, b)

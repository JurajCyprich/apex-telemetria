"""Simulácia stlačenia kláves cez SendInput so scan kódmi (fungujú aj v DirectInput hrách)."""
import asyncio
import ctypes
import logging
import re

from .winapi import IS_WINDOWS

log = logging.getLogger("keys")

# scan kódy (set 1); E0 = rozšírená klávesa
SCANCODES = {
    "esc": 0x01, "1": 0x02, "2": 0x03, "3": 0x04, "4": 0x05, "5": 0x06, "6": 0x07, "7": 0x08,
    "8": 0x09, "9": 0x0A, "0": 0x0B, "minus": 0x0C, "equals": 0x0D, "backspace": 0x0E,
    "tab": 0x0F, "q": 0x10, "w": 0x11, "e": 0x12, "r": 0x13, "t": 0x14, "y": 0x15, "u": 0x16,
    "i": 0x17, "o": 0x18, "p": 0x19, "[": 0x1A, "]": 0x1B, "enter": 0x1C, "ctrl": 0x1D,
    "a": 0x1E, "s": 0x1F, "d": 0x20, "f": 0x21, "g": 0x22, "h": 0x23, "j": 0x24, "k": 0x25,
    "l": 0x26, ";": 0x27, "'": 0x28, "`": 0x29, "shift": 0x2A, "\\": 0x2B, "z": 0x2C, "x": 0x2D,
    "c": 0x2E, "v": 0x2F, "b": 0x30, "n": 0x31, "m": 0x32, ",": 0x33, ".": 0x34, "/": 0x35,
    "rshift": 0x36, "num*": 0x37, "alt": 0x38, "space": 0x39, "capslock": 0x3A,
    "f1": 0x3B, "f2": 0x3C, "f3": 0x3D, "f4": 0x3E, "f5": 0x3F, "f6": 0x40, "f7": 0x41,
    "f8": 0x42, "f9": 0x43, "f10": 0x44, "f11": 0x57, "f12": 0x58, "scrolllock": 0x46,
    "num7": 0x47, "num8": 0x48, "num9": 0x49, "num-": 0x4A, "num4": 0x4B, "num5": 0x4C,
    "num6": 0x4D, "num+": 0x4E, "num1": 0x4F, "num2": 0x50, "num3": 0x51, "num0": 0x52,
    "num.": 0x53,
}
EXTENDED = {
    "numenter": 0x1C, "rctrl": 0x1D, "num/": 0x35, "ralt": 0x38, "home": 0x47, "up": 0x48,
    "pageup": 0x49, "left": 0x4B, "right": 0x4D, "end": 0x4F, "down": 0x50, "pagedown": 0x51,
    "insert": 0x52, "delete": 0x53,
}
ALL_KEYS = sorted(set(SCANCODES) | set(EXTENDED))

# Numerická klávesnica: Windows z jej scan kódu robí Num7 len pri zapnutom NumLocku, inak Home –
# a to by sa v hre zrazilo s tlačidlom Home. Preto posielame aj presnú virtuálnu klávesu.
NUMPAD_VK = {f"num{i}": 0x60 + i for i in range(10)}
NUMPAD_VK.update({"num*": 0x6A, "num+": 0x6B, "num-": 0x6D, "num.": 0x6E, "num/": 0x6F, "numenter": 0x0D})

# klávesy, ktoré hry v menu priradenia často používajú samé (potvrdiť, zmazať, späť) – editor upozorní
RISKY = {"enter": "potvrdzuje v menu", "numenter": "hra ho vidí ako Enter (potvrdzuje v menu)",
         "delete": "v menu často maže priradenie", "backspace": "v menu často maže priradenie / späť",
         "esc": "zatvára menu", "tab": "prepína v menu", "space": "potvrdzuje v menu",
         "up": "pohyb v menu", "down": "pohyb v menu", "left": "pohyb v menu", "right": "pohyb v menu"}


def parse(combo):
    """'ctrl+shift+t' -> [(scan, extended), ...]; ValueError pri neznámej klávese."""
    out = []
    # "num+" obsahuje oddeľovač, preto ho berieme ako celok
    for part in re.findall(r"num\+|[^+]+", (combo or "").lower().replace(" ", "")):
        if part in SCANCODES:
            out.append((SCANCODES[part], False))
        elif part in EXTENDED:
            out.append((EXTENDED[part], True))
        else:
            raise ValueError(f"Neznáma klávesa: {part}")
    return out


if IS_WINDOWS:
    from ctypes import wintypes

    ULONG_PTR = ctypes.c_size_t

    class KEYBDINPUT(ctypes.Structure):
        _fields_ = [("wVk", wintypes.WORD), ("wScan", wintypes.WORD), ("dwFlags", wintypes.DWORD),
                    ("time", wintypes.DWORD), ("dwExtraInfo", ULONG_PTR)]

    class MOUSEINPUT(ctypes.Structure):
        _fields_ = [("dx", wintypes.LONG), ("dy", wintypes.LONG), ("mouseData", wintypes.DWORD),
                    ("dwFlags", wintypes.DWORD), ("time", wintypes.DWORD),
                    ("dwExtraInfo", ULONG_PTR)]

    class _U(ctypes.Union):
        _fields_ = [("ki", KEYBDINPUT), ("mi", MOUSEINPUT)]

    class INPUT(ctypes.Structure):
        _fields_ = [("type", wintypes.DWORD), ("u", _U)]

    _user32 = ctypes.WinDLL("user32", use_last_error=True)
    _user32.SendInput.argtypes = [wintypes.UINT, ctypes.POINTER(INPUT), ctypes.c_int]
    _user32.SendInput.restype = wintypes.UINT

    KEYEVENTF_EXTENDEDKEY, KEYEVENTF_KEYUP, KEYEVENTF_SCANCODE = 0x1, 0x2, 0x8
    _user32.MapVirtualKeyW.argtypes = [wintypes.UINT, wintypes.UINT]
    _user32.MapVirtualKeyW.restype = wintypes.UINT
    _SCAN_TO_VK = {}

    def _vk(scan, ext):
        """Virtuálna klávesa k scan kódu (numerická klávesnica podľa tabuľky, nezávisle od NumLocku)."""
        if (scan, ext) not in _SCAN_TO_VK:
            vk = _user32.MapVirtualKeyW(scan | (0xE000 if ext else 0), 3)  # MAPVK_VSC_TO_VK_EX
            _SCAN_TO_VK[(scan, ext)] = vk
        return _SCAN_TO_VK[(scan, ext)]

    _NUMPAD_BY_SCAN = {}
    for _name, _vkc in NUMPAD_VK.items():
        _s = SCANCODES.get(_name)
        _NUMPAD_BY_SCAN[(_s, False) if _s is not None else (EXTENDED[_name], True)] = _vkc

    def _send(keys, up):
        # VK + scan kód spolu: hry čítajúce virtuálne klávesy aj tie čítajúce scan kódy (DirectInput)
        # dostanú to isté, bez ohľadu na stav NumLocku
        arr = (INPUT * len(keys))()
        for i, (scan, ext) in enumerate(keys):
            flags = (KEYEVENTF_EXTENDEDKEY if ext else 0) | (KEYEVENTF_KEYUP if up else 0)
            vk = _NUMPAD_BY_SCAN.get((scan, ext)) or _vk(scan, ext)
            if not vk:  # neznáma klávesa – aspoň samotný scan kód
                flags |= KEYEVENTF_SCANCODE
            arr[i].type = 1
            arr[i].u.ki = KEYBDINPUT(vk, scan, flags, 0, 0)
        sent = _user32.SendInput(len(keys), arr, ctypes.sizeof(INPUT))
        if sent != len(keys):
            log.warning("SendInput odoslal %d/%d (hra beží ako správca?)", sent, len(keys))
else:
    def _send(keys, up):
        log.info("[sim] %s %s", "UP" if up else "DOWN", keys)


def key_down(combo):
    _send(parse(combo), up=False)


def key_up(combo):
    _send(list(reversed(parse(combo))), up=True)


async def tap(combo, hold_ms=60):
    """Stlačí a po hold_ms pustí. Hry čítajú vstup raz za snímok, preto krátke držanie."""
    keys = parse(combo)
    if not keys:
        return
    _send(keys, up=False)
    await asyncio.sleep(hold_ms / 1000)
    _send(list(reversed(keys)), up=True)

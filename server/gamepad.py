"""Virtuálny Xbox 360 ovládač (ViGEmBus + vgamepad) pre volant na mobile.

Mobil posiela celý stav (volant, plyn, brzda, tlačidlá) ~60× za sekundu. Ak správy prestanú
chodiť (zamknutý mobil, výpadok Wi-Fi), watchdog ovládač vynuluje – auto nesmie ostať na plyne.
"""
import asyncio
import importlib.util
import logging
import sys
import time

log = logging.getLogger("gamepad")

TIMEOUT = 0.4  # s bez správy -> neutrál

# názov z webu -> bit XUSB_BUTTON
BUTTONS = {
    "up": 0x0001, "down": 0x0002, "left": 0x0004, "right": 0x0008,
    "start": 0x0010, "back": 0x0020, "lb": 0x0100, "rb": 0x0200,
    "a": 0x1000, "b": 0x2000, "x": 0x4000, "y": 0x8000,
}

if getattr(sys, "frozen", False):
    SETUP_HINT = ("Virtuálny ovládač nie je nainštalovaný. Na PC spusti ViGEmBus_setup.msi "
                  "(je v ZIP-e vedľa ApexTelemetria.exe) a reštartuj aplikáciu.")
else:
    SETUP_HINT = ("Virtuálny ovládač nie je nainštalovaný. Na PC spusti volant_setup.bat "
                  "(nainštaluje ovládač ViGEmBus) a reštartuj aplikáciu.")


def _clamp(v, lo, hi):
    try:
        v = float(v)
    except (TypeError, ValueError):
        return 0.0
    return lo if v < lo else hi if v > hi else v


class VirtualPad:
    def __init__(self):
        self.pad = None
        self.error = None
        self.owner = None
        self.last = 0.0
        self.active = False

    def ensure(self):
        """Ovládač vytvoríme až keď ho mobil prvýkrát použije (hra ho inak vidí stále)."""
        if self.pad is not None:
            return True
        if self.error:
            return False
        try:
            import vgamepad  # noqa: PLC0415 – voliteľná závislosť
            self.pad = vgamepad.VX360Gamepad()
            log.info("Virtuálny Xbox ovládač pripojený")
            return True
        except ImportError:
            self.error = SETUP_HINT
        except Exception as e:  # ovládač ViGEmBus chýba alebo nebeží
            self.error = f"{SETUP_HINT} ({e})"
        log.warning(self.error)
        return False

    def status(self):
        error = self.error
        if self.pad is None and not error and importlib.util.find_spec("vgamepad") is None:
            error = SETUP_HINT  # zistené bez vytvorenia ovládača
        return {"ready": self.pad is not None, "error": error}

    def set(self, owner, data):
        if not self.ensure():
            return False
        steer = _clamp(data.get("steer"), -1.0, 1.0)
        thr = _clamp(data.get("thr"), 0.0, 1.0)
        brk = _clamp(data.get("brk"), 0.0, 1.0)
        mask = 0
        for name in data.get("btn") or ():
            mask |= BUTTONS.get(name, 0)
        p = self.pad
        p.left_joystick_float(steer, 0.0)
        p.right_trigger_float(thr)
        p.left_trigger_float(brk)
        p.report.wButtons = mask
        p.update()
        self.owner, self.last, self.active = owner, time.monotonic(), True
        return True

    def neutral(self, owner=None):
        if self.pad is None or not self.active or (owner is not None and owner is not self.owner):
            return
        self.pad.reset()
        self.pad.update()
        self.active = False

    async def watchdog(self):
        while True:
            await asyncio.sleep(0.1)
            if self.active and time.monotonic() - self.last > TIMEOUT:
                log.info("Volant: žiadne dáta, ovládač vynulovaný")
                self.neutral()

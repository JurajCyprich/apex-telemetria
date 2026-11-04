"""Nahrávanie obrazu kola: snímky obrazovky počas jazdy, každá označená miestom na trati.

Snímky idú najprv do data/video/tmp/<poradie kola>/, a keď sa kolo uloží, presunú sa k nemu
(data/video/<id kola>/ + index.json). Neuložené kolá sa zahodia. Na disku ostane najviac
KEEP_VIDEOS posledných nahrávok, plus najlepšie kolo každej trate a auta.
"""
import io
import json
import logging
import re
import shutil
import threading
import time

from .config import DATA

log = logging.getLogger("capture")
VIDEO = DATA / "video"
TMP = VIDEO / "tmp"
KEEP_VIDEOS = 20
FILE_RE = re.compile(r"^\d{5}\.jpg$")
ID_RE = re.compile(r"^[\w\-]+$")


def available():
    try:
        import mss  # noqa: F401
        import PIL  # noqa: F401
        return True
    except ImportError:
        return False


def _mss():
    import mss
    return (getattr(mss, "MSS", None) or mss.mss)()


def monitors():
    """Zoznam monitorov [{n, w, h, primary}] (1 = prvý monitor, ako v mss)."""
    if not available():
        return []
    try:
        with _mss() as s:
            return [{"n": i, "w": m["width"], "h": m["height"], "primary": bool(m.get("is_primary"))}
                    for i, m in enumerate(s.monitors) if i > 0]
    except Exception as e:
        log.warning("Monitory: %s", e)
        return []


class Recorder:
    def __init__(self):
        self.enabled = False
        self.monitor = 1
        self.fps = 6
        self.width = 960
        self.quality = 70
        self.state = None        # (seq, dist, lap_time) – nastavuje hlavná slučka, None = nejazdí sa
        self.status = {"on": False, "frames": 0, "warn": "", "error": ""}
        self._lock = threading.Lock()
        self._frames = {}        # seq -> [{"d", "t", "f"}]
        self._thread = None
        self._stop = threading.Event()

    # ---------- ovládanie ----------
    def configure(self, enabled=None, monitor=None, fps=None, width=None):
        if monitor is not None:
            self.monitor = max(1, int(monitor))
        if fps is not None:
            self.fps = max(2, min(15, int(fps)))
        if width is not None:
            self.width = max(480, min(1920, int(width)))
        if enabled is not None:
            self.enabled = bool(enabled) and available()
            if enabled and not available():
                self.status["error"] = "Chýbajú balíky mss a Pillow."
        if self.enabled and not (self._thread and self._thread.is_alive()):
            self._stop.clear()
            self._thread = threading.Thread(target=self._run, name="capture", daemon=True)
            self._thread.start()
        elif not self.enabled:
            self._stop.set()
        self.status["on"] = self.enabled

    def stop(self):
        self._stop.set()

    # ---------- vlákno snímania ----------
    def _run(self):
        from PIL import Image, ImageStat
        dark = 0
        try:
            sct = _mss()
        except Exception as e:
            self.status["error"] = f"Snímanie obrazovky nefunguje: {e}"
            log.error(self.status["error"])
            self.enabled = self.status["on"] = False
            return
        self.status["error"] = ""
        log.info("Nahrávanie obrazu zapnuté (monitor %d, %d snímok/s)", self.monitor, self.fps)
        with sct:
            while not self._stop.is_set():
                t0 = time.monotonic()
                st = self.state
                if st is None:
                    time.sleep(0.1)
                    continue
                seq, dist, lap_t = st
                try:
                    mons = sct.monitors
                    mon = mons[self.monitor] if self.monitor < len(mons) else mons[1]
                    g = sct.grab(mon)
                    im = Image.frombuffer("RGB", g.size, g.bgra, "raw", "BGRX", 0, 1)
                    factor = max(1, round(g.width / self.width))
                    im = im.reduce(factor) if factor > 1 else im
                    # hra v exkluzívnej celej obrazovke sa nedá zachytiť – snímky sú čierne
                    lum = sum(ImageStat.Stat(im.reduce(8).convert("L")).mean)
                    dark = dark + 1 if lum < 3 else 0
                    self.status["warn"] = ("Snímky sú čierne – prepni hru na „okno bez okraja“ (borderless) "
                                           "alebo okno.") if dark > 20 else ""
                    buf = io.BytesIO()
                    im.save(buf, "JPEG", quality=self.quality)
                    self._store(seq, dist, lap_t, buf.getvalue())
                except Exception as e:
                    self.status["error"] = f"Snímanie zlyhalo: {e}"
                    log.warning(self.status["error"])
                    time.sleep(1)
                left = 1 / self.fps - (time.monotonic() - t0)
                if left > 0:
                    self._stop.wait(left)
        log.info("Nahrávanie obrazu vypnuté")

    def _store(self, seq, dist, lap_t, data):
        folder = TMP / str(seq)
        with self._lock:
            frames = self._frames.setdefault(seq, [])
            if frames and dist < frames[-1]["d"] - 200:
                if len(frames) > 5:
                    return  # skok dozadu uprostred kola (reset do boxov) – kolo sa aj tak neuloží
                frames.clear()  # prvé snímky boli ešte s dĺžkou z konca predchádzajúceho kola
            name = f"{len(frames):05d}.jpg"
            frames.append({"d": round(dist, 1), "t": round(lap_t, 3), "f": name})
            self.status["frames"] = len(frames)
            old = [s for s in self._frames if s < seq - 2]
            for s in old:  # zabudnuté kolá (reštart, výjazd z boxov…)
                self._frames.pop(s, None)
                shutil.rmtree(TMP / str(s), ignore_errors=True)
        folder.mkdir(parents=True, exist_ok=True)
        (folder / name).write_bytes(data)

    # ---------- koniec kola ----------
    def commit(self, lap, seq, keep_ids=()):
        """Kolo sa uložilo: snímky presunie k nemu. keep_ids = kolá, ktorých video sa nemaže."""
        with self._lock:
            frames = self._frames.pop(seq, None)
        src = TMP / str(seq)
        if not frames or len(frames) < 20:
            shutil.rmtree(src, ignore_errors=True)
            return False
        dst = VIDEO / lap["id"]
        try:
            shutil.rmtree(dst, ignore_errors=True)
            src.rename(dst)
            index = {"id": lap["id"], "game": lap["game"], "track": lap["track"], "car": lap["car"],
                     "time": lap["time"], "date": lap["date"], "fps": self.fps, "frames": frames}
            (dst / "index.json").write_text(json.dumps(index, separators=(",", ":")), encoding="utf-8")
        except OSError as e:
            log.warning("Video kola %s: %s", lap["id"], e)
            return False
        log.info("Video kola %s: %d snímok", lap["id"], len(frames))
        self.prune(keep_ids)
        return True

    def discard(self, seq):
        with self._lock:
            self._frames.pop(seq, None)
        shutil.rmtree(TMP / str(seq), ignore_errors=True)

    def prune(self, keep_ids=()):
        vids = sorted((p for p in VIDEO.glob("*") if p.is_dir() and p.name != "tmp"), key=lambda p: p.name, reverse=True)
        for p in vids[KEEP_VIDEOS:]:
            if p.name not in keep_ids:
                shutil.rmtree(p, ignore_errors=True)

    def clear_tmp(self):
        shutil.rmtree(TMP, ignore_errors=True)


# ---------- čítanie nahrávok ----------
def has_video(lap_id):
    return bool(ID_RE.match(lap_id or "")) and (VIDEO / lap_id / "index.json").exists()


def index(lap_id):
    if not has_video(lap_id):
        return None
    try:
        return json.loads((VIDEO / lap_id / "index.json").read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return None


def frame_path(lap_id, name):
    if not ID_RE.match(lap_id or "") or not FILE_RE.match(name or ""):
        return None
    p = VIDEO / lap_id / name
    return p if p.exists() else None


def list_ids():
    return {p.parent.name for p in VIDEO.glob("*/index.json")} if VIDEO.exists() else set()


def delete(lap_id):
    if ID_RE.match(lap_id or "") and lap_id != "tmp":
        shutil.rmtree(VIDEO / lap_id, ignore_errors=True)


def size_mb():
    if not VIDEO.exists():
        return 0
    return round(sum(f.stat().st_size for f in VIDEO.rglob("*") if f.is_file()) / 1e6, 1)

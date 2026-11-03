"""Desktopová aplikácia: server beží na pozadí, dashboard vo vlastnom okne (pywebview / WebView2).

Zatvorením okna sa vypne celá aplikácia. Mobil (button box, volant) sa pripája ako predtým.
"""
import asyncio
import ctypes
import logging
import os
import sys
import threading
import time
import urllib.request

from .config import DATA

log = logging.getLogger("desktop")
TITLE = "Apex Telemetria"


def message_box(text, error=True):
    if sys.platform == "win32":
        ctypes.windll.user32.MessageBoxW(None, text, TITLE, 0x10 if error else 0x40)
    else:
        print(text, file=sys.stderr)


def _focus_running_window():
    """Ak už aplikácia beží, len prenesie jej okno dopredu."""
    if sys.platform != "win32":
        return False
    user32 = ctypes.windll.user32
    hwnd = user32.FindWindowW(None, TITLE)
    if not hwnd:
        return False
    user32.ShowWindow(hwnd, 9)  # SW_RESTORE
    user32.SetForegroundWindow(hwnd)
    return True


def _port_in_use(port):
    try:
        urllib.request.urlopen(f"http://127.0.0.1:{port}/api/settings", timeout=1)
        return True
    except OSError:
        return False


class Api:
    """Funkcie volané z JavaScriptu (window.pywebview.api.*)."""

    def __init__(self):
        # podčiarkovník: pywebview by inak sprístupnil JavaScriptu celé okno aj s vnútornosťami WebView2
        self._window = None

    def toggle_fullscreen(self):
        self._window.toggle_fullscreen()
        return True


def run(port=None):
    import webview
    from .app import serve

    if _focus_running_window():
        return
    if port is None:
        from .config import load_settings
        port = load_settings()["http_port"]
    # predchádzajúce okno sa možno práve zatvára – chvíľu počkáme, kým uvoľní port
    for _ in range(16):
        if not _port_in_use(port):
            break
        time.sleep(0.5)
    else:
        message_box(f"Port {port} už používa iný program (možno beží Apex Telemetria cez start.bat).")
        return

    ready = threading.Event()
    state = {"error": None, "loop": None, "task": None}

    def server_thread():
        loop = asyncio.new_event_loop()
        asyncio.set_event_loop(loop)
        state["loop"] = loop
        state["task"] = loop.create_task(serve(port, open_browser=False, on_ready=lambda p: ready.set()))
        try:
            loop.run_until_complete(state["task"])
        except asyncio.CancelledError:
            pass
        except Exception as e:  # napr. obsadený port
            log.exception("Server spadol")
            state["error"] = e
        finally:
            ready.set()
            loop.close()

    thread = threading.Thread(target=server_thread, name="server", daemon=True)
    thread.start()
    ready.wait(30)
    if state["error"] or not thread.is_alive():
        message_box(f"Aplikáciu sa nepodarilo spustiť:\n{state['error']}\n\nPodrobnosti sú v {DATA / 'apex.log'}")
        return

    api = Api()
    api._window = webview.create_window(TITLE, f"http://localhost:{port}/", js_api=api, width=1440, height=900,
                                       min_size=(900, 600), background_color="#0b0d12")
    # vlastný profil WebView2 v data/, aby sa nastavenia stránok pamätali
    webview.start(private_mode=False, storage_path=str(DATA / "webview"))

    # okno zatvorené -> zastaviť server (pustí plyn na volante, uvoľní porty)
    loop, task = state["loop"], state["task"]
    if loop and task and not loop.is_closed():
        loop.call_soon_threadsafe(task.cancel)
    thread.join(2)
    log.info("Okno zatvorené, koniec")
    logging.shutdown()
    os._exit(0)  # nečakáme na vlákna knižníc (WebView2, UDP) – porty uvoľní systém hneď

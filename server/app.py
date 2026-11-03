"""Webový server: živá telemetria cez WebSocket, API pre kolá, nastavenia, button box a volant."""
import asyncio
import json
import logging
import socket
import time

import segno
from aiohttp import WSMsgType, web

from . import certs, displays, keys, updates
from .gamepad import VirtualPad
from .config import (DATA, WEB, load_buttonbox, load_settings, save_buttonbox,
                     save_settings)
from .laps import LapRecorder, LapStore
from .sims import SOURCES

log = logging.getLogger("app")
STALE_AFTER = 2.0


def lan_ips():
    ips = []
    try:
        with socket.socket(socket.AF_INET, socket.SOCK_DGRAM) as s:
            s.connect(("10.255.255.255", 1))  # nič sa neodošle, len zistí lokálnu IP
            ips.append(s.getsockname()[0])
    except OSError:
        pass
    try:
        for info in socket.getaddrinfo(socket.gethostname(), None, socket.AF_INET):
            ip = info[4][0]
            if ip not in ips and not ip.startswith("127."):
                ips.append(ip)
    except OSError:
        pass
    return ips


def is_local(request):
    return request.remote in ("127.0.0.1", "::1")


def local_only(handler):
    async def wrapper(self, request):
        if not is_local(request):
            raise web.HTTPForbidden(text="Zmeny sú povolené len z tohto PC.")
        return await handler(self, request)
    return wrapper


class TelemetryApp:
    def __init__(self):
        self.settings = load_settings()
        self.buttonbox = load_buttonbox()
        self.displays = displays.load()
        self.store = LapStore(DATA / "laps")
        self.recorder = LapRecorder(self.store)
        self.recorder.on_lap = lambda lap: self.events.append({"type": "lap", "data": lap})
        self.latest = {}
        self.active_id = None
        self.tasks = {}
        self.clients = set()
        self.events = []
        self.held = {}  # ws -> {button_id: combo}
        self.pad = VirtualPad()
        self.last_rumble = {}  # ws -> (large, small)
        loop = asyncio.get_running_loop()
        self.pad.on_rumble = lambda ws, large, small: loop.call_soon_threadsafe(self._rumble, ws, large, small)
        self.https_port = None

    # ---------- zdroje telemetrie ----------
    def emit(self, frame):
        self.latest[frame.source] = (time.monotonic(), frame)

    async def start_sources(self):
        old = list(self.tasks.values())
        for task in old:
            task.cancel()
        await asyncio.gather(*old, return_exceptions=True)  # uvoľní UDP porty
        self.tasks = {}
        self.latest = {}
        for sid, cls in SOURCES.items():
            if self.settings["sources"].get(sid, False):
                self.tasks[sid] = asyncio.create_task(self._run_source(cls(self.settings, self.emit)))

    async def _run_source(self, src):
        while True:
            try:
                await src.run()
            except asyncio.CancelledError:
                src.close()
                raise
            except OSError as e:
                log.error("%s: %s (skúsim znova o 5 s)", src.name, e)
            except Exception:
                log.exception("%s spadol (skúsim znova o 5 s)", src.name)
            src.close()
            await asyncio.sleep(5)

    def active_frame(self):
        """Aktívna hra: držíme sa poslednej, kým posiela dáta (žiadne preskakovanie)."""
        now = time.monotonic()
        fresh = {sid: f for sid, (t, f) in self.latest.items() if now - t <= STALE_AFTER}
        cur = fresh.get(self.active_id)
        if cur is not None and (not cur.paused or all(f.paused for f in fresh.values())):
            return cur
        best = None
        for sid, f in fresh.items():
            score = (not f.paused, self.latest[sid][0])
            if best is None or score > best[0]:
                best = (score, sid)
        self.active_id = best[1] if best else None
        return fresh[self.active_id] if best else None

    async def loop(self):
        last = last_send = time.monotonic()
        while True:
            await asyncio.sleep(1 / 60)
            now = time.monotonic()
            dt, last = now - last, now
            f = self.active_frame()
            if f is None:
                data = {"connected": False}
            else:
                data = f.to_dict()
                data.update(self.recorder.update(f, dt))
            if not self.clients:
                self.events.clear()
                continue
            msgs = [json.dumps(e) for e in self.events]
            self.events.clear()
            if now - last_send >= 1 / 40:  # klientom max ~30-40 Hz
                last_send = now
                msgs.append(json.dumps({"type": "frame", "data": data}))
            for m in msgs:
                await asyncio.gather(*(self._send(ws, m) for ws in list(self.clients)))

    async def _send(self, ws, msg):
        try:
            await ws.send_str(msg)
        except (ConnectionError, RuntimeError):
            self.clients.discard(ws)

    # ---------- WebSocket ----------
    async def ws_handler(self, request):
        ws = web.WebSocketResponse(heartbeat=10)
        await ws.prepare(request)
        self.clients.add(ws)
        self.held[ws] = {}
        pad_ok = None
        try:
            async for msg in ws:
                if msg.type != WSMsgType.TEXT:
                    continue
                try:
                    data = json.loads(msg.data)
                except ValueError:
                    continue
                kind = data.get("type")
                if kind == "pad":
                    ok = self.pad.set(ws, data)
                    if ok != pad_ok:  # mobilu povieme, či ovládač funguje (len pri zmene)
                        pad_ok = ok
                        await self._send(ws, json.dumps({"type": "pad_status", **self.pad.status()}))
                elif kind == "press":
                    await self._press(ws, data)
        finally:
            self.clients.discard(ws)
            self.pad.neutral(ws)  # odpojený volant -> pustiť plyn
            self.last_rumble.pop(ws, None)
            for combo in self.held.pop(ws, {}).values():
                keys.key_up(combo)  # pustí klávesy držané odpojeným mobilom
        return ws

    def _rumble(self, ws, large, small):
        """Vibrácie z hry -> mobil, ktorý práve ovláda volant."""
        if ws in self.clients and self.last_rumble.get(ws) != (large, small):  # ovládač hlási aj opakovane to isté
            self.last_rumble[ws] = (large, small)
            asyncio.ensure_future(self._send(ws, json.dumps({"type": "rumble", "l": large, "s": small})))

    def _button(self, profile_id, button_id):
        prof = self.buttonbox["profiles"].get(profile_id) or {}
        return next((b for b in prof.get("buttons", []) if b["id"] == button_id), None)

    async def _press(self, ws, data):
        btn = self._button(data.get("profile"), data.get("id"))
        if not btn or not btn.get("key"):
            return
        combo, action = btn["key"], data.get("action", "tap")
        try:
            if action == "down":
                self.held[ws][btn["id"]] = combo
                keys.key_down(combo)
            elif action == "up":
                self.held[ws].pop(btn["id"], None)
                keys.key_up(combo)
            else:
                await keys.tap(combo, int(self.buttonbox.get("hold_ms", 100)))
        except ValueError as e:
            log.warning("Button box: %s", e)

    # ---------- HTTP API ----------
    async def api_info(self, request):
        port, ips = self.settings["http_port"], lan_ips()
        urls = [f"http://{ip}:{port}/buttonbox" for ip in ips]
        wheel = [f"https://{ip}:{self.https_port}/wheel" for ip in ips] if self.https_port else []
        display = [f"http://{ip}:{port}/display" for ip in ips]

        def qr(u):
            return segno.make(u[0]).svg_inline(scale=5, dark="#000", light="#fff") if u else ""
        return web.json_response({"urls": urls, "qr": qr(urls), "wheel_urls": wheel,
                                  "wheel_qr": qr(wheel), "display_urls": display, "display_qr": qr(display),
                                  "pad": self.pad.status(),
                                  "local": is_local(request),
                                  "sources": {sid: c.name for sid, c in SOURCES.items()}})

    async def api_update(self, request):
        return web.json_response(await updates.check())

    async def api_settings(self, request):
        return web.json_response(self.settings)

    @local_only
    async def api_settings_save(self, request):
        body = await request.json()
        s = self.settings
        for k in ("f1_port", "forza_port"):
            if k in body:
                s[k] = int(body[k])
        if "gt7_ip" in body:
            s["gt7_ip"] = str(body["gt7_ip"]).strip()
        if isinstance(body.get("sources"), dict):
            for sid in SOURCES:
                if sid in body["sources"]:
                    s["sources"][sid] = bool(body["sources"][sid])
        save_settings(s)
        await self.start_sources()
        return web.json_response(s)

    async def api_buttonbox(self, request):
        return web.json_response({**self.buttonbox, "keys": keys.ALL_KEYS, "risky": keys.RISKY,
                                  "can_edit": is_local(request)})

    @local_only
    async def api_buttonbox_save(self, request):
        body = await request.json()
        for prof in body.get("profiles", {}).values():
            for b in prof.get("buttons", []):
                try:
                    keys.parse(b.get("key", ""))
                except ValueError as e:
                    raise web.HTTPBadRequest(text=f"{b.get('label')}: {e}")
        self.buttonbox = {"active": body.get("active", "gt3"),
                          "hold_ms": int(body.get("hold_ms", 100)),
                          "profiles": body.get("profiles", {})}
        save_buttonbox(self.buttonbox)
        return web.json_response(self.buttonbox)

    # ---------- vlastné displeje (upravovať môže ktokoľvek v sieti – nič neovládajú) ----------
    async def api_displays(self, request):
        return web.json_response(self.displays)

    async def api_display_save(self, request):
        did = request.match_info["id"]
        if not displays.ID_RE.match(did):
            raise web.HTTPBadRequest(text="Neplatné id displeja")
        if request.content_length and request.content_length > 300_000:
            raise web.HTTPRequestEntityTooLarge(max_size=300_000, actual_size=request.content_length)
        try:
            layout = displays.validate(await request.json())
        except ValueError as e:
            raise web.HTTPBadRequest(text=str(e))
        self.displays["layouts"][did] = layout
        displays.save(self.displays)
        self.events.append({"type": "display_saved", "id": did})  # otvorené displeje sa obnovia
        return web.json_response(layout)

    async def api_display_delete(self, request):
        ok = self.displays["layouts"].pop(request.match_info["id"], None) is not None
        if ok:
            displays.save(self.displays)
            self.events.append({"type": "display_saved", "id": request.match_info["id"]})
        return web.json_response({"ok": ok})

    async def api_laps(self, request):
        return web.json_response(await asyncio.to_thread(self.store.list))

    async def api_lap(self, request):
        lap = await asyncio.to_thread(self.store.load, request.match_info["id"])
        if not lap:
            raise web.HTTPNotFound()
        return web.json_response(lap)

    @local_only
    async def api_lap_delete(self, request):
        ok = self.store.delete(request.match_info["id"])
        return web.json_response({"ok": ok})

    async def api_map(self, request):
        return web.json_response({"points": self.recorder.map_points(),
                                  "version": self.recorder.map_version})

    def page(self, name):
        async def handler(request):
            return web.FileResponse(WEB / name, headers={"Cache-Control": "no-cache"})
        return handler

    def build(self):
        @web.middleware
        async def no_cache(request, handler):
            resp = await handler(request)
            if request.path.startswith("/static/"):
                resp.headers["Cache-Control"] = "no-cache"
            return resp

        app = web.Application(middlewares=[no_cache])
        r = app.router
        r.add_get("/", self.page("index.html"))
        r.add_get("/buttonbox", self.page("buttonbox.html"))
        r.add_get("/analysis", self.page("analysis.html"))
        r.add_get("/wheel", self.page("wheel.html"))
        r.add_get("/display", self.page("display.html"))
        r.add_get("/ws", self.ws_handler)
        r.add_get("/api/info", self.api_info)
        r.add_get("/api/update", self.api_update)
        r.add_get("/api/settings", self.api_settings)
        r.add_post("/api/settings", self.api_settings_save)
        r.add_get("/api/buttonbox", self.api_buttonbox)
        r.add_put("/api/buttonbox", self.api_buttonbox_save)
        r.add_get("/api/displays", self.api_displays)
        r.add_put("/api/displays/{id}", self.api_display_save)
        r.add_delete("/api/displays/{id}", self.api_display_delete)
        r.add_get("/api/laps", self.api_laps)
        r.add_get("/api/laps/{id}", self.api_lap)
        r.add_delete("/api/laps/{id}", self.api_lap_delete)
        r.add_get("/api/map", self.api_map)
        r.add_static("/static/", WEB)
        return app


async def serve(port=None, open_browser=True, on_ready=None):
    tapp = TelemetryApp()
    if port:
        tapp.settings["http_port"] = port
    port = tapp.settings["http_port"]
    runner = web.AppRunner(tapp.build())
    await runner.setup()
    await web.TCPSite(runner, "0.0.0.0", port).start()
    ips = lan_ips()
    ctx = certs.ssl_context(ips)
    if ctx:
        try:
            https_port = tapp.settings["https_port"]
            await web.TCPSite(runner, "0.0.0.0", https_port, ssl_context=ctx).start()
            tapp.https_port = https_port
        except OSError as e:
            log.error("HTTPS port %s: %s – volant nebude dostupný", tapp.settings["https_port"], e)
    await tapp.start_sources()
    loop_task = asyncio.create_task(tapp.loop())
    pad_task = asyncio.create_task(tapp.pad.watchdog())

    print(f"\n  Telemetria beží:  http://localhost:{port}")
    for ip in ips:
        print(f"  Button box (mobil): http://{ip}:{port}/buttonbox")
        if tapp.https_port:
            print(f"  Volant (mobil):     https://{ip}:{tapp.https_port}/wheel")
    print("  Ukončenie: Ctrl+C\n", flush=True)
    if on_ready:
        on_ready(port)
    if open_browser:
        import webbrowser
        webbrowser.open(f"http://localhost:{port}")
    try:
        await loop_task
    finally:
        pad_task.cancel()
        tapp.pad.neutral()
        for task in tapp.tasks.values():
            task.cancel()
        await asyncio.gather(*tapp.tasks.values(), return_exceptions=True)
        await runner.cleanup()

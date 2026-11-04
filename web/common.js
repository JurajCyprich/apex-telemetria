// Spoločné pomocné funkcie pre všetky stránky.

function connectWS(onFrame, onEvent) {
  let ws = null;
  let alive = false;
  const api = {
    send(obj) { if (ws && ws.readyState === 1) ws.send(JSON.stringify(obj)); },
    get connected() { return alive; },
  };
  function open() {
    ws = new WebSocket(`${location.protocol === "https:" ? "wss" : "ws"}://${location.host}/ws`);
    ws.onopen = () => { alive = true; };
    ws.onmessage = (e) => {
      const msg = JSON.parse(e.data);
      if (msg.type === "frame") onFrame(msg.data);
      else if (onEvent) onEvent(msg);
    };
    ws.onclose = () => { alive = false; onFrame({ connected: false, offline: true }); setTimeout(open, 1500); };
  }
  open();
  return api;
}

function fmtTime(s) {
  if (!s || s <= 0) return "-:--.---";
  const m = Math.floor(s / 60);
  const sec = s - m * 60;
  return `${m}:${sec.toFixed(3).padStart(6, "0")}`;
}

function fmtDelta(d) {
  if (d === null || d === undefined) return "±0.000";
  return (d > 0 ? "+" : d < 0 ? "−" : "±") + Math.abs(d).toFixed(3);
}

function fmtNum(v, digits = 0, fallback = "–") {
  return v === null || v === undefined || Number.isNaN(v) ? fallback : Number(v).toFixed(digits);
}

function gearText(g) {
  return g === -1 ? "R" : g === 0 ? "N" : String(g);
}

// farba pneumatiky podľa teploty (studená modrá -> ideálna zelená -> horúca červená)
function tyreColor(t, lo = 70, hi = 100) {
  if (t === null || t === undefined) return "#2a3042";
  if (t < lo - 20) return "#1d4ed8";
  if (t < lo) return "#0ea5e9";
  if (t <= hi) return "#16a34a";
  if (t <= hi + 12) return "#f59e0b";
  return "#dc2626";
}

function brakeColor(t) {
  if (t === null || t === undefined) return "#2a3042";
  if (t < 200) return "#0ea5e9";
  if (t < 650) return "#16a34a";
  if (t < 850) return "#f59e0b";
  return "#dc2626";
}

async function getJSON(url, opts) {
  const r = await fetch(url, opts);
  if (!r.ok) throw new Error(await r.text());
  return r.json();
}

function toast(text) {
  let el = document.querySelector(".toast");
  if (!el) { el = document.createElement("div"); el.className = "toast"; document.body.appendChild(el); }
  el.textContent = text;
  el.classList.add("show");
  clearTimeout(el._t);
  el._t = setTimeout(() => el.classList.remove("show"), 2200);
}

// Tlačidlo celej obrazovky (+ kláves F). Počas celej obrazovky drží displej zapnutý.
function setupFullscreen(btn) {
  const el = document.documentElement;
  const request = el.requestFullscreen || el.webkitRequestFullscreen;
  const exit = document.exitFullscreen || document.webkitExitFullscreen;
  const current = () => document.fullscreenElement || document.webkitFullscreenElement;
  const standalone = matchMedia("(display-mode: fullscreen), (display-mode: standalone)").matches
    || navigator.standalone;
  let wakeLock = null;
  let desktopFs = false;

  async function lockScreen(on) {
    try {
      if (on && !wakeLock && navigator.wakeLock) {
        wakeLock = await navigator.wakeLock.request("screen");
        wakeLock.addEventListener("release", () => { wakeLock = null; });
      } else if (!on && wakeLock) {
        await wakeLock.release();
      }
    } catch { /* nepodporované alebo zamietnuté – nevadí */ }
  }

  function toggle() {
    // desktopová aplikácia: celá obrazovka pre celé okno (HTML fullscreen by vyplnil len okno)
    if (window.pywebview?.api?.toggle_fullscreen) {
      desktopFs = !desktopFs;
      window.pywebview.api.toggle_fullscreen();
      return sync();
    }
    if (current()) return exit.call(document);
    if (!request) {
      // iPhone Safari nepodporuje celú obrazovku – jediná cesta je ikona na ploche
      toast(standalone ? "Už beží na celú obrazovku" : "iPhone: Zdieľať → Pridať na plochu, potom otvor z plochy");
      return;
    }
    Promise.resolve(request.call(el, { navigationUI: "hide" }))
      .catch(() => toast("Celá obrazovka nie je podporovaná"));
  }

  function sync() {
    const on = !!current() || desktopFs;
    document.body.classList.toggle("is-fullscreen", on);
    btn.textContent = "compact" in btn.dataset ? (on ? "✕" : "⛶") : (on ? "✕ Zmenšiť" : "⛶ Celá obrazovka");
    btn.title = on ? "Ukončiť celú obrazovku (F / Esc)" : "Celá obrazovka (F)";
    lockScreen(on || standalone);
  }

  btn.addEventListener("click", toggle);
  document.addEventListener("fullscreenchange", sync);
  document.addEventListener("webkitfullscreenchange", sync);
  // wake lock sa uvoľní pri prepnutí aplikácie – po návrate ho obnovíme
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") lockScreen(!!current() || standalone);
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && desktopFs) return toggle();
    if ((e.key === "f" || e.key === "F") && !e.ctrlKey && !e.altKey && !e.metaKey
        && !e.target.closest("input, textarea, select, [contenteditable]")) toggle();
  });
  sync();
  return {
    // zapne celú obrazovku bez hlášok (volá sa z iného kliknutia, napr. Štart volantu)
    enter: () => (current() || !request ? Promise.resolve()
      : Promise.resolve(request.call(el, { navigationUI: "hide" })).catch(() => {})),
  };
}

function setupCanvas(canvas) {
  const dpr = window.devicePixelRatio || 1;
  const rect = canvas.getBoundingClientRect();
  canvas.width = Math.max(1, Math.round(rect.width * dpr));
  canvas.height = Math.max(1, Math.round(rect.height * dpr));
  const ctx = canvas.getContext("2d");
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  return { ctx, w: rect.width, h: rect.height };
}

// Vykreslí trať z bodov [[x,z],...]; vráti funkciu, ktorá prevedie (x,z) na pixely.
function drawTrack(ctx, w, h, points, style = {}) {
  if (!points || points.length < 2) return null;
  let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
  for (const [x, z] of points) {
    if (x < minX) minX = x; if (x > maxX) maxX = x;
    if (z < minZ) minZ = z; if (z > maxZ) maxZ = z;
  }
  const pad = 16;
  const scale = Math.min((w - 2 * pad) / (maxX - minX || 1), (h - 2 * pad) / (maxZ - minZ || 1));
  const ox = (w - (maxX - minX) * scale) / 2;
  const oz = (h - (maxZ - minZ) * scale) / 2;
  const project = (x, z) => [ox + (x - minX) * scale, h - (oz + (z - minZ) * scale)];
  ctx.lineJoin = "round";
  ctx.lineCap = "round";
  ctx.strokeStyle = style.outline || "#2a3145";
  ctx.lineWidth = style.width || 9;
  ctx.beginPath();
  points.forEach(([x, z], i) => { const [px, py] = project(x, z); i ? ctx.lineTo(px, py) : ctx.moveTo(px, py); });
  ctx.stroke();
  ctx.strokeStyle = style.color || "#5b6378";
  ctx.lineWidth = 2;
  ctx.stroke();
  return project;
}

// ---------- haptika ----------
// Android: navigator.vibrate. iPhone Safari vibrovanie stránkam nepovoľuje; jediná cesta je
// prepnúť skrytý systémový prepínač (<input type=checkbox switch>, iOS 17.4+), ktorý ťukne
// Taptic Engine. Apple to v novších iOS obmedzuje, preto je to len "ak to pôjde, fajn".
const IS_IOS = /iPad|iPhone|iPod/.test(navigator.userAgent)
  || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
const CAN_VIBRATE = typeof navigator.vibrate === "function";
let _hapLabel = null;
function haptic(ms = 15) {
  if (CAN_VIBRATE) { navigator.vibrate(ms); return; }
  if (!IS_IOS) return;
  try {
    if (!_hapLabel) {
      _hapLabel = document.createElement("label");
      _hapLabel.setAttribute("aria-hidden", "true");
      _hapLabel.style.cssText = "position:fixed;left:-100px;top:0;width:1px;height:1px;overflow:hidden;opacity:0;pointer-events:none";
      const sw = document.createElement("input");
      sw.type = "checkbox";
      sw.setAttribute("switch", "");
      sw.tabIndex = -1;
      sw.addEventListener("click", (e) => e.stopPropagation());
      _hapLabel.append(sw);
      document.body.append(_hapLabel);
    }
    _hapLabel.click();
  } catch { /* nič */ }
}

// Volant na mobile: náklon mobilu = zatáčanie, posuvníky = plyn/brzda, posiela sa ako Xbox ovládač.
const $ = (id) => document.getElementById(id);
const STYLES = { f1: "F1 – LED svetlá", gt: "GT – pruh otáčok", analog: "Analógový otáčkomer", minimal: "Minimal" };
const DEFAULTS = { style: "f1", curve: 1, vibrate: true, rumble: true, rumbleGain: 100, rumbleFx: !CAN_VIBRATE && !NATIVE,
  fx: true, say: true };
// nastavenia zatáčania – každá hra má vlastný profil, prepína sa podľa telemetrie
const STEER_DEFAULTS = { range: 90, dead: 1, anti: 0, lin: 1, smooth: 40, invert: false };
const GENERIC = "Všeobecný";

function load(key) {
  try { return JSON.parse(localStorage.getItem(key) || "{}"); } catch { return {}; }
}
function store(key, val) { try { localStorage.setItem(key, JSON.stringify(val)); } catch { /* nevadí */ } }

const cfg = { ...DEFAULTS, ...load("wheelCfg") };
const profiles = load("wheelProfiles");
// staršia verzia mala zatáčanie v cfg – prevezmeme ho ako východisko
for (const k of Object.keys(STEER_DEFAULTS)) if (k in cfg && k !== "curve") STEER_DEFAULTS[k] = cfg[k];
let profileName = GENERIC;
let sp = { ...STEER_DEFAULTS, ...profiles[GENERIC] };

function saveCfg() {
  store("wheelCfg", cfg);
  profiles[profileName] = { ...sp };
  store("wheelProfiles", profiles);
}

function useProfile(name) {
  if (name === profileName) return;
  profileName = name;
  sp = { ...STEER_DEFAULTS, ...profiles[name] };
  steerFilter.reset();
  if (running) toast(`Profil volantu: ${name}`);
  if ($("setModal").classList.contains("open")) fillSettings();
}

const input = { steer: 0, thr: 0, brk: 0, btn: new Set() };
let running = false;

// ---------- pedále (posuvníky; po pustení sa vrátia na nulu) ----------
const pedals = [];
function setupPedal(el, key) {
  const fill = el.querySelector(".fill");
  const num = el.querySelector("b");
  let pid = null;
  const show = () => { fill.style.height = `${input[key] * 100}%`; num.textContent = Math.round(input[key] * 100); };
  const move = (e) => {
    const r = el.getBoundingClientRect();
    // horných 10 % = plný plyn/brzda, aby sa palcom dalo ľahko dosiahnuť 100 %
    const raw = Math.min(1, Math.max(0, (r.bottom - e.clientY) / (r.height * 0.9)));
    input[key] = raw ** cfg.curve;
    show();
  };
  const end = (e) => {
    if (e.pointerId !== pid) return;
    pid = null;
    input[key] = 0;
    show();
  };
  el.addEventListener("pointerdown", (e) => { pid = e.pointerId; el.setPointerCapture(pid); move(e); });
  el.addEventListener("pointermove", (e) => { if (e.pointerId === pid) move(e); });
  el.addEventListener("pointerup", end);
  el.addEventListener("pointercancel", end);
  el.addEventListener("lostpointercapture", end);
  pedals.push(() => { pid = null; input[key] = 0; show(); });
}
setupPedal($("throttle"), "thr");
setupPedal($("brake"), "brk");

// ---------- tlačidlá a radiace pádla ----------
const buttonResets = [];
document.querySelectorAll("[data-btn]").forEach((el) => {
  const name = el.dataset.btn;
  const pointers = new Set();
  el.addEventListener("pointerdown", (e) => {
    pointers.add(e.pointerId);
    el.setPointerCapture(e.pointerId);
    input.btn.add(name);
    el.classList.add("down");
    haptic(12);
    send(true);
  });
  const off = (e) => {
    if (!pointers.delete(e.pointerId) || pointers.size) return;
    input.btn.delete(name);
    el.classList.remove("down");
    send(true);
  };
  el.addEventListener("pointerup", off);
  el.addEventListener("pointercancel", off);
  buttonResets.push(() => { pointers.clear(); el.classList.remove("down"); });
});

function releaseAll() {
  pedals.forEach((f) => f());
  buttonResets.forEach((f) => f());
  input.btn.clear();
  rumbleLevel = 0;
  navigator.vibrate?.(0);
  nativeRumble(0);
  showRumbleFx(0);
}

// ---------- natočenie mobilu ----------
// Uhol počítame zo smeru "hore" v súradniciach mobilu, a to ako rozdiel voči kalibrovanému
// stredu – nezáleží teda na orientácii obrazovky ani na znamienkach, ktoré sa líšia medzi iOS a Androidom.
// Prednostne berieme deviceorientation: systém ho skladá z gyroskopu aj akcelerometra, takže sa
// netrasie od pohybu rúk. Surový akcelerometer (devicemotion) je len záloha.
let rawAngle = null;
let center = null;
let steerDeg = 0;
let tooFlat = false;
let sensor = "–";
let lastOrientation = 0;
const wrap = (a) => ((a + 540) % 360) - 180;
const RAD = Math.PI / 180;

// One Euro filter: v pokoji silno vyhladí trasenie, pri rýchlom pohybe takmer nepridá oneskorenie
const steerFilter = {
  x: null, dx: 0, t: 0,
  reset() { this.x = null; this.dx = 0; },
  alpha(cutoff, dt) { return 1 / (1 + 1 / (2 * Math.PI * cutoff * dt)); },
  filter(v, t) {
    if (this.x === null) { this.x = v; this.t = t; return v; }
    const dt = Math.max(1e-3, (t - this.t) / 1000);
    this.t = t;
    const minCutoff = 0.4 + 9 * (1 - sp.smooth / 100) ** 2;  // Hz
    const beta = 0.04;
    const ad = this.alpha(1.0, dt);
    this.dx = ad * ((v - this.x) / dt) + (1 - ad) * this.dx;
    const a = this.alpha(minCutoff + beta * Math.abs(this.dx), dt);
    this.x = a * v + (1 - a) * this.x;
    return this.x;
  },
};

function onUpVector(x, y, flatLimit, t) {
  tooFlat = Math.hypot(x, y) < flatLimit;  // mobil leží naplocho – uhol by bol náhodný
  if (tooFlat) return;
  rawAngle = Math.atan2(x, y) / RAD;
  if (center === null) { center = rawAngle; steerFilter.reset(); }
  let deg = -wrap(rawAngle - center);
  if (sp.invert) deg = -deg;
  steerDeg = steerFilter.filter(deg, t);
}

function onOrientation(e) {
  if (e.beta === null || e.gamma === null) return;
  lastOrientation = performance.now();
  sensor = "gyroskop";
  // smer "hore" v súradniciach zariadenia z Eulerových uhlov (Z-X'-Y'')
  const b = e.beta * RAD;
  const g = e.gamma * RAD;
  onUpVector(-Math.cos(b) * Math.sin(g), Math.sin(b), 0.3, performance.now());
}

// appka Apex Volant posiela náklon sama (gyroskop + akcelerometer zo systému), 60× za sekundu
window.apexMotion = (x, y) => {
  lastOrientation = performance.now();
  sensor = "gyroskop (appka)";
  onUpVector(x, y, 0.3, lastOrientation);
};

function onMotion(e) {
  if (performance.now() - lastOrientation < 500) return;  // gyroskop funguje – akcelerometer netreba
  const g = e.accelerationIncludingGravity;
  if (!g || g.x === null) return;
  sensor = "akcelerometer";
  onUpVector(g.x, g.y, 3, performance.now());
}

function calibrate() {
  center = rawAngle;
  steerDeg = 0;
  steerFilter.reset();
}

// uhol -> výstup páčky: mŕtva zóna, krivka a kompenzácia mŕtvej zóny hry
function shapeSteer(deg) {
  let s = Math.min(1, Math.abs(deg) / (sp.range / 2));
  const dz = sp.dead / 100;
  if (s <= dz) return 0;
  s = (s - dz) / (1 - dz);
  s **= sp.lin;
  const anti = sp.anti / 100;  // hra by malé výchylky ignorovala – preskočíme jej mŕtvu zónu
  s = anti + (1 - anti) * s;
  return Math.sign(deg) * s;
}

function steerValue() {
  if (rawAngle === null || center === null) return 0;
  return shapeSteer(steerDeg);
}

const knob = $("steerKnob");
function drawSteer(s) {
  knob.style.left = `${50 + Math.min(0, s) * 50}%`;
  knob.style.width = `${Math.abs(s) * 50}%`;
  knob.style.background = tooFlat ? "var(--orange)" : "";
}

// ---------- odosielanie stavu na PC ----------
let ws = null;
let lastMsg = "";
let lastSent = 0;
function send(force) {
  if (!running || !ws) return;
  const msg = { type: "pad", steer: +input.steer.toFixed(4), thr: +input.thr.toFixed(3),
    brk: +input.brk.toFixed(3), btn: [...input.btn] };
  const text = JSON.stringify(msg);
  const now = performance.now();
  // aj bez zmeny posielame aspoň 10× za sekundu – PC inak ovládač z bezpečnosti vynuluje
  if (!force && text === lastMsg && now - lastSent < 100) return;
  lastMsg = text;
  lastSent = now;
  ws.send(msg);
}

function tick() {
  if (running) {
    input.steer = steerValue();
    drawSteer(input.steer);
    send(false);
  }
  requestAnimationFrame(tick);
}
requestAnimationFrame(tick);

document.addEventListener("visibilitychange", () => {
  if (document.visibilityState !== "visible") releaseAll();
});

// ---------- palubovka ----------
const ledsEl = $("leds");
let leds = [];
function buildLeds() {
  const n = { f1: 15, gt: 30 }[cfg.style] || 0;
  ledsEl.innerHTML = "";
  leds = [];
  for (let i = 0; i < n; i++) {
    const el = document.createElement("i");
    if (cfg.style === "gt") el.style.setProperty("--c", `hsl(${Math.round(130 - (i / (n - 1)) * 130)} 90% 52%)`);
    ledsEl.appendChild(el);
    leds.push(el);
  }
}

function applyStyle() {
  for (const s of Object.keys(STYLES)) document.body.classList.toggle(`style-${s}`, s === cfg.style);
  buildLeds();
  render();
}

let frame = {};
let maxSeen = 0;
let shiftNow = false;
let blinkOn = false;
setInterval(() => {
  blinkOn = !blinkOn;
  document.body.classList.toggle("blink", shiftNow && blinkOn);
}, 90);

function render() {
  const d = frame;
  $("gear").textContent = gearText(d.gear ?? 0);
  $("speed").textContent = fmtNum(d.speed, 0, "0");
  $("rpm").textContent = fmtNum(d.rpm, 0, "0");
  $("lapTime").textContent = fmtTime(d.lap_time);
  const dl = $("delta");
  const hasDelta = d.delta !== null && d.delta !== undefined;
  dl.textContent = hasDelta ? fmtDelta(d.delta) : "";
  dl.className = `delta mono ${hasDelta && d.delta < 0 ? "neg" : hasDelta && d.delta > 0 ? "pos" : ""}`;

  const rpm = d.rpm || 0;
  if (rpm > maxSeen) maxSeen = rpm;
  const max = d.max_rpm || maxSeen || 8000;
  const shiftAt = max * 0.97;
  const start = max * (cfg.style === "gt" ? 0.55 : 0.72);
  const ratio = Math.max(0, Math.min(1, (rpm - start) / (shiftAt - start)));

  const wasShift = shiftNow;
  shiftNow = rpm >= shiftAt && rpm > 0;
  document.body.classList.toggle("shift-now", shiftNow);
  if (shiftNow && !wasShift && cfg.vibrate) haptic(40);

  if (cfg.style === "f1") {
    const n = Math.round(ratio * 15);
    leds.forEach((el, i) => { el.className = i < n ? (i < 5 ? "g" : i < 10 ? "r" : "b") : ""; });
  } else if (cfg.style === "gt") {
    const n = Math.round(ratio * leds.length);
    leds.forEach((el, i) => { el.className = i < n ? "on" : ""; });
  } else if (cfg.style === "minimal") {
    const c = ratio <= 0 ? "#fff" : ratio < 0.5 ? "#ffd60a" : ratio < 1 ? "#ff9f0a" : "#ff2d2d";
    document.body.style.setProperty("--gc", shiftNow ? "" : c);
  } else if (cfg.style === "analog") {
    drawGauge(rpm, max, d.speed || 0);
  }
}

function drawGauge(rpm, max, speed) {
  const { ctx, w, h } = setupCanvas($("gauge"));
  const top = Math.ceil(max / 1000) * 1000;
  const cx = w / 2;
  const cy = h * 0.45;
  const r = Math.min(w / 2, h * 0.47) - 8;
  const a0 = Math.PI * 0.75;
  const sweep = Math.PI * 1.5;
  const ang = (v) => a0 + (Math.min(v, top) / top) * sweep;

  ctx.lineCap = "butt";
  ctx.lineWidth = Math.max(6, r * 0.07);
  ctx.strokeStyle = "#1a1e2a";
  ctx.beginPath(); ctx.arc(cx, cy, r, a0, a0 + sweep); ctx.stroke();
  ctx.strokeStyle = "#ff2d2d";
  ctx.beginPath(); ctx.arc(cx, cy, r, ang(max * 0.9), a0 + sweep); ctx.stroke();
  ctx.strokeStyle = shiftNow ? "#ff2d2d" : "#0a84ff";
  ctx.beginPath(); ctx.arc(cx, cy, r, a0, ang(rpm)); ctx.stroke();

  ctx.fillStyle = "#8a93a8";
  ctx.font = `600 ${Math.max(10, r * 0.11)}px system-ui, sans-serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.strokeStyle = "#8a93a8";
  ctx.lineWidth = 2;
  for (let v = 0; v <= top; v += 1000) {
    const a = ang(v);
    const c = Math.cos(a);
    const s = Math.sin(a);
    ctx.beginPath(); ctx.moveTo(cx + c * (r - r * 0.13), cy + s * (r - r * 0.13));
    ctx.lineTo(cx + c * (r - r * 0.04), cy + s * (r - r * 0.04)); ctx.stroke();
    ctx.fillText(String(v / 1000), cx + c * r * 0.72, cy + s * r * 0.72);
  }

  const a = ang(rpm);
  ctx.strokeStyle = "#ff3b30";
  ctx.lineWidth = Math.max(3, r * 0.025);
  ctx.lineCap = "round";
  ctx.beginPath(); ctx.moveTo(cx - Math.cos(a) * r * 0.12, cy - Math.sin(a) * r * 0.12);
  ctx.lineTo(cx + Math.cos(a) * r * 0.9, cy + Math.sin(a) * r * 0.9); ctx.stroke();

  ctx.fillStyle = "#e8ebf2";
  ctx.font = `800 ${Math.max(16, r * 0.24)}px Consolas, monospace`;
  ctx.fillText(String(Math.round(speed)), cx, cy + r * 0.5);
  ctx.fillStyle = "#8a93a8";
  ctx.font = `500 ${Math.max(9, r * 0.08)}px system-ui, sans-serif`;
  ctx.fillText("km/h", cx, cy + r * 0.72);
}

$("dash").addEventListener("click", () => {
  const keys = Object.keys(STYLES);
  cfg.style = keys[(keys.indexOf(cfg.style) + 1) % keys.length];
  saveCfg();
  applyStyle();
  toast(STYLES[cfg.style]);
});
window.addEventListener("resize", render);

// ---------- spojenie s PC ----------
const padErr = $("padErr");
ws = connectWS((d) => {
  frame = d;
  telemetryFx(d);
  if (d.connected && d.game) useProfile(d.game);
  $("dot").className = `dot ${d.connected ? (d.paused ? "pause" : "on") : ""}`;
  $("status").textContent = d.offline ? "Odpojené od PC" : d.connected
    ? [d.game, d.car].filter(Boolean).join(" · ") : "Čakám na hru…";
  render();
}, (msg) => {
  if (msg.type === "rumble") {
    setRumble(msg.l, msg.s);
  } else if (msg.type === "say") {
    sayHere(msg);
  } else if (msg.type === "pad_status") {
    padErr.hidden = !msg.error;
    padErr.textContent = msg.error ? `⚠ ${msg.error} (ťukni pre skrytie)` : "";
  }
});
padErr.addEventListener("click", () => { padErr.hidden = true; });

// hlas inžiniera z PC: appka číta systémovým hlasom iOS (ide aj do AirPods), prehliadač cez speechSynthesis
function sayHere(m) {
  if (!cfg.say || !running || !m.text) return;
  if (NATIVE) { native({ t: "say", text: m.text, lang: m.lang, rate: m.rate, urgent: m.urgent }); return; }
  if (!("speechSynthesis" in window)) return;
  if (m.urgent) speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(m.text);
  u.lang = m.lang === "en" ? "en-US" : "sk-SK";
  const v = speechSynthesis.getVoices().find((x) => x.lang.toLowerCase().startsWith(m.lang === "en" ? "en" : "sk"))
    || speechSynthesis.getVoices().find((x) => m.lang !== "en" && x.lang.toLowerCase().startsWith("cs"));
  if (v) u.voice = v;
  u.rate = m.rate || 1;
  speechSynthesis.speak(u);
}

// ---------- vibrácie z hry (hra rozvibruje Xbox ovládač -> zavibruje mobil) ----------
// Android: mobil nevie meniť silu vibrácie, len jej dĺžku – silu prevedieme na dĺžku pulzu každých 100 ms.
// iPhone: stránka vibrovať nesmie, takže (1) skúsime haptické ťuknutia (hustejšie = silnejšie)
// a (2) ukážeme vibrácie na obrazovke – okraj zabliká a palubovka sa zatrasie.
const canVibrate = CAN_VIBRATE;
let rumbleLevel = 0;
let rumbleTick = 0;
let nativeSent = -1;
// appka: plynulá vibrácia, posielame len pri zmene sily
function nativeRumble(level, sharp = 0.3) {
  if (!NATIVE) return;
  const l = level < 0.03 ? 0 : Math.round(level * 50) / 50;
  if (l === nativeSent) return;
  nativeSent = l;
  native({ t: "rumble", l, s: sharp });
}
let gameLevel = 0, gameSharp = 0.3;          // vibrácie z hry (hra rozvibruje Xbox ovládač)
let fxLevel = 0, fxSharp = 0.3, fxAbs = false;  // vibrácie z telemetrie (čo sa deje s autom)
function setRumble(large, small) {
  // veľký motor = hrubé otrasy (obrubníky, náraz), malý = jemné (šmyk, ABS) – malý berieme slabšie
  gameLevel = cfg.rumble ? Math.max(large, small * 0.7) / 255 : 0;
  // prevaha malého motora = ostrejšia vibrácia
  gameSharp = large + small > 0 ? small / (large + small) : 0.3;
  mixRumble();
}
function mixRumble() {
  rumbleLevel = Math.min(1, Math.max(gameLevel, fxLevel) * cfg.rumbleGain / 100);
  if (rumbleLevel < 0.03 && canVibrate) navigator.vibrate(0);
  nativeRumble(running ? rumbleLevel : 0, fxLevel > gameLevel ? fxSharp : gameSharp);
  showRumbleFx(rumbleLevel);
}

// vibrácie z telemetrie: silnejší vnem vyhráva; ostrosť rozlíši obrubník (dunenie) od blokovania (bzučanie)
let lastG = null, impactAt = 0;
function telemetryFx(d) {
  let lvl = 0, sharp = 0.3;
  const add = (l, s) => { if (l > lvl) { lvl = l; sharp = s; } };
  fxAbs = false;
  if (cfg.fx && running && d.connected && !d.paused) {
    if (d.fx_kerb > 0) add(0.35 + 0.5 * d.fx_kerb, 0.15);
    if (d.fx_rough > 0) add(0.25 + 0.35 * d.fx_rough, 0);
    if (d.fx_lock > 0) add(0.45 + 0.55 * d.fx_lock, 0.9);
    if (d.fx_spin > 0) add(0.3 + 0.45 * d.fx_spin, 0.65);
    if (d.max_rpm && d.gear > 0 && d.rpm >= d.max_rpm * 0.985) add(0.22, 1);  // obmedzovač otáčok
    fxAbs = d.fx_abs > 0.3;
    // náraz: prudká zmena preťaženia medzi dvoma rámcami
    const g = [d.g_lat || 0, d.g_lon || 0];
    const now = performance.now();
    if (lastG && Math.hypot(g[0] - lastG[0], g[1] - lastG[1]) > 2.5 && now - impactAt > 600) {
      impactAt = now;
      haptic(45);
    }
    lastG = g;
  } else {
    lastG = null;
  }
  fxLevel = lvl;
  fxSharp = sharp;
  mixRumble();
}
function showRumbleFx(level) {
  const on = level >= 0.03 && cfg.rumbleFx && running;
  document.body.classList.toggle("rumbling", on);
  document.body.style.setProperty("--rumble", on ? level.toFixed(2) : "0");
}
setInterval(() => {
  if (!running || document.visibilityState !== "visible") return;
  // ABS: rýchle pulzy
  if (fxAbs) {
    if (NATIVE) native({ t: "tap", ms: 25 });
    else if (canVibrate) { navigator.vibrate(35); return; }
  }
  if (rumbleLevel < 0.03) return;
  if (canVibrate) { navigator.vibrate(Math.round(12 + 88 * rumbleLevel)); return; }
  if (NATIVE) return;  // appka vibruje plynulo sama
  // iPhone: ťuknutie každých 300 ms pri slabých vibráciách až každých 100 ms pri najsilnejších
  rumbleTick += 100;
  if (IS_IOS && rumbleTick >= 300 - 200 * rumbleLevel) { rumbleTick = 0; haptic(); }
}, 100);

// ---------- štart, celá obrazovka, nastavenia ----------
const fs = setupFullscreen($("fs"));

$("go").addEventListener("click", async () => {
  if (NATIVE) {
    // appka: náklon posiela sama, obrazovku zamkne na šírku a drží ju zapnutú
    native({ t: "start" });
  } else {
    // Safari / Chrome pustí reč až po ťuknutí – "odomkneme" ju tichou vetou
    if ("speechSynthesis" in window) {
      const u = new SpeechSynthesisUtterance(" ");
      u.volume = 0;
      speechSynthesis.speak(u);
    }
    await startBrowserSensors();
  }
  center = null;
  running = true;
  document.body.classList.add("running");
  $("start").hidden = true;
  setTimeout(() => {
    if (rawAngle === null) toast("Mobil neposiela dáta z gyroskopu – zatáčanie nebude fungovať");
  }, 2000);
});

async function startBrowserSensors() {
  // iOS: povolenie senzorov sa musí vyžiadať priamo z kliknutia (obe naraz, pred prvým await)
  const asks = [window.DeviceOrientationEvent, window.DeviceMotionEvent]
    .filter((E) => E && typeof E.requestPermission === "function")
    .map((E) => E.requestPermission().catch(() => "denied"));
  if (asks.length && !(await Promise.all(asks)).includes("granted")) {
    toast("Bez povolenia pohybu nebude zatáčanie fungovať");
  }
  window.addEventListener("deviceorientation", onOrientation);
  window.addEventListener("devicemotion", onMotion);
  // nečakáme – niektoré prehliadače na celú obrazovku nikdy neodpovedia
  fs.enter().then(() => screen.orientation?.lock?.("landscape")).catch(() => { /* nie všade sa dá */ });
}

$("calib").addEventListener("click", () => { calibrate(); toast("Stred volantu nastavený"); });

// ---------- nastavenia ----------
// tipy, ako v hre vypnúť jej vlastné úpravy zatáčania (inak sa sčítajú s našimi)
const GAME_TIPS = [
  [/^F1/, "V hre: Nastavenia → Ovládanie → Kalibrácia – mŕtvu zónu, linearitu a saturáciu riadenia daj na 0."],
  [/^Forza/, "V hre: Rozšírené ovládanie – mŕtva zóna osi riadenia vnútorná 0, vonkajšia 100. Riadenie: Simulácia."],
  [/Competizione/, "V hre: Ovládanie → Gamepad – mŕtvu zónu a filter riadenia na 0, gamma 1.0, citlivosť podľa rýchlosti čo najnižšie."],
  [/^Assetto/, "V hre: Ovládanie → Xbox ovládač – Steering deadzone 0, filter 0, gamma 1, speed sensitivity 0, rýchlosť riadenia na max."],
  [/RaceRoom/, "V hre: Ovládanie – mŕtvu zónu riadenia daj na 0 a citlivosť podľa rýchlosti vypni."],
];
const GENERIC_TIP = "V hre vypni mŕtvu zónu, filter a citlivosť riadenia podľa rýchlosti – inak sa sčítajú s týmto nastavením.";

const steerFields = { sRange: "range", sDead: "dead", sAnti: "anti", sLin: "lin", sSmooth: "smooth" };
const globalFields = { sStyle: "style", sCurve: "curve", sRumbleGain: "rumbleGain" };

function showValues() {
  $("vRange").textContent = sp.range;
  $("vDead").textContent = sp.dead;
  $("vAnti").textContent = sp.anti;
  $("vLin").textContent = Number(sp.lin).toFixed(1);
  $("vSmooth").textContent = sp.smooth;
  $("vCurve").textContent = Number(cfg.curve).toFixed(1);
  $("vRumbleGain").textContent = cfg.rumbleGain;
}

function fillSettings() {
  $("profName").textContent = profileName;
  const tip = GAME_TIPS.find(([re]) => re.test(profileName));
  $("gameTip").textContent = tip ? tip[1] : GENERIC_TIP;
  for (const [id, key] of Object.entries(steerFields)) $(id).value = sp[key];
  for (const [id, key] of Object.entries(globalFields)) $(id).value = cfg[key];
  $("sInvert").checked = sp.invert;
  $("sVibrate").checked = cfg.vibrate;
  $("sRumble").checked = cfg.rumble;
  $("sRumbleFx").checked = cfg.rumbleFx;
  $("sFx").checked = cfg.fx;
  $("sSay").checked = cfg.say;
  $("noRumble").hidden = canVibrate || !!NATIVE;
  showValues();
  drawCurve();
}

// graf: náklon mobilu (vodorovne) -> výchylka páčky (zvisle), bodka = aktuálny stav
function drawCurve() {
  const { ctx, w, h } = setupCanvas($("curve"));
  const pad = 6;
  const half = sp.range / 2;
  const X = (deg) => w / 2 + (deg / half) * (w / 2 - pad);
  const Y = (v) => h / 2 - v * (h / 2 - pad);
  ctx.strokeStyle = "#262c3d";
  ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(0, h / 2); ctx.lineTo(w, h / 2); ctx.moveTo(w / 2, 0); ctx.lineTo(w / 2, h); ctx.stroke();
  ctx.strokeStyle = "#0a84ff";
  ctx.lineWidth = 2;
  ctx.beginPath();
  for (let i = 0; i <= 120; i++) {
    const deg = -half + (i / 120) * 2 * half;
    const v = shapeSteer(deg);
    i ? ctx.lineTo(X(deg), Y(v)) : ctx.moveTo(X(deg), Y(v));
  }
  ctx.stroke();
  const deg = Math.max(-half, Math.min(half, steerDeg));
  ctx.fillStyle = tooFlat ? "#ff9f0a" : "#ffd60a";
  ctx.beginPath(); ctx.arc(X(deg), Y(shapeSteer(steerDeg)), 5, 0, Math.PI * 2); ctx.fill();
  $("liveVal").textContent = rawAngle === null ? "Senzor zatiaľ neposlal dáta (ťukni Štart)."
    : `Náklon ${steerDeg.toFixed(1)}° → výstup ${Math.round(shapeSteer(steerDeg) * 100)} % · senzor: ${sensor}`;
}
setInterval(() => { if ($("setModal").classList.contains("open")) drawCurve(); }, 50);

$("setBtn").addEventListener("click", () => {
  fillSettings();
  $("setModal").classList.add("open");
});
for (const [id, key] of Object.entries(steerFields)) {
  $(id).addEventListener("input", (e) => { sp[key] = Number(e.target.value); saveCfg(); showValues(); drawCurve(); });
}
for (const [id, key] of Object.entries(globalFields)) {
  $(id).addEventListener("input", (e) => {
    cfg[key] = key === "style" ? e.target.value : Number(e.target.value);
    saveCfg();
    showValues();
    if (key === "style") applyStyle();
  });
}
$("sInvert").addEventListener("change", (e) => { sp.invert = e.target.checked; steerFilter.reset(); saveCfg(); });
$("sVibrate").addEventListener("change", (e) => { cfg.vibrate = e.target.checked; saveCfg(); });
$("sRumble").addEventListener("change", (e) => {
  cfg.rumble = e.target.checked;
  saveCfg();
  if (!cfg.rumble) setRumble(0, 0);
});
$("sFx").addEventListener("change", (e) => { cfg.fx = e.target.checked; saveCfg(); if (!cfg.fx) telemetryFx({}); });
$("sSay").addEventListener("change", (e) => { cfg.say = e.target.checked; saveCfg(); });
$("sRumbleFx").addEventListener("change", (e) => {
  cfg.rumbleFx = e.target.checked;
  saveCfg();
  showRumbleFx(rumbleLevel);
});
$("testRumble").addEventListener("click", () => {
  // test priamo z ťuknutia – ukáže, či tento mobil vibrácie/ťuknutia vôbec zvláda
  if (canVibrate) { navigator.vibrate([80, 60, 80, 60, 160]); return; }
  if (NATIVE) { native({ t: "test" }); return; }
  haptic();
  [150, 300, 450].forEach((t) => setTimeout(haptic, t));
  showRumbleFx(1); document.body.classList.add("rumbling");
  setTimeout(() => showRumbleFx(rumbleLevel), 700);
});
$("resetProf").addEventListener("click", () => {
  sp = { ...STEER_DEFAULTS };
  saveCfg();
  fillSettings();
  toast(`Profil ${profileName}: predvolené hodnoty`);
});
document.querySelectorAll("[data-close]").forEach((b) => b.addEventListener("click", () => b.closest(".modal-bg").classList.remove("open")));
$("setModal").addEventListener("click", (e) => { if (e.target === e.currentTarget) e.currentTarget.classList.remove("open"); });

// gyroskop v prehliadači funguje len cez HTTPS – ponúkneme zabezpečenú adresu
if (!window.isSecureContext && !NATIVE) {
  getJSON("/api/info").then((info) => {
    const port = info.wheel_urls?.[0] ? new URL(info.wheel_urls[0]).port : null;
    $("startBody").innerHTML = port
      ? `<p>Mobil povolí gyroskop len cez zabezpečené spojenie. Otvor túto adresu:</p>
         <p><a class="mono" href="https://${location.hostname}:${port}/wheel">https://${location.hostname}:${port}/wheel</a></p>
         <p class="muted small">Prehliadač ukáže varovanie o certifikáte (je to tvoj vlastný PC) –
         daj <b>Rozšírené → Pokračovať</b> (iPhone: <b>Zobraziť podrobnosti → navštíviť webovú stránku</b>).</p>`
      : `<p>HTTPS nie je na PC zapnuté – chýba balík cryptography. Reštartuj start.bat.</p>`;
  }).catch(() => {});
}

applyStyle();

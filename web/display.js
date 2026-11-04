// Vlastný displej: prvky telemetrie poskladané na mriežke + editor rozloženia.
// Rozloženia sú uložené na PC s aplikáciou (/api/displays), takže displej upravený na jednom
// zariadení sa otvorí na hocktorom inom.
const $ = (id) => document.getElementById(id);
const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
const WHEELS = ["LP", "PP", "LZ", "PZ"];
const COLORS = { "": "Predvolená", white: "Biela", red: "Červená", orange: "Oranžová", yellow: "Žltá",
  green: "Zelená", blue: "Modrá", purple: "Fialová" };
const CSS_COLOR = { white: "#fff", red: "var(--red)", orange: "var(--orange)", yellow: "var(--yellow)",
  green: "var(--green)", blue: "var(--blue)", purple: "var(--purple)" };
const FLAG_COLORS = { green: "#16a34a", yellow: "#eab308", blue: "#2563eb", black: "#000", white: "#eee",
  checkered: "#888", penalty: "#dc2626", orange: "#f97316" };
const FLAG_NAMES = { green: "Zelená", yellow: "Žltá", blue: "Modrá", black: "Čierna", white: "Biela",
  checkered: "Cieľ", penalty: "Penalta", orange: "Oranžová" };

// ---------- katalóg hodnôt z telemetrie ----------
const FIELDS = {
  speed: { g: "Jazda", label: "Rýchlosť", unit: "km/h", d: 0 },
  rpm: { g: "Jazda", label: "Otáčky", unit: "ot/min", d: 0 },
  gear: { g: "Jazda", label: "Prevod", fmt: gearText },
  throttle: { g: "Jazda", label: "Plyn", unit: "%", scale: 100, d: 0 },
  brake: { g: "Jazda", label: "Brzda", unit: "%", scale: 100, d: 0 },
  clutch: { g: "Jazda", label: "Spojka", unit: "%", scale: 100, d: 0 },
  steer: { g: "Jazda", label: "Natočenie volantu", unit: "%", scale: 100, d: 0 },
  g_lat: { g: "Jazda", label: "Bočné G", unit: "G", d: 2, abs: true },
  g_lon: { g: "Jazda", label: "Pozdĺžne G", unit: "G", d: 2, abs: true },
  lap_time: { g: "Časy", label: "Aktuálne kolo", fmt: fmtTime },
  last_lap: { g: "Časy", label: "Posledné kolo", fmt: fmtTime },
  best_lap: { g: "Časy", label: "Najlepšie (hra)", fmt: fmtTime },
  ref_time: { g: "Časy", label: "Najlepšie uložené", fmt: fmtTime },
  session_best: { g: "Časy", label: "Najlepšie v relácii", fmt: fmtTime },
  delta: { g: "Časy", label: "Delta", fmt: fmtDelta },
  lap_no: { g: "Časy", label: "Kolo", get: (d) => (d.lap === undefined ? null : d.total_laps ? `${d.lap + 1}/${d.total_laps}` : d.lap + 1) },
  position: { g: "Časy", label: "Pozícia", get: (d) => d.position || null, d: 0 },
  lap_dist: { g: "Časy", label: "Vzdialenosť v kole", unit: "m", d: 0, get: (d) => (d.lap_dist >= 0 ? d.lap_dist : null) },
  gap_ahead: { g: "Súperi", label: "Odstup pred tebou", unit: "s", d: 2 },
  gap_behind: { g: "Súperi", label: "Odstup za tebou", unit: "s", d: 2 },
  corner_speed: { g: "Zákruty", label: "Rýchlosť ďalšej zákruty", unit: "km/h", d: 0, get: (d) => d.corner?.speed ?? null },
  corner_n: { g: "Zákruty", label: "Ďalšia zákruta", d: 0, get: (d) => d.corner?.n ?? null },
  corner_dist: { g: "Zákruty", label: "Do brzdenia", unit: "m", d: 0, get: (d) => d.corner?.dist ?? null },
  fuel: { g: "Palivo", label: "Palivo", unit: (d) => (d.source === "forza" ? "%" : "l"), d: 1 },
  fuel_laps_left: { g: "Palivo", label: "Palivo na kôl", d: 1 },
  fuel_per_lap: { g: "Palivo", label: "Spotreba na kolo", d: 2 },
  tc: { g: "Auto", label: "TC" },
  tc2: { g: "Auto", label: "TC2" },
  abs: { g: "Auto", label: "ABS" },
  engine_map: { g: "Auto", label: "Mapa motora", d: 0 },
  brake_bias: { g: "Auto", label: "Brzdový balans", unit: "%", d: 1 },
  pit_limiter: { g: "Auto", label: "Pit limiter", bool: true },
  drs: { g: "Auto", label: "DRS", bool: true },
  in_pit: { g: "Auto", label: "V boxoch", bool: true },
  water_temp: { g: "Teploty", label: "Voda", unit: "°C", d: 0 },
  air_temp: { g: "Teploty", label: "Vzduch", unit: "°C", d: 0 },
  track_temp: { g: "Teploty", label: "Trať", unit: "°C", d: 0 },
  game: { g: "Info", label: "Hra", text: true },
  track: { g: "Info", label: "Trať", text: true },
  car: { g: "Info", label: "Auto", text: true },
  tyre_compound: { g: "Info", label: "Zmes pneumatík", text: true },
};
WHEELS.forEach((w, i) => {
  FIELDS[`tyre_temp.${i}`] = { g: "Pneumatiky", label: `Teplota ${w}`, unit: "°C", d: 0 };
  FIELDS[`tyre_pressure.${i}`] = { g: "Pneumatiky", label: `Tlak ${w}`, unit: "psi", d: 1 };
  FIELDS[`tyre_wear.${i}`] = { g: "Pneumatiky", label: `Opotrebenie ${w}`, unit: "%", d: 0 };
  FIELDS[`brake_temp.${i}`] = { g: "Pneumatiky", label: `Brzda ${w}`, unit: "°C", d: 0 };
});

function fieldValue(key, d) {
  const f = FIELDS[key];
  if (!f) return undefined;
  if (f.get) return f.get(d);
  if (key.includes(".")) {
    const [k, i] = key.split(".");
    return d[k] ? d[k][+i] : undefined;
  }
  return d[key];
}

function fieldText(key, d, o) {
  const f = FIELDS[key];
  if (!f) return "?";
  const v = fieldValue(key, d);
  if (v === null || v === undefined || v === "" || !d.connected) return "–";
  if (f.fmt) return f.fmt(v);
  if (f.bool) return v ? "ZAP" : "VYP";
  if (f.text || typeof v === "string") return String(v);
  let n = Number(v) * (f.scale || 1);
  if (f.abs) n = Math.abs(n);
  let digits = o.d !== undefined && o.d !== "" ? +o.d : f.d;
  if (digits === undefined) digits = Number.isInteger(n) ? 0 : 1;
  return n.toFixed(digits);
}

// ---------- spoločný stav (otáčky, blikanie, mapa) ----------
const S = { ratio: 0, shift: false, blink: false, maxSeen: 0, mapPoints: [], mapVersion: null, trail: [], frames: 0, gTrail: [] };
setInterval(() => { S.blink = !S.blink; }, 90);

function computeShared(d) {
  if (!d.connected) { S.ratio = 0; S.shift = false; S.standings = null; return; }
  if (d.standings !== undefined) S.standings = d.standings;  // server ju posiela len 2× za sekundu
  if (d.rpm > S.maxSeen) S.maxSeen = d.rpm;
  const max = d.max_rpm || S.maxSeen || 8000;
  const start = max * 0.72;
  const at = max * 0.97;
  S.ratio = Math.max(0, Math.min(1, (d.rpm - start) / (at - start)));
  S.shift = d.rpm >= at && d.rpm > 0;
  S.rpmFrac = Math.min(1, d.rpm / max);
  if (d.map_version !== S.mapVersion) {
    S.mapVersion = d.map_version;
    S.trail = [];
    getJSON("/api/map").then((m) => { S.mapPoints = m.points || []; }).catch(() => {});
  }
  if (++S.frames % 3 === 0 && (d.pos_x || d.pos_z)) {
    S.trail.push([d.pos_x, d.pos_z]);
    if (S.trail.length > 3000) S.trail.shift();
  }
}

// nastaví text a dĺžku (CSS podľa nej zmenší písmo, aby sa zmestil)
function setText(el, text) {
  if (el._t === text) return;
  el._t = text;
  el.textContent = text;
  el.style.setProperty("--n", Math.max(2, String(text).length));
}

// ---------- typy prvkov ----------
// make(in, o) vytvorí obsah a vráti funkciu update(d) volanú pri každom snímku telemetrie
let bb = null;  // konfigurácia button boxu (pre prvok Tlačidlo)
let ws = null;

const TYPES = {
  gear: {
    name: "Prevod", desc: "Veľké číslo prevodu, farba podľa otáčok", size: [6, 6],
    props: [{ k: "shiftColor", label: "Farba podľa otáčok", type: "check", def: true }, { k: "color", label: "Farba", type: "color" }],
    make(el, o) {
      el.innerHTML = '<div class="gear">N</div>';
      const g = el.firstChild;
      return (d) => {
        setText(g, d.connected ? gearText(d.gear) : "–");
        let c = CSS_COLOR[o.color] || "";
        if (o.shiftColor !== false && d.connected) {
          if (S.shift) c = S.blink ? "#3b82ff" : "#ff2d2d";
          else if (S.ratio > 0.66) c = "#ff9f0a";
          else if (S.ratio > 0.33) c = "#ffd60a";
        }
        g.style.color = c;
      };
    },
  },
  value: {
    name: "Hodnota", desc: "Ľubovoľný údaj: rýchlosť, časy, TC, ABS, teploty, palivo…", size: [5, 3],
    props: [
      { k: "f", label: "Údaj", type: "field", def: "speed" },
      { k: "label", label: "Popis (prázdne = predvolený)", type: "text" },
      { k: "d", label: "Desatinné miesta", type: "select", options: { "": "Automaticky", 0: "0", 1: "1", 2: "2", 3: "3" } },
      { k: "unit", label: "Zobraziť jednotku", type: "check", def: false },
      { k: "nolabel", label: "Skryť popis", type: "check", def: false },
      { k: "color", label: "Farba hodnoty", type: "color" },
    ],
    make(el, o) {
      const f = FIELDS[o.f] || FIELDS.speed;
      const key = FIELDS[o.f] ? o.f : "speed";
      el.innerHTML = `${o.nolabel ? "" : `<div class="lbl">${esc(o.label || f.label)}</div>`}<div class="val">–</div>`;
      el.parentNode.classList.toggle("nolabel", !!o.nolabel);
      const v = el.querySelector(".val");
      v.style.color = CSS_COLOR[o.color] || "";
      return (d) => {
        const text = fieldText(key, d, o);
        const unit = o.unit && f.unit ? (typeof f.unit === "function" ? f.unit(d) : f.unit) : "";
        if (v._t !== text + unit) {
          v._t = text + unit;
          v.innerHTML = `${esc(text)}${unit && text !== "–" ? `<span class="unit">${esc(unit)}</span>` : ""}`;
          v.style.setProperty("--n", Math.max(2, text.length + (unit ? unit.length * 0.35 : 0)));
        }
        el.classList.toggle("on", !!f.bool && fieldValue(key, d) === true);
      };
    },
  },
  shift: {
    name: "Shift svetlá", desc: "Rad LED svetiel podľa otáčok", size: [12, 2],
    props: [
      { k: "n", label: "Počet svetiel", type: "select", options: { 10: "10", 15: "15", 20: "20" }, def: "15" },
      { k: "style", label: "Štýl", type: "select", options: { f1: "F1 (zelená/červená/modrá)", gt: "GT (súvislý pruh)" }, def: "f1" },
    ],
    make(el, o) {
      const n = +(o.n || 15);
      const gt = o.style === "gt";
      el.innerHTML = `<div class="leds ${gt ? "gt" : ""}" style="grid-template-columns:repeat(${n},1fr)">${"<i></i>".repeat(n)}</div>`;
      const box = el.firstChild;
      const leds = [...box.children];
      if (gt) leds.forEach((l, i) => l.style.setProperty("--c", `hsl(${Math.round(130 - (i / (n - 1)) * 130)} 90% 52%)`));
      return () => {
        const on = Math.round(S.ratio * n);
        const third = n / 3;
        leds.forEach((l, i) => { l.className = i < on ? (gt ? "on" : i < third ? "g" : i < 2 * third ? "r" : "b") : ""; });
        box.classList.toggle("flash", S.shift && !gt);
        box.classList.toggle("blink", S.shift && S.blink);
      };
    },
  },
  rpmbar: {
    name: "Pruh otáčok", desc: "Vodorovný pruh otáčok s červenou zónou", size: [12, 1],
    props: [{ k: "text", label: "Zobraziť číslo otáčok", type: "check", def: true }],
    make(el, o) {
      el.innerHTML = `<div class="rpmbar"><div class="red"></div><div class="f"></div>${o.text !== false ? "<span>0</span>" : ""}</div>`;
      const f = el.querySelector(".f");
      const t = el.querySelector("span");
      return (d) => {
        f.style.width = `${(d.connected ? S.rpmFrac || 0 : 0) * 100}%`;
        if (t) setText(t, d.connected ? Math.round(d.rpm) : "–");
      };
    },
  },
  delta: {
    name: "Delta", desc: "Rozdiel voči najlepšiemu kolu, farebne", size: [6, 3],
    props: [
      { k: "label", label: "Popis", type: "text", def: "Delta" },
      { k: "range", label: "Rozsah pruhu", type: "select", options: { 0: "Bez pruhu", 0.5: "± 0,5 s", 1: "± 1 s", 2: "± 2 s" }, def: "1" },
    ],
    make(el, o) {
      const range = +(o.range ?? 1);
      el.innerHTML = `${o.label === "" ? "" : `<div class="lbl">${esc(o.label ?? "Delta")}</div>`}<div class="val">–</div>`
        + (range ? '<div class="dbar"><div class="c"></div><div class="f"></div></div>' : "");
      const v = el.querySelector(".val");
      const bar = el.querySelector(".dbar .f");
      return (d) => {
        const has = d.connected && d.delta !== null && d.delta !== undefined;
        setText(v, has ? fmtDelta(d.delta) : "–");
        v.className = `val ${has ? (d.delta < 0 ? "faster" : d.delta > 0 ? "slower" : "") : "none"}`;
        if (bar) {
          const k = has ? Math.max(-1, Math.min(1, d.delta / range)) : 0;
          bar.style.left = `${50 + Math.min(0, k) * 50}%`;
          bar.style.width = `${Math.abs(k) * 50}%`;
          bar.style.background = k < 0 ? "var(--green)" : "var(--red)";
        }
      };
    },
  },
  pedals: {
    name: "Pedále", desc: "Plyn, brzda a spojka ako stĺpce", size: [4, 5],
    props: [{ k: "clutch", label: "Zobraziť spojku", type: "check", def: true }],
    make(el, o) {
      const list = [["clutch", "S", "var(--blue)"], ["brake", "B", "var(--brake)"], ["throttle", "P", "var(--throttle)"]]
        .filter(([k]) => k !== "clutch" || o.clutch !== false);
      el.innerHTML = `<div class="pedals">${list.map(([k, n, c]) =>
        `<div class="p"><div class="bar"><div data-k="${k}" style="background:${c}"></div></div><small>${n}</small></div>`).join("")}</div>`;
      const bars = [...el.querySelectorAll("[data-k]")];
      return (d) => { bars.forEach((b) => { b.style.height = `${(d.connected ? d[b.dataset.k] || 0 : 0) * 100}%`; }); };
    },
  },
  tyres: {
    name: "Pneumatiky", desc: "Teplota (farebne), tlak, opotrebenie a brzdy", size: [8, 7],
    props: [
      { k: "pressure", label: "Tlak", type: "check", def: true },
      { k: "wear", label: "Opotrebenie", type: "check", def: true },
      { k: "brakes", label: "Teplota bŕzd (bodka)", type: "check", def: true },
    ],
    make(el, o) {
      el.innerHTML = `<div class="tyres"><div class="cmp"></div>${WHEELS.map(() =>
        '<div class="tyre"><i class="bk"></i><b>–</b><span class="p"></span><span class="w"></span></div>').join("")}</div>`;
      const cmp = el.querySelector(".cmp");
      const ts = [...el.querySelectorAll(".tyre")].map((t) => ({ t, b: t.querySelector("b"), p: t.querySelector(".p"),
        w: t.querySelector(".w"), bk: t.querySelector(".bk") }));
      ts.forEach((x) => { x.bk.hidden = o.brakes === false; });
      return (d) => {
        setText(cmp, d.connected ? d.tyre_compound || "" : "");
        ts.forEach((x, i) => {
          const temp = d.connected && d.tyre_temp ? d.tyre_temp[i] : null;
          x.t.style.background = tyreColor(temp);
          setText(x.b, fmtNum(temp));
          setText(x.p, o.pressure === false ? "" : `${fmtNum(d.tyre_pressure?.[i], 1)} psi`);
          setText(x.w, o.wear === false ? "" : `${fmtNum(d.tyre_wear?.[i])} %`);
          x.bk.style.background = brakeColor(d.connected ? d.brake_temp?.[i] : null);
        });
      };
    },
  },
  map: {
    name: "Mapa trate", desc: "Trať s polohou auta (nakreslí sa po prvom kole)", size: [8, 6], props: [],
    make(el) {
      el.innerHTML = '<canvas class="full"></canvas>';
      const cv = el.firstChild;
      return (d) => {
        const { ctx, w, h } = setupCanvas(cv);
        ctx.clearRect(0, 0, w, h);
        const project = drawTrack(ctx, w, h, S.mapPoints.length > 20 ? S.mapPoints : S.trail);
        if (project && d.connected) {
          const [px, py] = project(d.pos_x, d.pos_z);
          ctx.fillStyle = "#ff3b30"; ctx.beginPath(); ctx.arc(px, py, 6, 0, Math.PI * 2); ctx.fill();
          ctx.strokeStyle = "#fff"; ctx.lineWidth = 2; ctx.stroke();
        } else if (!project) {
          ctx.fillStyle = "#8a93a8"; ctx.textAlign = "center"; ctx.font = "12px sans-serif";
          ctx.fillText("Mapa sa nakreslí po prvom kole", w / 2, h / 2);
        }
      };
    },
  },
  gforce: {
    name: "G-sily", desc: "Kruh bočného a pozdĺžneho preťaženia", size: [5, 5], props: [],
    make(el) {
      el.innerHTML = '<canvas class="full"></canvas>';
      const cv = el.firstChild;
      return (d) => {
        const { ctx, w, h } = setupCanvas(cv);
        ctx.clearRect(0, 0, w, h);
        const cx = w / 2, cy = h / 2, r = Math.min(w, h) / 2 - 8, maxG = 3;
        ctx.strokeStyle = "#262c3d";
        for (let g = 1; g <= maxG; g++) { ctx.beginPath(); ctx.arc(cx, cy, (r * g) / maxG, 0, Math.PI * 2); ctx.stroke(); }
        ctx.beginPath(); ctx.moveTo(cx - r, cy); ctx.lineTo(cx + r, cy); ctx.moveTo(cx, cy - r); ctx.lineTo(cx, cy + r); ctx.stroke();
        const lat = d.connected ? d.g_lat || 0 : 0, lon = d.connected ? d.g_lon || 0 : 0;
        S.gTrail.push([lat, lon]); if (S.gTrail.length > 60) S.gTrail.shift();
        S.gTrail.forEach(([a, b], i) => {
          ctx.fillStyle = `rgba(10,132,255,${(i / S.gTrail.length) * 0.6})`;
          ctx.beginPath(); ctx.arc(cx + (a / maxG) * r, cy - (b / maxG) * r, 3, 0, Math.PI * 2); ctx.fill();
        });
        ctx.fillStyle = "#fff"; ctx.beginPath(); ctx.arc(cx + (lat / maxG) * r, cy - (lon / maxG) * r, 6, 0, Math.PI * 2); ctx.fill();
      };
    },
  },
  flag: {
    name: "Vlajka", desc: "Farebné pole s aktuálnou vlajkou", size: [5, 2],
    props: [{ k: "hide", label: "Bez vlajky nič nezobrazovať", type: "check", def: true }],
    make(el, o) {
      el.innerHTML = '<div class="flagbox"></div>';
      const box = el.firstChild;
      return (d) => {
        const f = d.connected ? d.flag : "";
        box.style.background = f ? FLAG_COLORS[f] || "#444" : "";
        box.style.color = f === "white" || f === "yellow" ? "#000" : "#fff";
        setText(box, f ? FLAG_NAMES[f] || f : o.hide === false ? "Bez vlajky" : "");
      };
    },
  },
  standings: {
    name: "Súperi", desc: "Poradie a odstupy (F1 celé poradie; ACC a RaceRoom auto pred a za tebou)", size: [8, 8],
    props: [
      { k: "rows", label: "Počet riadkov", type: "select", options: { 3: "3", 5: "5", 7: "7", 10: "10", 22: "Všetci" }, def: "7" },
      { k: "mode", label: "Zobraziť", type: "select", options: { around: "Okolo mňa", top: "Od lídra" }, def: "around" },
      { k: "gap", label: "Odstup", type: "select", options: { ahead: "K autu pred ním", leader: "Od lídra" }, def: "ahead" },
    ],
    make(el, o) {
      el.innerHTML = '<div class="stand"></div>';
      const box = el.firstChild;
      const rows = +(o.rows || 7);
      box.style.setProperty("--rows", Math.min(rows, 22));
      const sec = (v) => (v ? v.toFixed(v < 10 ? 3 : 1) : "");
      return (d) => {
        let html;
        const list = d.connected ? S.standings : null;
        if (list && list.length) {
          let from = 0;
          const me = list.findIndex((r) => r.me);
          if (o.mode !== "top" && me >= 0) from = Math.max(0, Math.min(list.length - rows, me - Math.floor(rows / 2)));
          box.style.setProperty("--rows", Math.min(rows, list.length));
          html = list.slice(from, from + rows).map((r) => {
            const g = o.gap === "leader" ? r.leader : r.ahead;
            return `<div class="sr ${r.me ? "me" : ""} ${r.out ? "out" : ""}"><b>${r.pos}</b><span>${esc(r.name)}</span>`
              + `<i>${r.pit ? "BOX" : r.pos === 1 ? "" : `+${sec(g)}`}</i></div>`;
          }).join("");
        } else if (d.connected && (d.gap_ahead || d.gap_behind)) {
          // ACC / RaceRoom: len auto pred a za tebou
          html = `<div class="sr"><b>▲</b><span>Pred tebou</span><i>${d.gap_ahead ? `−${sec(d.gap_ahead)}` : "–"}</i></div>`
            + `<div class="sr me"><b>${d.position || ""}</b><span>Ty</span><i></i></div>`
            + `<div class="sr"><b>▼</b><span>Za tebou</span><i>${d.gap_behind ? `+${sec(d.gap_behind)}` : "–"}</i></div>`;
          box.style.setProperty("--rows", 3);
        } else {
          html = `<div class="missing">${d.connected ? "Táto hra neposiela údaje o súperoch" : "–"}</div>`;
        }
        if (box._h !== html) { box._h = html; box.innerHTML = html; }
      };
    },
  },
  text: {
    name: "Text", desc: "Vlastný nápis (nadpis, poznámka)", size: [6, 2],
    props: [{ k: "text", label: "Text", type: "text", def: "Text" }, { k: "color", label: "Farba", type: "color" }],
    make(el, o) {
      el.innerHTML = '<div class="txt"></div>';
      setText(el.firstChild, o.text ?? "Text");
      el.firstChild.style.color = CSS_COLOR[o.color] || "";
      return () => {};
    },
  },
  button: {
    name: "Tlačidlo", desc: "Tlačidlo z button boxu (pošle klávesu do hry)", size: [4, 3],
    props: [{ k: "btn", label: "Tlačidlo z button boxu", type: "button" }],
    make(el, o) {
      const [pid, bid] = String(o.btn || "").split("/");
      const b = bb && bb.profiles[pid] && bb.profiles[pid].buttons.find((x) => x.id === bid);
      if (!b) {
        el.innerHTML = '<div class="missing">Vyber tlačidlo z button boxu v úprave displeja</div>';
        return () => {};
      }
      el.innerHTML = `<button class="key ${b.color ? `c-${b.color}` : ""}"><span>${esc(b.label)}</span>${b.value ? '<span class="kv">–</span>' : ""}</button>`;
      const key = el.firstChild;
      key.style.setProperty("--n", Math.max(4, b.label.length));
      const kv = key.querySelector(".kv");
      bindPress(key, pid, b);
      return (d) => {
        if (kv) setText(kv, d.connected ? fieldText(b.value in FIELDS ? b.value : "tc", { ...d, connected: true }, {}) : "–");
        key.classList.toggle("on", !!d.connected && d[b.value] === true);
      };
    },
  },
};

function bindPress(el, profileId, b) {
  let pressed = false;
  const down = (e) => {
    if (document.body.classList.contains("editing")) return;
    e.preventDefault();
    if (pressed) return;
    pressed = true;
    try { el.setPointerCapture(e.pointerId); } catch { /* zachytenie je len pohodlie – stlačenie musí prejsť */ }
    el.classList.add("down");
    navigator.vibrate?.(15);
    ws.send({ type: "press", profile: profileId, id: b.id, action: b.mode === "hold" ? "down" : "tap" });
  };
  const up = (e) => {
    if (!pressed) return;
    e.preventDefault();
    pressed = false;
    el.classList.remove("down");
    if (b.mode === "hold") ws.send({ type: "press", profile: profileId, id: b.id, action: "up" });
  };
  el.addEventListener("pointerdown", down);
  el.addEventListener("pointerup", up);
  el.addEventListener("pointercancel", up);
  el.addEventListener("contextmenu", (e) => e.preventDefault());
}

// ---------- vykreslenie rozloženia ----------
let all = {};          // id -> rozloženie
let currentId = null;
let layout = null;     // práve zobrazené (v editore pracovná kópia)
let editing = false;
let dirty = false;
let selected = null;
let updaters = [];
let last = { connected: false };
const board = $("board");

function render() {
  board.innerHTML = "";
  updaters = [];
  if (!layout) {
    board.innerHTML = '<div class="empty-board">Žiadny displej. Klikni na ✎ Upraviť a vytvor nový.</div>';
    return;
  }
  board.style.gridTemplateColumns = `repeat(${layout.cols}, minmax(0, 1fr))`;
  board.style.gridTemplateRows = `repeat(${layout.rows}, minmax(0, 1fr))`;
  if (!layout.widgets.length) {
    board.innerHTML = `<div class="empty-board">${editing ? "Prázdny displej – pridaj prvky tlačidlom „+ Pridať prvok“."
      : "Prázdny displej – klikni na ✎ Upraviť."}</div>`;
  }
  for (const w of layout.widgets) {
    const type = TYPES[w.type];
    if (!type) continue;
    const el = document.createElement("div");
    el.className = `wd ${w.o.bg === false ? "" : "bg"} ${selected === w.id ? "sel" : ""}`;
    el.dataset.id = w.id;
    el.style.gridColumn = `${w.x + 1} / span ${w.w}`;
    el.style.gridRow = `${w.y + 1} / span ${w.h}`;
    el.innerHTML = '<div class="in"></div>';
    board.appendChild(el);
    try {
      updaters.push(type.make(el.firstChild, w.o));
    } catch (e) {
      el.firstChild.innerHTML = `<div class="missing">Chyba prvku: ${esc(e.message)}</div>`;
    }
    if (editing) {
      el.insertAdjacentHTML("beforeend", `<span class="tag">${esc(type.name)}</span><i class="rs"></i>`);
      bindEditing(el, w);
    }
  }
  updateAll();
  if (editing) sizeGridOverlay();
}

function updateAll() {
  for (const u of updaters) {
    try { u(last); } catch { /* jeden pokazený prvok nesmie zastaviť ostatné */ }
  }
}

function onFrame(d) {
  last = d;
  computeShared(d);
  $("dot").className = d.connected ? (d.paused ? "dot pause" : "dot on") : "dot";
  updateAll();
}

// ---------- načítanie a výber displeja ----------
async function loadAll(keepId) {
  const [data, bbCfg] = await Promise.all([getJSON("/api/displays"), getJSON("/api/buttonbox").catch(() => null)]);
  all = data.layouts || {};
  bb = bbCfg;
  const want = keepId || new URLSearchParams(location.search).get("l") || lsGet("display-layout");
  currentId = all[want] ? want : Object.keys(all)[0] || null;
  fillSelect();
  if (!editing) {
    layout = currentId ? structuredClone(all[currentId]) : null;
    render();
  }
}

function fillSelect() {
  $("layoutSel").innerHTML = Object.entries(all).map(([id, l]) =>
    `<option value="${id}" ${id === currentId ? "selected" : ""}>${esc(l.name)}</option>`).join("")
    || "<option>Žiadny displej</option>";
}

function lsGet(k) { try { return localStorage.getItem(k); } catch { return null; } }
function lsSet(k, v) { try { localStorage.setItem(k, v); } catch { /* nevadí */ } }

$("layoutSel").addEventListener("change", (e) => {
  currentId = e.target.value;
  lsSet("display-layout", currentId);
  history.replaceState(null, "", `?l=${encodeURIComponent(currentId)}`);
  layout = structuredClone(all[currentId]);
  render();
});

// lišta sa skryje, aby nezavadzala; ukáže sa po pohybe myši alebo dotyku
let barTimer = null;
function showBar() {
  $("bar").classList.remove("hide");
  clearTimeout(barTimer);
  barTimer = setTimeout(() => {
    if (!$("bar").matches(":hover") && document.activeElement !== $("layoutSel")) $("bar").classList.add("hide");
  }, 3500);
}
addEventListener("pointermove", (e) => { if (e.pointerType === "mouse") showBar(); });
addEventListener("pointerdown", showBar);
showBar();

// ---------- editor ----------
const uid = () => `w${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`;

function setEditing(on) {
  editing = on;
  dirty = false;
  selected = null;
  document.body.classList.toggle("editing", on);
  $("edbar").hidden = !on;
  $("props").hidden = !on;
  if (!on) layout = currentId ? structuredClone(all[currentId]) : null;
  render();
  showProps();
}

$("editBtn").addEventListener("click", () => {
  if (!layout) {
    createLayout("Môj displej", { cols: 24, rows: 14, widgets: [] });
    return;
  }
  setEditing(true);
});

$("cancelBtn").addEventListener("click", () => {
  if (dirty && !confirm("Zahodiť neuložené zmeny?")) return;
  setEditing(false);
});

$("saveBtn").addEventListener("click", async () => {
  try {
    const saved = await getJSON(`/api/displays/${encodeURIComponent(currentId)}`, {
      method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(layout) });
    all[currentId] = saved;
    fillSelect();
    toast("Displej uložený");
    setEditing(false);
  } catch (e) { toast(`Chyba: ${e.message}`); }
});

function slug(name) {
  const base = name.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase()
    .replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 30) || "displej";
  let id = base;
  for (let i = 2; all[id]; i++) id = `${base}-${i}`;
  return id;
}

function createLayout(name, from) {
  const id = slug(name);
  all[id] = { ...structuredClone(from), name };
  currentId = id;
  lsSet("display-layout", id);
  fillSelect();
  layout = structuredClone(all[id]);
  setEditing(true);
  dirty = true;
}

$("newBtn").addEventListener("click", () => {
  if (dirty && !confirm("Zahodiť neuložené zmeny tohto displeja?")) return;
  const name = prompt("Názov nového displeja:", "Môj displej");
  if (name) createLayout(name.trim().slice(0, 60), { cols: 24, rows: 14, widgets: [] });
});

$("dupBtn").addEventListener("click", () => {
  const name = prompt("Názov kópie:", `${layout.name} (kópia)`);
  if (name) createLayout(name.trim().slice(0, 60), layout);
});

$("delBtn").addEventListener("click", async () => {
  if (!confirm(`Zmazať displej „${layout.name}“?`)) return;
  try {
    await getJSON(`/api/displays/${encodeURIComponent(currentId)}`, { method: "DELETE" });
  } catch { /* nový, ešte neuložený displej na serveri nie je */ }
  delete all[currentId];
  currentId = Object.keys(all)[0] || null;
  fillSelect();
  setEditing(false);
});

function sizeGridOverlay() {
  board.style.setProperty("--cw", `${100 / layout.cols}%`);
  board.style.setProperty("--ch", `${100 / layout.rows}%`);
}

function changed() {
  dirty = true;
  render();
  showProps();
}

function cellSize() {
  const r = board.getBoundingClientRect();
  const cs = getComputedStyle(board);
  const w = r.width - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
  const h = r.height - parseFloat(cs.paddingTop) - parseFloat(cs.paddingBottom);
  return [w / layout.cols, h / layout.rows];
}

// posun (ťahanie prvku) a zmena veľkosti (ťahanie rohu) po bunkách mriežky
function bindEditing(el, w) {
  el.addEventListener("pointerdown", (e) => {
    e.preventDefault();
    const resize = e.target.classList.contains("rs");
    const [cw, ch] = cellSize();
    const start = { x: e.clientX, y: e.clientY, wx: w.x, wy: w.y, ww: w.w, wh: w.h };
    let moved = false;
    el.setPointerCapture(e.pointerId);
    if (selected !== w.id) {
      selected = w.id;
      board.querySelectorAll(".wd.sel").forEach((x) => x.classList.remove("sel"));
      el.classList.add("sel");
      showProps();
    }
    const move = (ev) => {
      const dx = Math.round((ev.clientX - start.x) / cw);
      const dy = Math.round((ev.clientY - start.y) / ch);
      if (resize) {
        w.w = Math.max(1, Math.min(layout.cols - w.x, start.ww + dx));
        w.h = Math.max(1, Math.min(layout.rows - w.y, start.wh + dy));
      } else {
        w.x = Math.max(0, Math.min(layout.cols - w.w, start.wx + dx));
        w.y = Math.max(0, Math.min(layout.rows - w.h, start.wy + dy));
      }
      if (w.x !== start.wx || w.y !== start.wy || w.w !== start.ww || w.h !== start.wh) moved = true;
      el.style.gridColumn = `${w.x + 1} / span ${w.w}`;
      el.style.gridRow = `${w.y + 1} / span ${w.h}`;
    };
    const up = () => {
      el.removeEventListener("pointermove", move);
      el.removeEventListener("pointerup", up);
      el.removeEventListener("pointercancel", up);
      if (moved) changed();  // prekreslí (canvas a písmo sa prispôsobia novej veľkosti)
    };
    el.addEventListener("pointermove", move);
    el.addEventListener("pointerup", up);
    el.addEventListener("pointercancel", up);
  });
}

// klik do prázdna zruší výber -> panel ukáže nastavenia displeja
board.addEventListener("pointerdown", (e) => {
  if (editing && e.target === board && selected) {
    selected = null;
    render();
    showProps();
  }
});

addEventListener("keydown", (e) => {
  if (!editing || !selected || e.target.closest("input, select, textarea")) return;
  const w = layout.widgets.find((x) => x.id === selected);
  if (!w) return;
  const step = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }[e.key];
  if (e.key === "Delete" || e.key === "Backspace") {
    removeSelected();
  } else if (e.key === "Escape") {
    selected = null; render(); showProps();
  } else if (step) {
    e.preventDefault();
    if (e.shiftKey) {
      w.w = Math.max(1, Math.min(layout.cols - w.x, w.w + step[0]));
      w.h = Math.max(1, Math.min(layout.rows - w.y, w.h + step[1]));
    } else {
      w.x = Math.max(0, Math.min(layout.cols - w.w, w.x + step[0]));
      w.y = Math.max(0, Math.min(layout.rows - w.h, w.y + step[1]));
    }
    changed();
  }
});

function removeSelected() {
  layout.widgets = layout.widgets.filter((x) => x.id !== selected);
  selected = null;
  changed();
}

// nový prvok na prvé voľné miesto
function freeSpot(w, h) {
  const taken = (x, y) => layout.widgets.some((o) => x < o.x + o.w && x + w > o.x && y < o.y + o.h && y + h > o.y);
  for (let y = 0; y + h <= layout.rows; y++) {
    for (let x = 0; x + w <= layout.cols; x++) if (!taken(x, y)) return [x, y];
  }
  return [0, 0];
}

$("addBtn").addEventListener("click", () => {
  $("types").innerHTML = Object.entries(TYPES).map(([k, t]) =>
    `<button data-type="${k}"><b>${esc(t.name)}</b><small>${esc(t.desc)}</small></button>`).join("");
  $("palette").classList.add("open");
});
$("types").addEventListener("click", (e) => {
  const b = e.target.closest("[data-type]");
  if (!b) return;
  const t = TYPES[b.dataset.type];
  const w = Math.min(t.size[0], layout.cols);
  const h = Math.min(t.size[1], layout.rows);
  const [x, y] = freeSpot(w, h);
  const o = {};
  for (const p of t.props) if (p.def !== undefined) o[p.k] = p.def;
  const nw = { id: uid(), type: b.dataset.type, x, y, w, h, o };
  layout.widgets.push(nw);
  selected = nw.id;
  $("palette").classList.remove("open");
  changed();
});
document.querySelectorAll("[data-close]").forEach((b) =>
  b.addEventListener("click", () => b.closest(".modal-bg").classList.remove("open")));
$("palette").addEventListener("click", (e) => { if (e.target === e.currentTarget) e.currentTarget.classList.remove("open"); });

// ---------- panel vlastností ----------
function fieldOptions(cur) {
  const groups = {};
  for (const [k, f] of Object.entries(FIELDS)) (groups[f.g] ||= []).push([k, f.label]);
  return Object.entries(groups).map(([g, items]) => `<optgroup label="${esc(g)}">${items.map(([k, l]) =>
    `<option value="${k}" ${k === cur ? "selected" : ""}>${esc(l)}</option>`).join("")}</optgroup>`).join("");
}

function buttonOptions(cur) {
  if (!bb) return "<option value=''>Button box nie je dostupný</option>";
  return "<option value=''>– vyber –</option>" + Object.entries(bb.profiles).map(([pid, p]) =>
    `<optgroup label="${esc(p.name)}">${p.buttons.map((b) => {
      const v = `${pid}/${b.id}`;
      return `<option value="${esc(v)}" ${v === cur ? "selected" : ""}>${esc(b.label)}</option>`;
    }).join("")}</optgroup>`).join("");
}

function propInput(p, val) {
  const id = `p_${p.k}`;
  if (p.type === "check") {
    return `<label class="check"><input type="checkbox" id="${id}" ${val ?? p.def ? "checked" : ""}> ${esc(p.label)}</label>`;
  }
  let input;
  if (p.type === "field") input = `<select id="${id}">${fieldOptions(val ?? p.def)}</select>`;
  else if (p.type === "button") input = `<select id="${id}">${buttonOptions(val)}</select>`;
  else if (p.type === "color" || p.type === "select") {
    const opts = p.type === "color" ? COLORS : p.options;
    const cur = String(val ?? p.def ?? "");
    input = `<select id="${id}">${Object.entries(opts).map(([k, l]) =>
      `<option value="${k}" ${k === cur ? "selected" : ""}>${esc(l)}</option>`).join("")}</select>`;
  } else {
    input = `<input type="text" id="${id}" value="${esc(val ?? p.def ?? "")}" maxlength="60">`;
  }
  return `<div class="field"><label for="${id}">${esc(p.label)}</label>${input}</div>`;
}

function showProps() {
  const panel = $("props");
  if (!editing) return;
  const w = layout.widgets.find((x) => x.id === selected);
  if (!w) {
    panel.innerHTML = `<h3>Displej</h3>
      <div class="field"><label>Názov</label><input type="text" id="lName" value="${esc(layout.name)}" maxlength="60"></div>
      <div class="row2">
        <div class="field"><label>Stĺpce</label><input type="number" id="lCols" min="4" max="48" value="${layout.cols}"></div>
        <div class="field"><label>Riadky</label><input type="number" id="lRows" min="3" max="40" value="${layout.rows}"></div>
      </div>
      <p class="hint">Prvok pridáš tlačidlom <b>+ Pridať prvok</b>. Ťahaním ho posunieš, modrým rohom zmeníš veľkosť,
        kliknutím ho vyberieš a tu nastavíš. Na klávesnici: šípky = posun, Shift+šípky = veľkosť, Delete = zmazať.</p>
      <p class="hint">Tento displej otvoríš na inom zariadení cez <b>📱 Mobil</b> na dashboarde – rozloženie je uložené na PC s aplikáciou.</p>`;
    $("lName").addEventListener("input", (e) => { layout.name = e.target.value.slice(0, 60); dirty = true; });
    for (const [id, k, lo, hi] of [["lCols", "cols", 4, 48], ["lRows", "rows", 3, 40]]) {
      $(id).addEventListener("change", (e) => {
        layout[k] = Math.max(lo, Math.min(hi, Math.round(+e.target.value || layout[k])));
        // prvky, ktoré by vypadli z mriežky, zmenšíme / posunieme dnu
        for (const x of layout.widgets) {
          const size = k === "cols" ? "w" : "h";
          const pos = k === "cols" ? "x" : "y";
          x[size] = Math.min(x[size], layout[k]);
          x[pos] = Math.min(x[pos], layout[k] - x[size]);
        }
        changed();
      });
    }
    return;
  }
  const t = TYPES[w.type];
  panel.innerHTML = `<h3>${esc(t.name)}</h3><p class="hint">${esc(t.desc)}</p>
    ${t.props.map((p) => propInput(p, w.o[p.k])).join("")}
    <label class="check"><input type="checkbox" id="p_bg" ${w.o.bg === false ? "" : "checked"}> Pozadie (rámik)</label>
    <p class="hint">Pozícia ${w.x + 1}, ${w.y + 1} · veľkosť ${w.w} × ${w.h}</p>
    <div class="actions">
      <button class="btn small" id="pDup">Duplikovať</button>
      <button class="btn small" id="pFront">Dopredu</button>
      <button class="btn small" id="pDel">🗑 Zmazať</button>
    </div>`;
  for (const p of [...t.props, { k: "bg", type: "check", def: true }]) {
    const el = $(`p_${p.k}`);
    el.addEventListener(p.type === "text" ? "input" : "change", () => {
      w.o[p.k] = p.type === "check" ? el.checked : el.value;
      dirty = true;
      // pri písaní textu neprekresľujeme panel (stratil by sa kurzor), len prvky
      if (p.type === "text") render(); else changed();
    });
  }
  $("pDel").addEventListener("click", removeSelected);
  $("pDup").addEventListener("click", () => {
    const copy = { ...structuredClone(w), id: uid() };
    [copy.x, copy.y] = freeSpot(copy.w, copy.h);
    layout.widgets.push(copy);
    selected = copy.id;
    changed();
  });
  $("pFront").addEventListener("click", () => {
    layout.widgets = [...layout.widgets.filter((x) => x !== w), w];
    changed();
  });
}

addEventListener("beforeunload", (e) => { if (editing && dirty) e.preventDefault(); });
addEventListener("resize", () => { if (editing) sizeGridOverlay(); });

// ---------- štart ----------
setupFullscreen($("fs"));
ws = connectWS(onFrame, (msg) => {
  // displej upravený na inom zariadení -> obnoviť (ak ho práve neupravujeme tu)
  if (msg.type === "display_saved" && !editing) loadAll(currentId).catch(() => {});
});
loadAll().catch((e) => {
  board.innerHTML = `<div class="empty-board">Nepodarilo sa načítať displeje: ${esc(e.message)}</div>`;
});

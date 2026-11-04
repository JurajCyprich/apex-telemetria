// Street view kola: prechádzaš trať ako v Google Maps. Každý bod trate má snímku obrazovky (ak sa
// nahrávala), rýchlosť, pedále a polohu auta; vedľa toho druhé kolo na porovnanie a najrýchlejšia
// stopa poskladaná z tvojich najlepších úsekov.
const $ = (id) => document.getElementById(id);
const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
const COLOR_A = "#0a84ff", COLOR_B = "#ff9f0a", PURPLE = "#bf5af2";

let list = [];
let A = null, B = null;          // celé kolá (s kanálmi)
let vidA = null, vidB = null;    // indexy snímok {frames: [{d, t, f}]}
let theo = null;                 // rozbor trate (najlepšie brzdenie, najrýchlejšia stopa)
let D = 0;                       // aktuálna vzdialenosť v kole (m)
let T = 0;                       // aktuálny čas v kole A (pri prehrávaní)
let playing = false;
let swapped = false;
let dirty = true;

// ---------- pomocné ----------
function bsearch(arr, v, key = (x) => x) {
  let lo = 0, hi = arr.length - 1;
  while (lo < hi) { const m = (lo + hi) >> 1; if (key(arr[m]) < v) lo = m + 1; else hi = m; }
  return lo;
}
function interp(ds, vs, d) {
  const n = ds.length;
  if (!n || !vs) return null;
  if (d <= ds[0]) return vs[0];
  if (d >= ds[n - 1]) return vs[n - 1];
  const i = bsearch(ds, d);
  const f = (d - ds[i - 1]) / (ds[i] - ds[i - 1] || 1);
  return vs[i - 1] + f * (vs[i] - vs[i - 1]);
}
const at = (lap, key, d) => (lap ? interp(lap.channels.d, lap.channels[key], d) : null);
const pos = (lap, d) => [at(lap, "x", d), at(lap, "z", d)];
const lapLen = () => (A ? A.channels.d.at(-1) : 0);
function nearestFrame(vid, d) {
  if (!vid || !vid.frames.length) return null;
  const fr = vid.frames;
  const i = bsearch(fr, d, (f) => f.d);
  const j = i > 0 && Math.abs(fr[i - 1].d - d) < Math.abs(fr[i].d - d) ? i - 1 : i;
  return { i: j, f: fr[j] };
}
const frameUrl = (vid, f) => `/api/video/${vid.id}/${f.f}`;
function speedColor(v, lo, hi) {
  const k = Math.max(0, Math.min(1, (v - lo) / (hi - lo || 1)));
  return `hsl(${Math.round(k * 215)}, 90%, 55%)`;
}
const lapLabel = (l) => `${l.video ? "🎥 " : ""}${fmtTime(l.time)} · ${new Date(l.date).toLocaleString("sk-SK", { day: "numeric", month: "numeric", hour: "2-digit", minute: "2-digit" })}`;

// ---------- výber kôl ----------
async function init() {
  list = await getJSON("/api/laps");
  if (!list.length) {
    $("noVideo").hidden = false;
    $("noVideo").innerHTML = "<b>Zatiaľ žiadne kolá.</b><span>Odjazdi aspoň jedno celé kolo – a so zapnutým 🎥 Obraz aj s obrazom.</span>";
    return;
  }
  const groups = {};
  for (const l of list) (groups[`${l.track} · ${l.car} (${l.game})`] ||= []).push(l);
  $("selA").innerHTML = Object.entries(groups).map(([g, items]) =>
    `<optgroup label="${esc(g)}">${items.sort((a, b) => a.time - b.time).map((l) => `<option value="${l.id}">${esc(lapLabel(l))}</option>`).join("")}</optgroup>`).join("");
  const q = new URLSearchParams(location.search);
  const want = q.get("a");
  const first = list.find((l) => l.id === want) || list.find((l) => l.video) || list[0];
  $("selA").value = first.id;
  await loadA(first.id, q.get("b"));
}

async function loadA(id, wantB) {
  const meta = list.find((l) => l.id === id);
  [A, vidA, theo] = await Promise.all([
    getJSON(`/api/laps/${id}`),
    meta?.video ? getJSON(`/api/video/${id}`).catch(() => null) : null,
    getJSON(`/api/analysis?a=${id}`).catch(() => null),
  ]);
  const same = list.filter((l) => l.game === A.game && l.track === A.track && l.car === A.car && l.id !== A.id)
    .sort((a, b) => a.time - b.time);
  $("selB").innerHTML = `<option value="">— bez porovnania —</option>` + same.map((l) =>
    `<option value="${l.id}">${esc(lapLabel(l))}${l.id === theo?.ref_id ? " ★ najlepšie" : ""}</option>`).join("");
  const b = same.find((l) => l.id === wantB) || same.find((l) => l.id === theo?.ref_id) || (same[0]?.time < A.time ? same[0] : null);
  $("selB").value = b ? b.id : "";
  await loadB(b ? b.id : "");
  D = Math.min(D, lapLen());
  T = at(A, "t", D) || 0;
  buildStatic();
  updateUrl();
}

async function loadB(id) {
  const meta = list.find((l) => l.id === id);
  [B, vidB] = id ? await Promise.all([getJSON(`/api/laps/${id}`), meta?.video ? getJSON(`/api/video/${id}`).catch(() => null) : null]) : [null, null];
  if (!vidB) swapped = false;
  $("swap").hidden = !(vidA && vidB);
  buildStatic();
  updateUrl();
}

function updateUrl() {
  if (A) history.replaceState(null, "", `?a=${A.id}${B ? `&b=${B.id}` : ""}`);
}
$("selA").onchange = (e) => loadA(e.target.value).catch((err) => toast(err.message));
$("selB").onchange = (e) => loadB(e.target.value).catch((err) => toast(err.message));
$("swap").onclick = () => { swapped = !swapped; dirty = true; };
$("pip").onclick = () => { if (vidA && vidB) { swapped = !swapped; dirty = true; } };

// ---------- statické vrstvy (mapa, časová os) – kreslia sa raz pri zmene kola alebo veľkosti ----------
let mapLayer = null, mapProject = null, tlLayer = null, tlGeom = null;
let brakesA = [];   // miesta, kde kolo A začalo brzdiť

function findBrakes(lap) {
  const c = lap.channels, out = [];
  for (let i = 1; i < c.brake.length; i++) if (c.brake[i] > 0.3 && c.brake[i - 1] <= 0.3) out.push(c.d[i]);
  return out;
}

function buildStatic() {
  if (!A) return;
  brakesA = findBrakes(A);
  // mapa
  const cv = $("map");
  const { ctx, w, h } = setupCanvas(cv);
  const c = A.channels;
  const pts = c.x.map((x, i) => [x, c.z[i]]);
  ctx.clearRect(0, 0, w, h);
  mapProject = drawTrack(ctx, w, h, pts, { width: 12 });
  if (mapProject) {
    const lo = Math.min(...c.speed), hi = Math.max(...c.speed);
    $("speedLegend").textContent = `· ${Math.round(lo)}–${Math.round(hi)} km/h`;
    ctx.lineWidth = 4; ctx.lineCap = "round";
    for (let i = 2; i < pts.length; i += 2) {
      const [x0, y0] = mapProject(...pts[i - 2]), [x1, y1] = mapProject(...pts[i]);
      ctx.strokeStyle = speedColor(c.speed[i], lo, hi);
      ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1, y1); ctx.stroke();
    }
    ctx.fillStyle = "#ff453a";
    for (const bd of brakesA) { const [px, py] = mapProject(...pos(A, bd)); ctx.beginPath(); ctx.arc(px, py, 3, 0, Math.PI * 2); ctx.fill(); }
    ctx.font = "bold 10px sans-serif"; ctx.textAlign = "center";
    for (const b of theo?.brakes || []) {
      const [px, py] = mapProject(b.x, b.z);
      ctx.fillStyle = PURPLE; ctx.beginPath(); ctx.arc(px, py, 6, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = "#fff"; ctx.fillText(b.n, px, py + 3.5);
    }
  }
  mapLayer = snapshot(cv);

  // časová os: rýchlosť A a B, brzda, zákruty
  const tv = $("tl");
  const g = setupCanvas(tv);
  const t2 = g.ctx;
  t2.clearRect(0, 0, g.w, g.h);
  const left = 8, right = 8, top = 14, bottom = 18;
  const maxD = lapLen();
  const all = [...c.speed, ...(B ? B.channels.speed : [])];
  const vmin = Math.min(...all), vmax = Math.max(...all);
  const xOf = (d) => left + (d / maxD) * (g.w - left - right);
  const yOf = (v) => top + (1 - (v - vmin) / (vmax - vmin || 1)) * (g.h - top - bottom - 12);
  tlGeom = { left, right, w: g.w, h: g.h, maxD, xOf };
  // brzda A (červený pruh dole)
  for (let i = 1; i < c.d.length; i++) {
    if (c.brake[i] > 0.05) {
      t2.fillStyle = `rgba(255,69,58,${0.25 + 0.75 * c.brake[i]})`;
      t2.fillRect(xOf(c.d[i - 1]), g.h - bottom - 8, Math.max(1, xOf(c.d[i]) - xOf(c.d[i - 1])), 6);
    }
  }
  for (const [lap, col] of [[B, COLOR_B], [A, COLOR_A]]) {
    if (!lap) continue;
    const ch = lap.channels;
    t2.strokeStyle = col; t2.lineWidth = 1.5; t2.beginPath();
    for (let i = 0; i < ch.d.length; i += 2) { const x = xOf(ch.d[i]), y = yOf(ch.speed[i]); i ? t2.lineTo(x, y) : t2.moveTo(x, y); }
    t2.stroke();
  }
  t2.font = "bold 10px sans-serif"; t2.textAlign = "center";
  for (const b of theo?.brakes || []) {
    const x = xOf(b.d);
    t2.strokeStyle = "#bf5af288"; t2.beginPath(); t2.moveTo(x, top); t2.lineTo(x, g.h - bottom); t2.stroke();
    t2.fillStyle = PURPLE; t2.fillText(`${b.n}`, x, 10);
  }
  t2.fillStyle = "#5b6378"; t2.font = "10px monospace";
  for (let d = 0; d <= maxD; d += 500) t2.fillText(`${d} m`, xOf(d), g.h - 3);
  tlLayer = snapshot(tv);
  dirty = true;
}

function snapshot(cv) {
  const off = document.createElement("canvas");
  off.width = cv.width; off.height = cv.height;
  off.getContext("2d").drawImage(cv, 0, 0);
  return off;
}
function restore(cv, layer) {
  const ctx = cv.getContext("2d");
  const dpr = window.devicePixelRatio || 1;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, cv.width, cv.height);
  if (layer) ctx.drawImage(layer, 0, 0);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  return ctx;
}

// ---------- obraz ----------
const cache = new Map();
function preload(vid, i) {
  for (let k = i - 3; k <= i + 10; k++) {
    const f = vid.frames[k];
    if (!f) continue;
    const url = frameUrl(vid, f);
    if (!cache.has(url)) { const im = new Image(); im.src = url; cache.set(url, im); }
  }
  if (cache.size > 400) for (const k of [...cache.keys()].slice(0, 100)) cache.delete(k);
}
function showImage(img, vid, d) {
  const nf = nearestFrame(vid, d);
  if (!nf) { img.removeAttribute("src"); return false; }
  const url = frameUrl(vid, nf.f);
  if (img.dataset.url !== url) { img.src = url; img.dataset.url = url; }
  preload(vid, nf.i);
  return true;
}

// ---------- hlavné vykreslenie ----------
function nextBrake(d) {
  const bs = theo?.brakes || [];
  return bs.find((b) => b.apex_d > d - 5) || null;
}
// kde kolo A začalo brzdiť pred zákrutou (rovnaké pravidlo ako na serveri: aspoň 15 m súvislej brzdy)
function myBrake(lap, b) {
  const c = lap.channels;
  let i = bsearch(c.d, b.d - 200);
  const end = bsearch(c.d, b.apex_d);
  while (i < end) {
    if (c.brake[i] > 0.15) {
      let j = i;
      while (j < end && c.brake[j] > 0.1) j++;
      if (c.d[j - 1] - c.d[i] >= 15 || j >= end) return c.d[i];
      i = j;
    }
    i++;
  }
  return null;
}

function render() {
  if (!A) return;
  const mainVid = swapped ? vidB : vidA;
  const pipVid = swapped ? vidA : vidB;
  const hasMain = showImage($("imgMain"), mainVid, D);
  $("imgMain").hidden = !hasMain;
  $("bigZoom").hidden = hasMain;
  $("noVideo").hidden = !!vidA;
  $("pip").hidden = !(hasMain && pipVid);
  if (pipVid && hasMain) { showImage($("imgPip"), pipVid, D); $("pipLbl").textContent = swapped ? "A" : "B"; $("pip").style.borderColor = swapped ? COLOR_A : COLOR_B; }

  // HUD (vždy kolo A)
  const v = at(A, "speed", D), thr = at(A, "throttle", D), brk = at(A, "brake", D);
  $("hSpeed").textContent = Math.round(v);
  $("hGear").textContent = gearText(Math.round(at(A, "gear", D + 0.01)));
  $("hThr").style.height = `${thr * 100}%`;
  $("hBrk").style.height = `${brk * 100}%`;
  if (B) {
    const dt = at(A, "t", D) - at(B, "t", D);
    const dv = v - at(B, "speed", D);
    $("hDelta").textContent = fmtDelta(dt);
    $("hDelta").className = `delta mono ${dt < 0 ? "faster" : dt > 0 ? "slower" : ""}`;
    $("hDv").textContent = `${dv >= 0 ? "+" : ""}${dv.toFixed(0)} km/h oproti B`;
  } else { $("hDelta").textContent = ""; $("hDv").textContent = ""; }

  // kde brzdiť
  const nb = nextBrake(D);
  const co = $("callout");
  if (nb && nb.d - D < 220) {
    const dist = nb.d - D;
    const mine = myBrake(A, nb);
    const diff = mine === null ? null : Math.round(mine - nb.d);
    const mineTxt = diff === null ? "" : Math.abs(diff) <= 3 ? "ty si brzdil na rovnakom mieste"
      : `ty si brzdil o ${Math.abs(diff)} m ${diff < 0 ? "skôr" : "neskôr"}`;
    const now = dist <= 8 && dist >= -15;
    co.className = `callout ${now ? "now" : ""}`;
    co.innerHTML = dist > 8
      ? `Zákruta ${nb.n}: najlepšie brzdenie o ${Math.round(dist)} m<small>vstup ${nb.entry} → ${nb.speed} km/h${nb.gear ? `, ${gearText(nb.gear)}. prevod` : ""}${mineTxt ? ` · ${mineTxt}` : ""}</small>`
      : now ? `BRZDI – zákruta ${nb.n}<small>na ${nb.speed} km/h${mineTxt ? ` · ${mineTxt}` : ""}</small>`
        : `Zákruta ${nb.n} · vrchol na ${nb.speed} km/h<small>${mineTxt}</small>`;
    co.hidden = false;
  } else co.hidden = true;
  const curT = at(A, "t", D);
  $("hWhere").textContent = `${Math.round(D)} m · ${fmtTime(curT)}`;

  drawMapCursor();
  drawZoom($("zoom"), 70);
  if (!hasMain) drawZoom($("bigZoom"), 110, true);
  drawTimelineCursor();
  drawReadout();
}

function drawMapCursor() {
  const ctx = restore($("map"), mapLayer);
  if (!mapProject) return;
  for (const [lap, col] of [[B, COLOR_B], [A, COLOR_A]]) {
    if (!lap) continue;
    const [px, py] = mapProject(...pos(lap, D));
    ctx.fillStyle = col; ctx.strokeStyle = "#fff"; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(px, py, lap === A ? 7 : 5, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
  }
}

// stopa zblízka: auto v strede, smer jazdy hore (ako pohľad v street view)
function drawZoom(cv, radius, big = false) {
  const { ctx, w, h } = setupCanvas(cv);
  ctx.fillStyle = "#0e1118"; ctx.fillRect(0, 0, w, h);
  const [cx, cz] = pos(A, D);
  const [ax, az] = pos(A, Math.max(0, D - 6)), [bx, bz] = pos(A, Math.min(lapLen(), D + 6));
  // obrazovka: x doprava, z hore (y = -z) – rovnako ako mapa
  const hx = bx - ax, hy = -(bz - az);
  const ang = -Math.PI / 2 - Math.atan2(hy, hx);
  const cos = Math.cos(ang), sin = Math.sin(ang);
  const scale = Math.min(w, h) / 2 / radius;
  const ox = w / 2, oy = h * 0.62;
  const P = (x, z) => {
    const sx = x - cx, sy = -(z - cz);
    return [ox + (sx * cos - sy * sin) * scale, oy + (sx * sin + sy * cos) * scale];
  };
  const span = radius * 2.2;
  const lineOf = (lap) => {
    const c = lap.channels, out = [];
    const i0 = bsearch(c.d, D - span), i1 = bsearch(c.d, D + span * 1.6);
    for (let i = i0; i <= i1 && i < c.d.length; i++) out.push(P(c.x[i], c.z[i]));
    return out;
  };
  const stroke = (pts, col, width, dash) => {
    if (pts.length < 2) return;
    ctx.save();
    if (dash) ctx.setLineDash(dash);
    ctx.strokeStyle = col; ctx.lineWidth = width; ctx.lineJoin = "round"; ctx.lineCap = "round";
    ctx.beginPath(); pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y))); ctx.stroke();
    ctx.restore();
  };
  // približný pás trate okolo stopy A (šírku trate hra neposiela)
  const aPts = lineOf(A);
  stroke(aPts, "#1f2534", Math.max(10, 12 * scale), null);
  if (theo?.line?.length) {
    const L = theo.line;
    const i0 = bsearch(L, D - span, (p) => p[0]), i1 = bsearch(L, D + span * 1.6, (p) => p[0]);
    stroke(L.slice(i0, i1 + 1).map(([, x, z]) => P(x, z)), PURPLE, big ? 3 : 2, [6, 5]);
  }
  if (B) stroke(lineOf(B), COLOR_B, big ? 3 : 2.5);
  stroke(aPts, COLOR_A, big ? 3.5 : 2.5);
  // brzdné body v dohľade
  for (const b of theo?.brakes || []) {
    if (Math.abs(b.d - D) > span * 1.6) continue;
    const [px, py] = P(b.x, b.z);
    ctx.fillStyle = PURPLE; ctx.beginPath(); ctx.arc(px, py, big ? 8 : 6, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = "#fff"; ctx.font = `bold ${big ? 12 : 10}px sans-serif`; ctx.textAlign = "center";
    ctx.fillText(b.n, px, py + 4);
    ctx.textAlign = "left"; ctx.fillStyle = "#e3c4ff"; ctx.fillText(`brzdi · ${b.speed} km/h`, px + 11, py + 4);
  }
  for (const bd of brakesA) {
    if (Math.abs(bd - D) > span * 1.6) continue;
    const [px, py] = P(...pos(A, bd));
    ctx.strokeStyle = "#ff453a"; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(px, py, 5, 0, Math.PI * 2); ctx.stroke();
  }
  // autá
  if (B) {
    const [px, py] = P(...pos(B, D));
    ctx.fillStyle = COLOR_B; ctx.beginPath(); ctx.arc(px, py, 5, 0, Math.PI * 2); ctx.fill();
  }
  ctx.fillStyle = COLOR_A; ctx.strokeStyle = "#fff"; ctx.lineWidth = 1.5;
  ctx.beginPath(); ctx.moveTo(ox, oy - 11); ctx.lineTo(ox + 7, oy + 7); ctx.lineTo(ox, oy + 3); ctx.lineTo(ox - 7, oy + 7); ctx.closePath();
  ctx.fill(); ctx.stroke();
  // mierka
  ctx.fillStyle = "#5b6378"; ctx.font = "10px monospace"; ctx.textAlign = "left";
  ctx.fillRect(10, h - 14, 10 * scale, 2); ctx.fillText("10 m", 10, h - 18);

  if (!big) {
    // bočný odstup kola B a najrýchlejšej stopy od kola A
    const side = (x, z) => {
      const [px] = P(x, z);
      const m = (px - ox) / scale;
      return Math.abs(m) < 0.3 ? "rovnako" : `${Math.abs(m).toFixed(1).replace(".", ",")} m ${m > 0 ? "vpravo" : "vľavo"}`;
    };
    const parts = [];
    if (B) parts.push(`Kolo B: <b>${side(...pos(B, D))}</b>`);
    if (theo?.line?.length) {
      const L = theo.line, k = Math.min(L.length - 1, bsearch(L, D, (p) => p[0]));
      if (Math.abs(L[k][0] - D) < 6) parts.push(`najrýchlejšia stopa: <b>${side(L[k][1], L[k][2])}</b>`);
    }
    $("offsets").innerHTML = parts.join(" · ") || "&nbsp;";
  }
}

function drawTimelineCursor() {
  const ctx = restore($("tl"), tlLayer);
  if (!tlGeom) return;
  const x = tlGeom.xOf(D);
  ctx.strokeStyle = "#fff"; ctx.lineWidth = 1.5;
  ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, tlGeom.h); ctx.stroke();
}

function drawReadout() {
  const row = (name, fa, fb) => `<tr><td>${name}</td><td class="ca">${fa}</td>${B ? `<td class="cb">${fb}</td>` : ""}</tr>`;
  const f = (lap, key, fmt) => (lap ? fmt(at(lap, key, D)) : "");
  const pct = (v) => `${Math.round(v * 100)} %`;
  $("read").innerHTML = `<table><tr><th>${Math.round(D)} m</th><th class="ca">A ${fmtTime(A.time)}</th>${B ? `<th class="cb">B ${fmtTime(B.time)}</th>` : ""}</tr>
    ${row("Čas v kole", f(A, "t", fmtTime), f(B, "t", fmtTime))}
    ${row("Rýchlosť", f(A, "speed", (v) => `${Math.round(v)} km/h`), f(B, "speed", (v) => `${Math.round(v)} km/h`))}
    ${row("Prevod", f(A, "gear", (v) => gearText(Math.round(v))), f(B, "gear", (v) => gearText(Math.round(v))))}
    ${row("Plyn", f(A, "throttle", pct), f(B, "throttle", pct))}
    ${row("Brzda", f(A, "brake", pct), f(B, "brake", pct))}
    ${row("Riadenie", f(A, "steer", (v) => v.toFixed(2)), f(B, "steer", (v) => v.toFixed(2)))}
  </table>`;
}

// ---------- ovládanie ----------
function setD(d, fromPlay = false) {
  if (!A) return;
  D = Math.max(0, Math.min(lapLen(), d));
  if (!fromPlay) T = at(A, "t", D) || 0;
  dirty = true;
}
function togglePlay(on = !playing) {
  playing = on && !!A;
  $("play").textContent = playing ? "⏸ Pauza" : "▶ Prehrať";
  if (playing && D >= lapLen() - 1) setD(0);
  lastTick = performance.now();
}
$("play").onclick = () => togglePlay();
let lastTick = performance.now();
function tick(now) {
  const dt = (now - lastTick) / 1000;
  lastTick = now;
  if (playing && A) {
    T += dt * +$("rate").value;
    const c = A.channels;
    if (T >= c.t.at(-1)) { T = c.t.at(-1); togglePlay(false); }
    setD(interp(c.t, c.d, T), true);
  }
  if (dirty) { dirty = false; render(); }
  requestAnimationFrame(tick);
}
requestAnimationFrame(tick);

addEventListener("keydown", (e) => {
  if (e.target.tagName === "SELECT") return;
  const step = e.shiftKey ? 50 : 5;
  if (e.key === "ArrowRight") { setD(D + step); e.preventDefault(); }
  else if (e.key === "ArrowLeft") { setD(D - step); e.preventDefault(); }
  else if (e.key === " ") { togglePlay(); e.preventDefault(); }
  else if (e.key === "Home") setD(0);
});
$("viewer").addEventListener("wheel", (e) => { e.preventDefault(); setD(D + Math.sign(e.deltaY) * (e.shiftKey ? 30 : 6)); }, { passive: false });

// časová os: ťahanie
function tlPick(e) {
  if (!tlGeom) return;
  const r = $("tl").getBoundingClientRect();
  const { left, right, w, maxD } = tlGeom;
  setD(((e.clientX - r.left - left) / (w - left - right)) * maxD);
}
let tlDrag = false;
$("tl").addEventListener("pointerdown", (e) => { tlDrag = true; try { $("tl").setPointerCapture(e.pointerId); } catch { /* nič */ } tlPick(e); });
$("tl").addEventListener("pointermove", (e) => { if (tlDrag) tlPick(e); });
$("tl").addEventListener("pointerup", () => { tlDrag = false; });
$("tl").addEventListener("wheel", (e) => { e.preventDefault(); setD(D + Math.sign(e.deltaY) * 6); }, { passive: false });

// mapa: klik / ťahanie "panáčika" po trati
function mapPick(e) {
  if (!A || !mapProject) return;
  const r = $("map").getBoundingClientRect();
  const mx = e.clientX - r.left, my = e.clientY - r.top;
  const c = A.channels;
  let best = Infinity, bd = null;
  for (let i = 0; i < c.d.length; i += 2) {
    const [px, py] = mapProject(c.x[i], c.z[i]);
    const dd = (px - mx) ** 2 + (py - my) ** 2;
    if (dd < best) { best = dd; bd = c.d[i]; }
  }
  if (bd !== null && best < 1600) setD(bd);
}
let mapDrag = false;
$("map").addEventListener("pointerdown", (e) => { mapDrag = true; try { $("map").setPointerCapture(e.pointerId); } catch { /* nič */ } mapPick(e); });
$("map").addEventListener("pointermove", (e) => { if (mapDrag) mapPick(e); });
$("map").addEventListener("pointerup", () => { mapDrag = false; });

addEventListener("resize", () => buildStatic());
setupFullscreen($("fs"));
init().catch((e) => toast(e.message));

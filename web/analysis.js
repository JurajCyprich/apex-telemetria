const $ = (id) => document.getElementById(id);
const COLOR_A = "#0a84ff";
const COLOR_B = "#ff9f0a";
const LANES = [
  { key: "speed", name: "Rýchlosť (km/h)", h: 2, fmt: (v) => v.toFixed(0) },
  { key: "throttle", name: "Plyn (%)", h: 1, min: 0, max: 1, fmt: (v) => (v * 100).toFixed(0) },
  { key: "brake", name: "Brzda (%)", h: 1, min: 0, max: 1, fmt: (v) => (v * 100).toFixed(0) },
  { key: "gear", name: "Prevod", h: 0.8, step: true, fmt: (v) => gearText(Math.round(v)) },
  { key: "steer", name: "Riadenie", h: 0.9, min: -1, max: 1, fmt: (v) => v.toFixed(2) },
  { key: "rpm", name: "Otáčky", h: 1, fmt: (v) => v.toFixed(0) },
  { key: "delta", name: "Delta B − A (s)", h: 1.2, delta: true, fmt: (v) => fmtDelta(v) },
];

let laps = [];
let lapA = null, lapB = null;
let hoverD = null;
let chartGeom = null;

async function loadList() {
  laps = await getJSON("/api/laps");
  renderList();
}

function renderList() {
  const groups = {};
  for (const l of laps) (groups[`${l.game}|${l.track}|${l.car}`] ||= []).push(l);
  const el = $("lapList");
  if (!laps.length) {
    el.innerHTML = '<p class="muted">Zatiaľ žiadne kolá. Odjazdi aspoň jedno celé kolo (od štartovej čiary po cieľ).</p>';
    return;
  }
  el.innerHTML = Object.entries(groups).map(([key, items]) => {
    const [game, track, car] = key.split("|");
    const best = Math.min(...items.map((l) => l.time));
    items.sort((a, b) => a.time - b.time);
    return `<div class="group"><div class="group-title">${esc(track)}<small>${esc(game)} · ${esc(car)}</small></div>
      ${items.map((l) => `<div class="lap ${lapA?.id === l.id ? "a" : ""} ${lapB?.id === l.id ? "b" : ""}" data-id="${l.id}">
        <span class="time">${fmtTime(l.time)}</span>${l.time === best ? '<span class="best">★ najlepšie</span>' : ""}${l.video ? '<span class="vid" title="Má nahraný obraz – street view">🎥</span>' : ""}
        <span class="date">${new Date(l.date).toLocaleString("sk-SK", { day: "numeric", month: "numeric", hour: "2-digit", minute: "2-digit" })}</span>
        <button class="btn small bbtn" data-b="1" title="Porovnať ako B">B</button>
        <button class="btn small del" data-del="1" title="Zmazať">✕</button></div>`).join("")}</div>`;
  }).join("");
}

function esc(s) { return String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]); }

$("lapList").addEventListener("click", async (e) => {
  const row = e.target.closest(".lap");
  if (!row) return;
  const id = row.dataset.id;
  if (e.target.dataset.del) {
    if (!confirm("Zmazať toto kolo?")) return;
    try {
      await getJSON(`/api/laps/${id}`, { method: "DELETE" });
      if (lapA?.id === id) lapA = null;
      if (lapB?.id === id) lapB = null;
      await loadList(); draw();
    } catch (err) { toast(err.message); }
    return;
  }
  const lap = await getJSON(`/api/laps/${id}`);
  if (e.target.dataset.b || e.shiftKey) lapB = lapB?.id === id ? null : lap;
  else { lapA = lap; if (lapB?.id === id) lapB = null; }
  renderList();
  draw();
});
$("reload").onclick = loadList;
setupFullscreen($("fs"));

// lineárna interpolácia hodnoty kanála v danej vzdialenosti
function interp(ds, vs, d) {
  let lo = 0, hi = ds.length - 1;
  if (hi < 0) return null;
  if (d <= ds[0]) return vs[0];
  if (d >= ds[hi]) return vs[hi];
  while (hi - lo > 1) { const mid = (lo + hi) >> 1; if (ds[mid] <= d) lo = mid; else hi = mid; }
  const f = (d - ds[lo]) / (ds[hi] - ds[lo] || 1);
  return vs[lo] + f * (vs[hi] - vs[lo]);
}

function deltaSeries(a, b) {
  const ca = a.channels, cb = b.channels;
  return { d: ca.d, v: ca.d.map((d, i) => interp(cb.d, cb.t, d) - ca.t[i]) };
}

function draw() {
  drawSummary();
  drawTheo();
  drawCorners();
  drawCharts();
  drawMap();
  drawReadout();
}

// ---------- teoretické najlepšie kolo, najlepšie brzdné body, najrýchlejšia stopa ----------
let theo = { key: null, data: null };
// rady k nastaveniu: kde auto nedotáča / pretáča, kde blokujú a pretáčajú sa kolesá
function drawSetup(s) {
  const card = $("setupCard");
  card.hidden = !s;
  if (!s) return;
  $("setupHint").textContent = (s.laps === 1 ? "· z posledného kola" : `· z posledných ${s.laps} kôl`)
    + " · orientačné rady – meň vždy len jednu vec a skús pár kôl";
  $("setupTips").innerHTML = s.tips.length
    ? s.tips.map((tip) => `<div class="tip"><b>${tip.title}</b>
        <span class="muted">· ${tip.corners.length > 1 ? "zákruty" : "zákruta"} ${tip.corners.join(", ")}</span>
        <ul>${tip.tips.map((x) => `<li>${x}</li>`).join("")}</ul></div>`).join("")
    : `<p class="ok">Auto je v zákrutách vyvážené, kolesá neblokujú ani sa nepretáčajú. 👍</p>`;
  const bal = (v) => {
    if (v === null || v === undefined) return "–";
    if (v > 0.2) return `<span class="under">${v > 0.4 ? "výrazne " : ""}nedotáča</span>`;
    if (v < -0.1) return `<span class="over">${v < -0.25 ? "výrazne " : ""}pretáča</span>`;
    return `<span class="okc">✓</span>`;
  };
  const axle = (a) => ({ 1: "predné", 2: "zadné", 3: "predné aj zadné" })[a] || "";
  const pct = (v, extra = "") => (v >= 0.3 ? `<span class="over">${Math.round(v * 100)} % kôl ${extra}</span>`
    : v > 0 ? `${Math.round(v * 100)} %` : "–");
  const head = s.balance ? "<th>Vjazd</th><th>Stred</th><th>Výjazd</th>" : "";
  const rows = s.corners.map((c) => `<tr><td>${c.n}</td>${s.balance ? `<td>${bal(c.entry)}</td><td>${bal(c.mid)}</td><td>${bal(c.exit)}</td>` : ""}
    <td>${pct(c.lock, axle(c.lock_axle))}</td><td>${pct(c.spin)}</td></tr>`).join("");
  $("setupTable").innerHTML = `<table class="ctab stab"><tr><th style="text-align:left">Zákruta</th>${head}
    <th>Blokujú kolesá</th><th>Pretáčajú sa kolesá</th></tr>${rows}</table>`
    + (s.balance ? "" : `<p class="muted small">Táto hra neposiela uhly sklzu kolies – nedotáčavosť a pretáčavosť nevieme posúdiť.</p>`);
}

async function drawTheo() {
  const card = $("theoCard");
  if (!lapA) { card.hidden = true; theo = { key: null, data: null }; return; }
  const key = `${lapA.game}|${lapA.track}|${lapA.car}|${laps.length}`;
  if (theo.key !== key) {
    theo = { key, data: null };
    try {
      const r = await getJSON(`/api/analysis?a=${lapA.id}`);
      if (theo.key !== key) return;
      theo.data = r;
    } catch { theo.data = null; }
    drawMap();
  }
  const t = theo.data;
  drawSetup(t && t.setup);
  $("streetLink").hidden = !lapA.channels || !laps.find((l) => l.id === lapA.id)?.video;
  $("streetLink").href = `/street?a=${lapA.id}${lapB ? `&b=${lapB.id}` : ""}`;
  card.hidden = !t;
  if (!t) return;
  const lapLabel = (id) => {
    const l = laps.find((x) => x.id === id);
    if (!l) return "?";
    const when = new Date(l.date).toLocaleString("sk-SK", { day: "numeric", month: "numeric", hour: "2-digit", minute: "2-digit" });
    return id === lapA.id ? `<span class="me">kolo A</span>` : `<a data-pick="${id}" title="Porovnať ako kolo B">${fmtTime(l.time)} · ${when}</a>`;
  };
  $("theoHint").textContent = `· z ${t.laps} ${t.laps === 1 ? "kola" : t.laps < 5 ? "kôl" : "kôl"} s týmto autom`;
  const vsA = lapA.time - t.time;
  $("theoSum").innerHTML = `
    <div><small>Teoretické najlepšie</small><b class="purple">${fmtTime(t.time)}</b></div>
    <div><small>Najlepšie odjazdené</small><b>${fmtTime(t.ref_time)}</b></div>
    <div><small>Rezerva oproti najlepšiemu</small><b style="color:var(--green)">${t.gain > 0 ? "−" : ""}${t.gain.toFixed(3)} s</b></div>
    <div><small>Rezerva kola A</small><b>${vsA.toFixed(3)} s</b></div>`;
  // čas kola A v jednotlivých úsekoch
  const at = (d) => interp(lapA.channels.d, lapA.channels.t, d);
  const rows = t.segments.map((s) => {
    const mine = at(s.end) - at(s.start);
    const loss = mine - s.best;
    return `<tr data-d="${(s.start + s.end) / 2}"><td>${s.i + 1}</td><td>${s.corner ? `zákruta ${s.corner}` : "štart / cieľ"}</td>
      <td class="purple">${s.best.toFixed(3)}</td><td class="ca">${mine.toFixed(3)}</td>
      <td class="${loss > 0.02 ? "slower" : ""}">${loss > 0.0005 ? `+${loss.toFixed(3)}` : "✓"}</td>
      <td class="from">${lapLabel(s.best_lap)}</td></tr>`;
  });
  $("theoTable").innerHTML = `<table class="ctab"><tr><th>Úsek</th><th style="text-align:left">Kde</th><th>Najlepší</th><th class="ca">Kolo A</th><th>Strata A</th><th style="text-align:left">Najlepší úsek z kola</th></tr>${rows.join("")}</table>`;
}
$("theoTable").addEventListener("click", async (e) => {
  const pick = e.target.closest("[data-pick]");
  if (pick) {
    lapB = await getJSON(`/api/laps/${pick.dataset.pick}`);
    renderList(); draw();
    return;
  }
  const tr = e.target.closest("tr[data-d]");
  if (tr) { hoverD = +tr.dataset.d; drawCharts(); drawMap(); drawReadout(); }
});
["mBest", "mLine", "mBrakes"].forEach((id) => $(id).addEventListener("change", drawMap));

// ---------- zákruty: kde kolo B stráca / získava oproti kolu A ----------
let corners = { key: null, list: [] };
async function drawCorners() {
  const card = $("cornersCard");
  if (!lapA) { card.hidden = true; return; }
  const key = `${lapA.id}|${lapB?.id || ""}`;
  if (corners.key !== key) {
    corners = { key, list: [] };
    try {
      const r = await getJSON(`/api/corners?a=${lapA.id}${lapB ? `&b=${lapB.id}` : ""}`);
      if (corners.key !== key) return;  // medzitým vybraté iné kolo
      corners.list = r.corners;
    } catch { corners.list = []; }
  }
  const list = corners.list;
  card.hidden = !list.length;
  if (!list.length) return;
  $("cornersHint").textContent = lapB ? "· kolo B oproti A · klikni na riadok = ukázať na grafe a mape" : "· vyber aj kolo B na porovnanie";
  const worst = lapB ? Math.max(...list.map((c) => c.dt ?? -Infinity)) : null;
  const sign = (v, unit = "") => (v > 0 ? `+${v}` : `${v}`) + unit;
  const rows = list.map((c) => {
    if (!lapB) return `<tr data-d="${c.d}"><td>${c.n}</td><td class="ca">${c.ref_speed} km/h</td></tr>`;
    if (c.dt === undefined) return `<tr data-d="${c.d}"><td>${c.n}</td><td class="ca">${c.ref_speed}</td><td colspan="3" class="muted">kolo B zákrutu nepokrýva</td></tr>`;
    const dtCls = c.dt > 0.02 ? "slower" : c.dt < -0.02 ? "faster" : "";
    const bd = c.brake_diff === null ? "–" : c.brake_diff === 0 ? "rovnako"
      : `${Math.abs(c.brake_diff)} m ${c.brake_diff < 0 ? "skôr" : "neskôr"}`;
    return `<tr data-d="${c.d}" class="${c.dt === worst && c.dt > 0.05 ? "worst" : ""}"><td>${c.n}</td>
      <td class="ca">${c.ref_speed}</td><td class="cb">${c.speed} <small class="${c.dv < 0 ? "slower" : c.dv > 0 ? "faster" : ""}">(${sign(c.dv)})</small></td>
      <td>${bd}</td><td class="${dtCls}"><b>${sign(c.dt.toFixed(3), " s")}</b></td></tr>`;
  });
  const total = lapB ? list.reduce((s, c) => s + (c.dt || 0), 0) : null;
  $("cornersTable").innerHTML = `<table class="ctab">
    <tr><th>#</th><th class="ca">${lapB ? "A km/h" : "Najnižšia rýchlosť"}</th>${lapB ? '<th class="cb">B km/h</th><th>Brzdenie B</th><th>Čas B − A</th>' : ""}</tr>
    ${rows.join("")}
    ${lapB ? `<tr class="sum"><td colspan="4">Spolu v zákrutách</td><td class="${total > 0 ? "slower" : "faster"}"><b>${sign(total.toFixed(3), " s")}</b></td></tr>` : ""}
  </table>`;
}
$("cornersTable").addEventListener("click", (e) => {
  const tr = e.target.closest("tr[data-d]");
  if (!tr) return;
  hoverD = +tr.dataset.d;
  drawCharts(); drawMap(); drawReadout();
});

function drawSummary() {
  const el = $("summary");
  if (!lapA) { el.innerHTML = '<span class="muted">Vyber kolo zo zoznamu vľavo.</span>'; return; }
  const chips = [`<div class="chip"><small class="ca">Kolo A</small><b>${fmtTime(lapA.time)}</b></div>`];
  if (lapB) {
    const diff = lapB.time - lapA.time;
    chips.push(`<div class="chip"><small class="cb">Kolo B</small><b>${fmtTime(lapB.time)}</b></div>`);
    chips.push(`<div class="chip"><small>Rozdiel B − A</small><b style="color:${diff < 0 ? "var(--green)" : "var(--red)"}">${fmtDelta(diff)}</b></div>`);
  }
  const vmax = Math.max(...lapA.channels.speed);
  chips.push(`<div class="chip"><small>Max. rýchlosť A</small><b>${vmax.toFixed(0)} km/h</b></div>`);
  chips.push(`<div class="chip"><small>Trať</small><b style="font-size:14px">${esc(lapA.track)}</b><small>${esc(lapA.car)}</small></div>`);
  el.innerHTML = chips.join("");
}

function drawCharts() {
  const canvas = $("charts");
  const { ctx, w, h } = setupCanvas(canvas);
  ctx.clearRect(0, 0, w, h);
  chartGeom = null;
  if (!lapA) return;
  const left = 110, right = 12, gap = 10;
  const lanes = LANES.filter((l) => !l.delta || lapB);
  const totalH = lanes.reduce((s, l) => s + l.h, 0);
  const unit = (h - gap * (lanes.length + 1)) / totalH;
  const maxD = Math.max(...[lapA, lapB].filter(Boolean).map((l) => l.channels.d.at(-1)));
  const xOf = (d) => left + (d / maxD) * (w - left - right);
  chartGeom = { left, right, w, maxD };
  const delta = lapB ? deltaSeries(lapA, lapB) : null;

  let y = gap;
  for (const lane of lanes) {
    const lh = lane.h * unit;
    ctx.fillStyle = "#10131b";
    ctx.fillRect(left, y, w - left - right, lh);
    ctx.fillStyle = "#8a93a8"; ctx.font = "12px sans-serif"; ctx.textAlign = "left";
    ctx.fillText(lane.name, 8, y + 16);

    const series = lane.delta ? [[delta.d, delta.v, "#e8ebf2"]]
      : [[lapA.channels.d, lapA.channels[lane.key], COLOR_A], ...(lapB ? [[lapB.channels.d, lapB.channels[lane.key], COLOR_B]] : [])];
    let min = lane.min, max = lane.max;
    if (min === undefined) {
      const all = series.flatMap(([, v]) => v);
      min = Math.min(...all); max = Math.max(...all);
      if (lane.delta) { const m = Math.max(Math.abs(min), Math.abs(max), 0.1); min = -m; max = m; }
      if (max === min) max = min + 1;
    }
    const yOf = (v) => y + lh - 4 - ((v - min) / (max - min)) * (lh - 8);
    if (lane.delta) {
      ctx.strokeStyle = "#333a4f"; ctx.beginPath(); ctx.moveTo(left, yOf(0)); ctx.lineTo(w - right, yOf(0)); ctx.stroke();
    }
    ctx.fillStyle = "#5b6378"; ctx.font = "10px monospace"; ctx.textAlign = "right";
    ctx.fillText(lane.fmt(max), left - 6, y + 10);
    ctx.fillText(lane.fmt(min), left - 6, y + lh - 2);
    for (const [ds, vs, color] of series) {
      if (!vs) continue;
      ctx.strokeStyle = color; ctx.lineWidth = 1.5; ctx.beginPath();
      let prevY = null;
      for (let i = 0; i < ds.length; i++) {
        const px = xOf(ds[i]), py = yOf(vs[i]);
        if (!i) ctx.moveTo(px, py);
        else if (lane.step && prevY !== null) { ctx.lineTo(px, prevY); ctx.lineTo(px, py); }
        else ctx.lineTo(px, py);
        prevY = py;
      }
      ctx.stroke();
    }
    y += lh + gap;
  }
  // vzdialenosť na osi
  ctx.fillStyle = "#5b6378"; ctx.textAlign = "center"; ctx.font = "10px monospace";
  for (let d = 0; d <= maxD; d += 500) ctx.fillText(`${d} m`, xOf(d), h - 1);

  if (hoverD !== null) {
    ctx.strokeStyle = "#ffffffaa"; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(xOf(hoverD), 0); ctx.lineTo(xOf(hoverD), h); ctx.stroke();
  }
}

let mapProject = null;
function drawMap() {
  const { ctx, w, h } = setupCanvas($("map"));
  ctx.clearRect(0, 0, w, h);
  mapProject = null;
  if (!lapA) return;
  const pts = lapA.channels.x.map((x, i) => [x, lapA.channels.z[i]]);
  const project = drawTrack(ctx, w, h, pts, { width: 11 });
  if (!project) return;
  mapProject = project;
  const t = theo.data;
  if (t && $("mLine").checked && t.line.length > 2) {
    ctx.save();
    ctx.setLineDash([5, 4]); ctx.strokeStyle = "#bf5af2"; ctx.lineWidth = 2;
    ctx.beginPath();
    t.line.forEach(([, x, z], i) => { const [px, py] = project(x, z); i ? ctx.lineTo(px, py) : ctx.moveTo(px, py); });
    ctx.stroke();
    ctx.restore();
  }
  // úseky, kde je B rýchlejšie (zelené) / pomalšie (červené)
  if (lapB) {
    const delta = deltaSeries(lapA, lapB);
    ctx.lineWidth = 5;
    for (let i = 1; i < pts.length; i++) {
      const slope = delta.v[i] - delta.v[i - 1];
      if (Math.abs(slope) < 0.002) continue;
      ctx.strokeStyle = slope < 0 ? "#30d15899" : "#ff453a99";
      const [x0, y0] = project(...pts[i - 1]); const [x1, y1] = project(...pts[i]);
      ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1, y1); ctx.stroke();
    }
  }
  // brzdné body kola A (modrý okraj) a B (oranžový)
  if ($("mBrakes").checked) {
    for (const [lap, ring] of [[lapA, COLOR_A], [lapB, COLOR_B]]) {
      if (!lap) continue;
      const c = lap.channels, br = c.brake;
      for (let i = 1; i < br.length; i++) {
        if (br[i] > 0.3 && br[i - 1] <= 0.3) {
          const [px, py] = project(c.x[i], c.z[i]);
          ctx.fillStyle = "#ff453a"; ctx.strokeStyle = ring; ctx.lineWidth = 1.5;
          ctx.beginPath(); ctx.arc(px, py, 3.5, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
        }
      }
    }
  }
  // najlepšie brzdné body: kde brzdilo kolo, ktoré danou zákrutou prešlo najrýchlejšie
  if (t && $("mBest").checked) {
    ctx.font = "bold 11px sans-serif"; ctx.textAlign = "left";
    for (const b of t.brakes) {
      const [px, py] = project(b.x, b.z);
      ctx.fillStyle = "#bf5af2"; ctx.strokeStyle = "#fff"; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.arc(px, py, 6, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      ctx.fillStyle = "#fff"; ctx.textAlign = "center"; ctx.fillText(b.n, px, py + 4);
      ctx.textAlign = "left"; ctx.fillStyle = "#e3c4ff";
      ctx.fillText(`${b.speed} km/h`, px + 9, py - 6);
    }
  }
  if (hoverD !== null) {
    for (const [lap, color] of [[lapA, COLOR_A], [lapB, COLOR_B]]) {
      if (!lap) continue;
      const c = lap.channels;
      const [px, py] = project(interp(c.d, c.x, hoverD), interp(c.d, c.z, hoverD));
      ctx.fillStyle = color; ctx.strokeStyle = "#fff"; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(px, py, 6, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    }
  }
}

function drawReadout() {
  const el = $("readVals");
  if (!lapA || hoverD === null) { el.innerHTML = "Prejdi myšou nad grafy."; el.className = "muted"; return; }
  el.className = "";
  const val = (lap, key) => lap ? interp(lap.channels.d, lap.channels[key], hoverD) : null;
  const rows = LANES.filter((l) => !l.delta).map((l) => {
    const a = val(lapA, l.key), b = val(lapB, l.key);
    return `<tr><td>${l.name}</td><td class="ca">${a === null ? "–" : l.fmt(a)}</td>${lapB ? `<td class="cb">${b === null ? "–" : l.fmt(b)}</td>` : ""}</tr>`;
  });
  const tA = val(lapA, "t"), tB = val(lapB, "t");
  rows.unshift(`<tr><td>Čas v kole</td><td class="ca">${fmtTime(tA)}</td>${lapB ? `<td class="cb">${fmtTime(tB)}</td>` : ""}</tr>`);
  if (lapB) rows.push(`<tr><td>Delta B − A</td><td colspan="2" style="color:${tB - tA < 0 ? "var(--green)" : "var(--red)"}">${fmtDelta(tB - tA)}</td></tr>`);
  el.innerHTML = `<table><tr><th>${hoverD.toFixed(0)} m</th><th class="ca">A</th>${lapB ? '<th class="cb">B</th>' : ""}</tr>${rows.join("")}</table>`;
}

$("charts").addEventListener("mousemove", (e) => {
  if (!chartGeom) return;
  const rect = e.target.getBoundingClientRect();
  const x = e.clientX - rect.left;
  const { left, right, w, maxD } = chartGeom;
  hoverD = Math.max(0, Math.min(maxD, ((x - left) / (w - left - right)) * maxD));
  requestAnimationFrame(() => { drawCharts(); drawMap(); drawReadout(); });
});
$("charts").addEventListener("mouseleave", () => { hoverD = null; drawCharts(); drawMap(); drawReadout(); });
// klik na mapu -> najbližší bod kola A
$("map").addEventListener("click", (e) => {
  if (!lapA || !mapProject) return;
  const rect = e.target.getBoundingClientRect();
  const mx = e.clientX - rect.left, my = e.clientY - rect.top;
  const c = lapA.channels;
  let best = Infinity, bd = null;
  for (let i = 0; i < c.d.length; i += 2) {
    const [px, py] = mapProject(c.x[i], c.z[i]);
    const dd = (px - mx) ** 2 + (py - my) ** 2;
    if (dd < best) { best = dd; bd = c.d[i]; }
  }
  if (bd !== null && best < 900) { hoverD = bd; drawCharts(); drawMap(); drawReadout(); }
});
window.addEventListener("resize", draw);

loadList().catch((e) => toast(e.message));

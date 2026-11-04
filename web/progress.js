// Pokrok: ako sa zlepšuješ na jednej trati s jedným autom (časy kôl v čase, konzistencia, teoretické najlepšie).
const $ = (id) => document.getElementById(id);
const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
let all = [];
let laps = [];      // vybraná kombinácia, zoradené podľa dátumu
let theo = null;
let geom = null;
let hover = -1;

const dayKey = (iso) => iso.slice(0, 10);
const dayName = (k) => new Date(`${k}T12:00:00`).toLocaleDateString("sk-SK", { weekday: "short", day: "numeric", month: "numeric", year: "numeric" });

// konzistencia: smerodajná odchýlka kôl do 107 % najlepšieho
function consistency(times) {
  if (times.length < 3) return null;
  const best = Math.min(...times);
  const ok = times.filter((t) => t <= best * 1.07);
  if (ok.length < 3) return null;
  const avg = ok.reduce((a, b) => a + b, 0) / ok.length;
  return Math.sqrt(ok.reduce((a, b) => a + (b - avg) ** 2, 0) / ok.length);
}

async function load() {
  all = await getJSON("/api/laps");
  const combos = {};
  for (const l of all) (combos[`${l.game}|${l.track}|${l.car}`] ||= []).push(l);
  const keys = Object.keys(combos).sort((a, b) => combos[b].length - combos[a].length);
  const sel = $("combo");
  if (!keys.length) {
    sel.innerHTML = "<option>Žiadne kolá</option>";
    $("chips").innerHTML = '<span class="muted">Zatiaľ žiadne uložené kolá – odjazdi pár celých kôl.</span>';
    return;
  }
  let want = new URLSearchParams(location.search).get("c");
  try { want ||= localStorage.getItem("progress-combo"); } catch { /* nevadí */ }
  sel.innerHTML = keys.map((k) => {
    const [g, t, c] = k.split("|");
    return `<option value="${esc(k)}">${esc(t)} · ${esc(c)} (${esc(g)}) – ${combos[k].length} kôl</option>`;
  }).join("");
  sel.value = keys.includes(want) ? want : keys[0];
  await pick(combos);
  sel.onchange = () => pick(combos);
}

async function pick(combos) {
  const key = $("combo").value;
  try { localStorage.setItem("progress-combo", key); } catch { /* nevadí */ }
  laps = [...combos[key]].sort((a, b) => (a.date < b.date ? -1 : 1));
  const [game, track, car] = key.split("|");
  theo = null;
  draw();
  try {
    theo = await getJSON(`/api/analysis?game=${encodeURIComponent(game)}&track=${encodeURIComponent(track)}&car=${encodeURIComponent(car)}`);
  } catch { theo = null; }
  draw();
}

function draw() {
  drawChips();
  drawChart();
  drawDays();
}

function drawChips() {
  const times = laps.map((l) => l.time);
  const best = Math.min(...times);
  const days = [...new Set(laps.map((l) => dayKey(l.date)))];
  const firstDay = laps.filter((l) => dayKey(l.date) === days[0]).map((l) => l.time);
  const improve = Math.min(...firstDay) - best;
  const last10 = times.slice(-10);
  const cons = consistency(last10);
  $("chips").innerHTML = `
    <div><small>Najlepšie kolo</small><b>${fmtTime(best)}</b></div>
    <div><small>Teoretické najlepšie</small><b class="purple">${theo ? fmtTime(theo.time) : "–"}</b></div>
    <div><small>Zlepšenie od ${days.length > 1 ? "prvého dňa" : "prvého kola"}</small><b class="green">${days.length > 1 || laps.length > 1 ? `−${(days.length > 1 ? improve : times[0] - best).toFixed(3)} s` : "–"}</b></div>
    <div><small>Konzistencia (posledných 10)</small><b>${cons === null ? "–" : `±${cons.toFixed(3)} s`}</b></div>
    <div><small>Priemer posledných 10</small><b>${fmtTime(last10.reduce((a, b) => a + b, 0) / last10.length)}</b></div>
    <div><small>Kôl / dní</small><b>${laps.length} / ${days.length}</b></div>`;
}

function drawChart() {
  const { ctx, w, h } = setupCanvas($("chart"));
  ctx.clearRect(0, 0, w, h);
  geom = null;
  if (!laps.length) return;
  const times = laps.map((l) => l.time);
  const best = Math.min(...times, theo?.time ?? Infinity);
  // pomalé kolá (výlety, boxy) by stlačili graf – os končí na 107 % najlepšieho
  const top = Math.min(Math.max(...times), best * 1.07);
  const lo = best - (top - best) * 0.08, hi = top + (top - best) * 0.05 || best + 1;
  const left = 70, right = 14, topPad = 12, bottom = 26;
  const n = laps.length;
  const xOf = (i) => left + (n === 1 ? (w - left - right) / 2 : (i / (n - 1)) * (w - left - right));
  const yOf = (t) => topPad + (1 - (Math.min(t, hi) - lo) / (hi - lo)) * (h - topPad - bottom);
  geom = { xOf, yOf };

  ctx.strokeStyle = "#1e2332"; ctx.fillStyle = "#5b6378"; ctx.font = "11px monospace"; ctx.textAlign = "right";
  for (let k = 0; k <= 4; k++) {
    const t = lo + ((hi - lo) * k) / 4;
    const y = yOf(t);
    ctx.beginPath(); ctx.moveTo(left, y); ctx.lineTo(w - right, y); ctx.stroke();
    ctx.fillText(fmtTime(t), left - 6, y + 4);
  }
  // oddelenie dní
  ctx.textAlign = "left";
  let prevDay = null;
  laps.forEach((l, i) => {
    const k = dayKey(l.date);
    if (k !== prevDay) {
      const x = xOf(i) - (n > 1 ? (w - left - right) / (n - 1) / 2 : 0);
      ctx.strokeStyle = "#2a3145"; ctx.beginPath(); ctx.moveTo(x, topPad); ctx.lineTo(x, h - bottom); ctx.stroke();
      ctx.fillStyle = "#8a93a8"; ctx.fillText(new Date(`${k}T12:00:00`).toLocaleDateString("sk-SK", { day: "numeric", month: "numeric" }), x + 4, h - 8);
      prevDay = k;
    }
  });
  if (theo) {
    ctx.save(); ctx.setLineDash([6, 5]); ctx.strokeStyle = "#bf5af2aa"; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.moveTo(left, yOf(theo.time)); ctx.lineTo(w - right, yOf(theo.time)); ctx.stroke(); ctx.restore();
  }
  // najlepší čas v danom momente
  ctx.strokeStyle = "#bf5af2"; ctx.lineWidth = 2; ctx.beginPath();
  let run = Infinity;
  laps.forEach((l, i) => {
    run = Math.min(run, l.time);
    i ? ctx.lineTo(xOf(i), yOf(run)) : ctx.moveTo(xOf(i), yOf(run));
  });
  ctx.stroke();
  laps.forEach((l, i) => {
    const slow = l.time > hi;
    ctx.fillStyle = l.time === Math.min(...times) ? "#bf5af2" : slow ? "#5b6378" : "#0a84ff";
    ctx.beginPath(); ctx.arc(xOf(i), yOf(l.time), i === hover ? 6 : 3.5, 0, Math.PI * 2); ctx.fill();
  });
}

$("chart").addEventListener("mousemove", (e) => {
  if (!geom) return;
  const r = e.target.getBoundingClientRect();
  const mx = e.clientX - r.left, my = e.clientY - r.top;
  let bi = -1, bd = Infinity;
  laps.forEach((l, i) => {
    const dd = (geom.xOf(i) - mx) ** 2 + (geom.yOf(l.time) - my) ** 2;
    if (dd < bd) { bd = dd; bi = i; }
  });
  hover = bd < 400 ? bi : -1;
  const l = laps[hover];
  $("tip").innerHTML = l ? `<b class="mono">${fmtTime(l.time)}</b> · ${new Date(l.date).toLocaleString("sk-SK")} · <a href="/analysis">otvoriť v analýze</a>${l.video ? ` · <a href="/street?a=${l.id}">🎥 street view</a>` : ""}` : "Prejdi myšou nad bodky.";
  drawChart();
});

function drawDays() {
  const groups = {};
  for (const l of laps) (groups[dayKey(l.date)] ||= []).push(l.time);
  const keys = Object.keys(groups).sort().reverse();
  const overall = Math.min(...laps.map((l) => l.time));
  let prevBest = null;
  const bestBefore = {};
  for (const k of [...keys].reverse()) { bestBefore[k] = prevBest; const b = Math.min(...groups[k]); prevBest = prevBest === null ? b : Math.min(prevBest, b); }
  $("days").innerHTML = `<table class="dtab"><tr><th>Deň</th><th>Kôl</th><th>Najlepšie</th><th>Priemer</th><th>Konzistencia</th><th>Oproti predtým</th></tr>
    ${keys.map((k) => {
      const t = groups[k];
      const b = Math.min(...t);
      const ok = t.filter((x) => x <= b * 1.07);
      const avg = ok.reduce((a, c) => a + c, 0) / ok.length;
      const cons = consistency(t);
      const before = bestBefore[k];
      const diff = before === null ? null : b - before;
      return `<tr><td>${dayName(k)}</td><td>${t.length}</td><td class="${b === overall ? "best" : ""}">${fmtTime(b)}</td>
        <td>${fmtTime(avg)}</td><td>${cons === null ? "–" : `±${cons.toFixed(3)} s`}</td>
        <td class="${diff !== null && diff < 0 ? "faster" : ""}">${diff === null ? "prvý deň" : diff < 0 ? fmtDelta(diff) : "bez zlepšenia"}</td></tr>`;
    }).join("")}</table>`;
}

setupFullscreen($("fs"));
addEventListener("resize", drawChart);
load().catch((e) => toast(e.message));

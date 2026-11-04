const $ = (id) => document.getElementById(id);
const WHEELS = ["LP", "PP", "LZ", "PZ"];
const FLAG_COLORS = { green: "#16a34a", yellow: "#eab308", blue: "#2563eb", black: "#000", white: "#eee",
  checkered: "#888", penalty: "#dc2626", orange: "#f97316" };
const FLAG_NAMES = { green: "Zelená", yellow: "Žltá", blue: "Modrá", black: "Čierna", white: "Biela",
  checkered: "Cieľ", penalty: "Penalta", orange: "Oranžová" };

// ---------- shift svetlá ----------
const shift = $("shift");
for (let i = 0; i < 15; i++) shift.appendChild(document.createElement("i"));
const leds = [...shift.children];
let maxRpmSeen = 0;

function updateShift(rpm, maxRpm) {
  const max = maxRpm || maxRpmSeen || 8000;
  const start = max * 0.72;
  const n = Math.max(0, Math.min(15, Math.round(((rpm - start) / (max * 0.97 - start)) * 15)));
  leds.forEach((el, i) => { el.className = i < n ? (i < 5 ? "g" : i < 10 ? "y" : "r") : ""; });
  shift.classList.toggle("flash", rpm >= max * 0.97);
}

// ---------- pneumatiky ----------
const tyresEl = $("tyres");
const tyreEls = WHEELS.map((name) => {
  const el = document.createElement("div");
  el.className = "tyre";
  el.innerHTML = `<div class="t"><div class="b"></div></div><div class="v"><b>–</b>°C<br><span class="p">–</span> psi<br><span class="w">–</span>% · <span class="bt">–</span>°C</div>`;
  tyresEl.appendChild(el);
  return { t: el.querySelector(".t"), b: el.querySelector(".b"), temp: el.querySelector("b"),
    p: el.querySelector(".p"), w: el.querySelector(".w"), bt: el.querySelector(".bt"), name };
});

// ---------- stopa vstupov ----------
const TRACE_LEN = 300;
const trace = { thr: [], brk: [] };
function drawTrace() {
  const { ctx, w, h } = setupCanvas($("trace"));
  ctx.clearRect(0, 0, w, h);
  ctx.strokeStyle = "#1e2332";
  for (let i = 1; i < 4; i++) { ctx.beginPath(); ctx.moveTo(0, (h * i) / 4); ctx.lineTo(w, (h * i) / 4); ctx.stroke(); }
  for (const [key, color] of [["thr", "#30d158"], ["brk", "#ff453a"]]) {
    const arr = trace[key];
    ctx.strokeStyle = color; ctx.lineWidth = 2; ctx.beginPath();
    arr.forEach((v, i) => {
      const x = (i / (TRACE_LEN - 1)) * w, y = h - 2 - v * (h - 4);
      i ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
    });
    ctx.stroke();
  }
}

// ---------- mapa trate ----------
let mapPoints = [];
let mapVersion = null;
let trail = [];
let lastPos = null;
async function loadMap() {
  try { const m = await getJSON("/api/map"); mapPoints = m.points; } catch { /* nič */ }
}
function drawMap() {
  const { ctx, w, h } = setupCanvas($("mapCanvas"));
  ctx.clearRect(0, 0, w, h);
  const pts = mapPoints.length > 20 ? mapPoints : trail;
  const project = drawTrack(ctx, w, h, pts);
  if (project && lastPos) {
    const [px, py] = project(lastPos[0], lastPos[1]);
    ctx.fillStyle = "#ff3b30"; ctx.beginPath(); ctx.arc(px, py, 6, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = "#fff"; ctx.lineWidth = 2; ctx.stroke();
  } else if (!project) {
    ctx.fillStyle = "#8a93a8"; ctx.textAlign = "center";
    ctx.fillText("Mapa sa nakreslí po prvom kole", w / 2, h / 2);
  }
}

// ---------- G-sily ----------
const gTrail = [];
function drawG(lat, lon) {
  const { ctx, w, h } = setupCanvas($("gCanvas"));
  ctx.clearRect(0, 0, w, h);
  const cx = w / 2, cy = h / 2, r = Math.min(w, h) / 2 - 12, maxG = 3;
  ctx.strokeStyle = "#262c3d";
  for (let g = 1; g <= maxG; g++) { ctx.beginPath(); ctx.arc(cx, cy, (r * g) / maxG, 0, Math.PI * 2); ctx.stroke(); }
  ctx.beginPath(); ctx.moveTo(cx - r, cy); ctx.lineTo(cx + r, cy); ctx.moveTo(cx, cy - r); ctx.lineTo(cx, cy + r); ctx.stroke();
  ctx.fillStyle = "#8a93a8"; ctx.font = "10px sans-serif";
  for (let g = 1; g <= maxG; g++) ctx.fillText(`${g}G`, cx + (r * g) / maxG - 14, cy - 3);
  gTrail.push([lat, lon]); if (gTrail.length > 60) gTrail.shift();
  gTrail.forEach(([a, b], i) => {
    ctx.fillStyle = `rgba(10,132,255,${i / gTrail.length * 0.6})`;
    ctx.beginPath(); ctx.arc(cx + (a / maxG) * r, cy - (b / maxG) * r, 3, 0, Math.PI * 2); ctx.fill();
  });
  ctx.fillStyle = "#fff"; ctx.beginPath(); ctx.arc(cx + (lat / maxG) * r, cy - (lon / maxG) * r, 6, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = "#e8ebf2"; ctx.font = "12px monospace";
  ctx.fillText(`${Math.abs(lat).toFixed(2)}G ↔  ${Math.abs(lon).toFixed(2)}G ↕`, 8, h - 8);
}

// ---------- hlavná aktualizácia ----------
let last = {};
let frameCount = 0;
function onFrame(d) {
  last = d;
  const dot = $("dot");
  if (!d.connected) {
    dot.className = "dot";
    $("status").textContent = d.offline ? "Server nebeží – spusti start.bat" : "Čakám na hru… (spusti hru a choď na trať)";
    return;
  }
  dot.className = d.paused ? "dot pause" : "dot on";
  $("status").textContent = `${d.game}${d.paused ? " (pauza)" : ""} · ${d.track || "?"} · ${d.car || "?"}`;
  frameCount++;

  if (d.max_rpm) maxRpmSeen = d.max_rpm; else maxRpmSeen = Math.max(maxRpmSeen, d.rpm);
  updateShift(d.rpm, d.max_rpm);
  $("gear").textContent = gearText(d.gear);
  $("speed").textContent = Math.round(d.speed);
  $("rpm").textContent = Math.round(d.rpm);
  $("maxRpm").textContent = Math.round(d.max_rpm || maxRpmSeen);
  $("rpmFill").style.width = `${Math.min(100, (d.rpm / (d.max_rpm || maxRpmSeen || 1)) * 100)}%`;
  $("flags").innerHTML = d.flag ? `<span style="background:${FLAG_COLORS[d.flag] || "#444"};color:${d.flag === "white" || d.flag === "yellow" ? "#000" : "#fff"}">${FLAG_NAMES[d.flag] || d.flag}</span>` : "";

  $("lapTime").textContent = fmtTime(d.lap_time);
  $("lastLap").textContent = fmtTime(d.last_lap);
  $("bestLap").textContent = fmtTime(d.best_lap);
  $("refLap").textContent = fmtTime(d.ref_time);
  $("lap").textContent = d.total_laps ? `${d.lap + 1} / ${d.total_laps}` : d.lap + 1;
  $("pos").textContent = d.position || "–";
  const gap = (g) => (g ? `${g.toFixed(g < 10 ? 2 : 1)} s` : "–");
  $("gaps").textContent = d.gap_ahead || d.gap_behind ? `${gap(d.gap_ahead)} / ${gap(d.gap_behind)}` : "–";
  const delta = $("delta");
  delta.textContent = d.delta === null || d.delta === undefined ? "bez referencie" : fmtDelta(d.delta);
  delta.className = "delta mono" + (d.delta === null || d.delta === undefined ? " none"
    : d.delta < 0 ? " faster" : d.delta > 0 ? " slower" : "");

  $("compound").textContent = d.tyre_compound || "";
  tyreEls.forEach((t, i) => {
    const temp = d.tyre_temp[i];
    t.t.style.background = tyreColor(temp);
    t.b.style.background = brakeColor(d.brake_temp[i]);
    t.temp.textContent = fmtNum(temp);
    t.p.textContent = fmtNum(d.tyre_pressure[i], 1);
    t.w.textContent = fmtNum(d.tyre_wear[i]);
    t.bt.textContent = fmtNum(d.brake_temp[i]);
  });

  $("throttleBar").style.height = `${d.throttle * 100}%`;
  $("brakeBar").style.height = `${d.brake * 100}%`;
  $("clutchBar").style.height = `${d.clutch * 100}%`;
  $("steerDot").style.left = `${50 + d.steer * 50}%`;
  trace.thr.push(d.throttle); trace.brk.push(d.brake);
  if (trace.thr.length > TRACE_LEN) { trace.thr.shift(); trace.brk.shift(); }

  $("tc").textContent = fmtNum(d.tc, Number.isInteger(d.tc) ? 0 : 2);
  $("tc2").textContent = fmtNum(d.tc2);
  $("abs").textContent = fmtNum(d.abs, Number.isInteger(d.abs) ? 0 : 2);
  $("map").textContent = fmtNum(d.engine_map);
  $("bb").textContent = fmtNum(d.brake_bias, 1);
  $("limiter").textContent = d.pit_limiter ? "ZAP" : "VYP";
  $("limiter").style.color = d.pit_limiter ? "var(--yellow)" : "";
  $("temps").textContent = `${fmtNum(d.air_temp)}° / ${fmtNum(d.track_temp)}°`;
  $("water").textContent = d.water_temp ? `${fmtNum(d.water_temp)}°C` : "–";

  const pct = d.source === "forza";
  $("fuel").textContent = fmtNum(d.fuel, 1);
  $("fuelUnit").textContent = pct ? "%" : "l";
  $("fuelFill").style.width = d.fuel_capacity ? `${(d.fuel / d.fuel_capacity) * 100}%` : "0";
  $("fuelLap").textContent = d.fuel_per_lap ? `${d.fuel_per_lap.toFixed(2)} ${pct ? "%" : "l"}` : "– (po 1. kole)";
  $("fuelLeft").textContent = fmtNum(d.fuel_laps_left, 1);
  $("trackName").textContent = d.track || "";

  if (d.map_version !== mapVersion) { mapVersion = d.map_version; trail = []; loadMap(); }
  lastPos = [d.pos_x, d.pos_z];
  if (frameCount % 3 === 0 && (d.pos_x || d.pos_z)) {
    trail.push(lastPos);
    if (trail.length > 3000) trail.shift();
  }
}

function render() {
  if (last.connected) {
    drawTrace();
    drawG(last.g_lat || 0, last.g_lon || 0);
  }
  requestAnimationFrame(render);
}
setInterval(() => { if (last.connected) drawMap(); }, 100);
drawMap();
render();

connectWS((d) => { onFrame(d); engineer.frame(d); }, (msg) => {
  if (msg.type === "lap") {
    toast(`Kolo ${msg.data.lap} uložené: ${fmtTime(msg.data.time)}`);
    engineer.lap(msg.data);
  }
  if (msg.type === "corner_stats") engineer.corner(msg.data);
});
engineer.setupUI();

// ---------- nová verzia na GitHube ----------
getJSON("/api/update").then((u) => {
  $("version").textContent = `Verzia ${u.current}`;
  let dismissed = "";
  try { dismissed = localStorage.getItem("updateDismissed") || ""; } catch { /* nevadí */ }
  if (!u.update || dismissed === u.latest) return;
  $("updVer").textContent = u.latest;
  $("updCur").textContent = u.current;
  $("updLink").href = u.url;
  if (u.can_install) {
    // .exe sa vie vymeniť sám: stiahne, zavrie sa a spustí novú verziu
    $("updLink").textContent = "Čo je nové";
    $("updLink").classList.remove("primary");
    $("updInstall").hidden = false;
    $("updInstall").onclick = async () => {
      if (!confirm(`Stiahnuť verziu ${u.latest} a reštartovať aplikáciu? Kolá a nastavenia ostanú.`)) return;
      const b = $("updInstall");
      b.disabled = true;
      b.textContent = "⏳ Sťahujem…";
      try {
        await getJSON("/api/update/install", { method: "POST" });
        b.textContent = "✓ Reštartujem…";
        toast("Aplikácia sa o chvíľu zavrie a spustí nová verzia");
      } catch (e) {
        b.disabled = false;
        b.textContent = "⬇ Aktualizovať teraz";
        toast(`Aktualizácia zlyhala: ${e.message}`);
      }
    };
  }
  $("update").hidden = false;
  $("updClose").onclick = () => {
    $("update").hidden = true;
    try { localStorage.setItem("updateDismissed", u.latest); } catch { /* nevadí */ }
  };
}).catch(() => {});

// ---------- modály ----------
document.querySelectorAll("[data-close]").forEach((b) =>
  b.addEventListener("click", () => b.closest(".modal-bg").classList.remove("open")));
document.querySelectorAll(".modal-bg").forEach((m) =>
  m.addEventListener("click", (e) => { if (e.target === m) m.classList.remove("open"); }));

setupFullscreen($("fs"));

$("phoneBtn").onclick = async () => {
  const info = await getJSON("/api/info");
  $("qr").innerHTML = info.qr || "";
  $("qr").style.display = info.qr ? "" : "none";
  $("urls").innerHTML = info.urls.map((u) => `<a href="${u}" target="_blank">${u}</a>`).join("") || "Nenašiel som IP adresu siete.";
  $("wheelQr").innerHTML = info.wheel_qr || "";
  $("wheelQr").style.display = info.wheel_qr ? "" : "none";
  $("wheelUrls").innerHTML = info.wheel_urls.map((u) => `<a href="${u}" target="_blank">${u}</a>`).join("")
    || "HTTPS nie je zapnuté (chýba balík cryptography).";
  $("displayQr").innerHTML = info.display_qr || "";
  $("displayQr").style.display = info.display_qr ? "" : "none";
  $("displayUrls").innerHTML = info.display_urls.map((u) => `<a href="${u}" target="_blank">${u}</a>`).join("");
  $("padWarn").hidden = !info.pad.error;
  $("padWarn").textContent = info.pad.error ? `⚠ ${info.pad.error}` : "";
  $("phoneModal").classList.add("open");
};

let sourceNames = {};
$("settingsBtn").onclick = async () => {
  const [s, info] = await Promise.all([getJSON("/api/settings"), getJSON("/api/info")]);
  sourceNames = info.sources;
  $("sourceList").innerHTML = Object.entries(sourceNames).map(([id, name]) =>
    `<label><input type="checkbox" data-src="${id}" ${s.sources[id] ? "checked" : ""}> ${id === "demo" ? "Demo (simulácia bez hry)" : name}</label>`).join("");
  $("f1Port").value = s.f1_port;
  $("forzaPort").value = s.forza_port;
  $("gt7Ip").value = s.gt7_ip;
  $("saveSettings").disabled = !info.local;
  $("settingsModal").classList.add("open");
};
$("saveSettings").onclick = async () => {
  const sources = {};
  document.querySelectorAll("[data-src]").forEach((c) => { sources[c.dataset.src] = c.checked; });
  try {
    await getJSON("/api/settings", { method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sources, f1_port: +$("f1Port").value, forza_port: +$("forzaPort").value, gt7_ip: $("gt7Ip").value }) });
    $("settingsModal").classList.remove("open");
    toast("Nastavenia uložené");
  } catch (e) { toast(`Chyba: ${e.message}`); }
};

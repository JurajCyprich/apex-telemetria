// Nastavenie volantu na mobile z PC: živý náklon, pedále a tlačidlá + všetky nastavenia volantu.
// Funguje aj bez spustenej hry – mobil posiela svoj stav každých 100 ms, zmeny sa uložia v mobile.
const wheelCfg = (() => {
  const $ = (id) => document.getElementById(id);
  const wheels = new Map();  // id -> posledný stav z mobilu
  let sel = null;            // vybraný mobil
  let editProfile = null;    // upravovaný profil zatáčania
  let lockUntil = 0;         // počas ťahania posuvníka neprepisujeme formulár hodnotami z mobilu
  let send = () => {};
  const timers = {};

  const STEER = {
    range: { id: "wcRange", fmt: (v) => `${v}°` },
    lin: { id: "wcLin", fmt: (v) => Number(v).toFixed(1) },
    smooth: { id: "wcSmooth", fmt: (v) => `${v} %` },
    dead: { id: "wcDead", fmt: (v) => `${v} %` },
    anti: { id: "wcAnti", fmt: (v) => `${v} %` },
  };
  const GLOBAL = {
    curve: { id: "wcCurve", fmt: (v) => Number(v).toFixed(1) },
    rumbleGain: { id: "wcGain", fmt: (v) => `${v} %` },
  };
  const CHECKS = { rumble: "wcRumble", fx: "wcFx", vibrate: "wcVibrate", say: "wcSay", rumbleFx: "wcRumbleFx" };
  const BUTTONS = [["lb", "◀ LB"], ["rb", "RB ▶"], ["a", "A"], ["b", "B"], ["x", "X"], ["y", "Y"], ["back", "⧉"], ["start", "☰"]];

  const isOpen = () => $("wheelModal").classList.contains("open");
  const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");

  function deviceName(w) {
    const ua = w.ua || "";
    const dev = /iPhone/.test(ua) ? "iPhone" : /iPad/.test(ua) ? "iPad" : /Android/.test(ua) ? "Android" : "Mobil";
    return `${dev} · ${w.app ? "appka Apex Volant" : "prehliadač"} · ${w.ip}`;
  }

  function onState(m) {
    m.at = Date.now();
    wheels.set(m.id, m);
    if (sel === null || !wheels.has(sel)) sel = m.id;
    info();
    if (isOpen()) render();
  }

  function onGone(id) {
    wheels.delete(id);
    if (sel === id) sel = wheels.size ? wheels.keys().next().value : null;
    info();
    if (isOpen()) render();
  }

  // mobil zamkol obrazovku alebo stratil Wi-Fi – po 3 s bez hlásenia ho berieme ako odpojený
  setInterval(() => {
    for (const [id, w] of wheels) if (Date.now() - w.at > 3000) onGone(id);
  }, 1000);

  function info() {
    const text = wheels.size
      ? `Pripojený volant: ${[...wheels.values()].map(deviceName).join(", ")}`
      : "Žiadny volant nie je pripojený – otvor na mobile volant (appka Apex Volant alebo stránka volantu).";
    for (const id of ["wcSettingsInfo", "wcPhoneInfo"]) if ($(id)) $(id).textContent = text;
  }

  // rovnaký výpočet ako na mobile: náklon -> výchylka páčky
  function shape(deg, p) {
    let s = Math.min(1, Math.abs(deg) / (p.range / 2));
    const dz = p.dead / 100;
    if (s <= dz) return 0;
    s = (s - dz) / (1 - dz);
    s **= p.lin;
    const anti = p.anti / 100;
    s = anti + (1 - anti) * s;
    return Math.sign(deg) * s;
  }

  function render() {
    const w = sel !== null ? wheels.get(sel) : null;
    $("wcNone").hidden = !!w;
    $("wcBody").hidden = !w;
    const opts = [...wheels.values()].map((x) => `<option value="${x.id}">${deviceName(x)}</option>`).join("");
    if ($("wcDevice").innerHTML !== opts) $("wcDevice").innerHTML = opts;
    if (!w) return;
    $("wcDevice").value = String(sel);
    const pad = w.pad || {};
    $("wcStatus").innerHTML = [
      w.running ? `<span class="ok">● beží</span>` : `<span class="warn">● na mobile ťukni ▶ Štart</span>`,
      `senzor: ${w.sensor || "–"}${w.flat ? " (mobil leží naplocho)" : ""}`,
      pad.error ? `<span class="warn">Xbox ovládač: ${pad.error}</span>`
        : pad.ready ? `<span class="ok">virtuálny Xbox ovládač vo Windows: OK</span>` : "Xbox ovládač sa vytvorí po ▶ Štart",
    ].join(" · ");
    drawWheel(w);
    $("wcOutFill").style.left = `${50 + Math.min(0, w.out) * 50}%`;
    $("wcOutFill").style.width = `${Math.abs(w.out) * 50}%`;
    $("wcOutVal").textContent = `${Math.round(w.out * 100)} %`;
    $("wcThr").style.height = `${w.thr * 100}%`;
    $("wcBrk").style.height = `${w.brk * 100}%`;
    $("wcThrVal").textContent = Math.round(w.thr * 100);
    $("wcBrkVal").textContent = Math.round(w.brk * 100);
    $("wcRumbleBar").style.width = `${(w.rumble || 0) * 100}%`;
    const pressed = new Set(w.btn || []);
    $("wcButtons").innerHTML = BUTTONS.map(([k, l]) => `<span class="${pressed.has(k) ? "on" : ""}">${l}</span>`).join("");
    if (Date.now() > lockUntil) fillForm(w);
    drawCurve(w);
  }

  function drawWheel(w) {
    const { ctx, w: cw, h } = setupCanvas($("wcWheel"));
    ctx.clearRect(0, 0, cw, h);
    const cx = cw / 2, cy = h / 2, r = Math.min(cw, h) / 2 - 10;
    if (r <= 0) return;  // okno ešte nie je zobrazené
    const ang = w.angle === null ? 0 : Math.max(-180, Math.min(180, w.angle));
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate((ang * Math.PI) / 180);
    ctx.strokeStyle = w.angle === null ? "#3a4258" : w.flat ? "#ff9f0a" : "#e8ebf2";
    ctx.lineWidth = 12;
    ctx.beginPath(); ctx.arc(0, 0, r, 0, Math.PI * 2); ctx.stroke();
    ctx.lineWidth = 8;
    ctx.beginPath();
    ctx.moveTo(-r, 0); ctx.lineTo(r, 0);
    ctx.moveTo(0, 0); ctx.lineTo(0, r);
    ctx.stroke();
    ctx.fillStyle = "#ff3b30";
    ctx.fillRect(-5, -r - 8, 10, 16);  // značka hore
    ctx.restore();
    ctx.fillStyle = "#e8ebf2";
    ctx.font = "bold 16px Consolas, monospace";
    ctx.textAlign = "center";
    ctx.fillText(w.angle === null ? "náklon –" : `${w.angle.toFixed(1)}°`, cx, cy + r * 0.62);
  }

  function profileParams(w) {
    return { ...w.defaults, ...(w.profiles[editProfile] || {}) };
  }

  function drawCurve(w) {
    const p = profileParams(w);
    const { ctx, w: cw, h } = setupCanvas($("wcCurve2"));
    ctx.clearRect(0, 0, cw, h);
    const pad = 8, half = p.range / 2;
    const X = (deg) => cw / 2 + (deg / half) * (cw / 2 - pad);
    const Y = (v) => h / 2 - v * (h / 2 - pad);
    ctx.strokeStyle = "#262c3d"; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(0, h / 2); ctx.lineTo(cw, h / 2); ctx.moveTo(cw / 2, 0); ctx.lineTo(cw / 2, h); ctx.stroke();
    ctx.strokeStyle = "#0a84ff"; ctx.lineWidth = 2;
    ctx.beginPath();
    for (let i = 0; i <= 120; i++) {
      const deg = -half + (i / 120) * 2 * half;
      const v = shape(deg, p);
      i ? ctx.lineTo(X(deg), Y(v)) : ctx.moveTo(X(deg), Y(v));
    }
    ctx.stroke();
    if (w.angle !== null && editProfile === w.profile) {
      const deg = Math.max(-half, Math.min(half, w.angle));
      ctx.fillStyle = "#ffd60a";
      ctx.beginPath(); ctx.arc(X(deg), Y(shape(deg, p)), 5, 0, Math.PI * 2); ctx.fill();
    }
    ctx.fillStyle = "#8a93a8"; ctx.font = "11px sans-serif"; ctx.textAlign = "left";
    ctx.fillText(`náklon ±${half}° → výchylka páčky`, 6, 14);
  }

  function fillForm(w) {
    const names = Object.keys(w.profiles);
    if (!editProfile || !names.includes(editProfile)) editProfile = w.profile;
    const opts = names.map((n) => `<option value="${esc(n)}">${esc(n)}${n === w.profile ? " (práve aktívny)" : ""}</option>`).join("");
    if ($("wcProfile").innerHTML !== opts) $("wcProfile").innerHTML = opts;
    $("wcProfile").value = editProfile;
    const p = profileParams(w);
    for (const [k, f] of Object.entries(STEER)) {
      $(f.id).value = p[k];
      $(`${f.id}V`).textContent = f.fmt(p[k]);
    }
    $("wcInvert").checked = !!p.invert;
    for (const [k, f] of Object.entries(GLOBAL)) {
      $(f.id).value = w.cfg[k];
      $(`${f.id}V`).textContent = f.fmt(w.cfg[k]);
    }
    for (const [k, id] of Object.entries(CHECKS)) $(id).checked = !!w.cfg[k];
    $("wcStyle").value = w.cfg.style;
  }

  // zmena na PC -> mobil (krátko odložené, aby ťahanie posuvníka neposielalo stovky správ)
  function push(key, msg) {
    lockUntil = Date.now() + 1500;
    clearTimeout(timers[key]);
    timers[key] = setTimeout(() => send({ type: "wheel_cmd", id: sel, ...msg }), 120);
  }

  function setup(sender) {
    send = sender;
    const openModal = () => { lockUntil = 0; $("wheelModal").classList.add("open"); render(); };
    for (const id of ["wcOpen", "wcOpen2"]) if ($(id)) $(id).addEventListener("click", openModal);
    $("wcDevice").addEventListener("change", (e) => { sel = Number(e.target.value); editProfile = null; lockUntil = 0; render(); });
    $("wcProfile").addEventListener("change", (e) => { editProfile = e.target.value; lockUntil = 0; render(); });
    for (const [k, f] of Object.entries(STEER)) {
      $(f.id).addEventListener("input", (e) => {
        const v = Number(e.target.value);
        $(`${f.id}V`).textContent = f.fmt(v);
        const w = wheels.get(sel);
        if (w) { w.profiles[editProfile] = { ...profileParams(w), [k]: v }; drawCurve(w); }
        push(`sp-${k}`, { op: "set", profile: editProfile, sp: { [k]: v } });
      });
    }
    $("wcInvert").addEventListener("change", (e) => push("sp-invert", { op: "set", profile: editProfile, sp: { invert: e.target.checked } }));
    for (const [k, f] of Object.entries(GLOBAL)) {
      $(f.id).addEventListener("input", (e) => {
        const v = Number(e.target.value);
        $(`${f.id}V`).textContent = f.fmt(v);
        push(`cfg-${k}`, { op: "set", cfg: { [k]: v } });
      });
    }
    for (const [k, id] of Object.entries(CHECKS)) {
      $(id).addEventListener("change", (e) => push(`cfg-${k}`, { op: "set", cfg: { [k]: e.target.checked } }));
    }
    $("wcStyle").addEventListener("change", (e) => push("cfg-style", { op: "set", cfg: { style: e.target.value } }));
    $("wcCalib").addEventListener("click", () => send({ type: "wheel_cmd", id: sel, op: "calibrate" }));
    $("wcTest").addEventListener("click", () => send({ type: "wheel_cmd", id: sel, op: "test" }));
    $("wcReset").addEventListener("click", () => {
      if (!confirm(`Vrátiť profil „${editProfile}“ na predvolené hodnoty?`)) return;
      lockUntil = 0;
      send({ type: "wheel_cmd", id: sel, op: "reset", profile: editProfile });
    });
    info();
  }

  return { onState, onGone, setup };
})();

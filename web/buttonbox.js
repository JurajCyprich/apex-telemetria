const $ = (id) => document.getElementById(id);
const COLORS = ["", "red", "blue", "yellow", "green", "orange", "purple"];
const COLOR_NAMES = { "": "sivá", red: "červená", blue: "modrá", yellow: "žltá", green: "zelená", orange: "oranžová", purple: "fialová" };
const VALUES = { "": "–", tc: "TC", tc2: "TC2", abs: "ABS", engine_map: "Mapa motora", brake_bias: "Brzdový balans",
  pit_limiter: "Pit limiter", lights: "Svetlá", wipers: "Stierače", rain_lights: "Dažďové svetlo", drs: "DRS" };

let cfg = null;
let profileId = null;
let telemetry = {};
const keyEls = [];

const ws = connectWS(onFrame);

async function load() {
  cfg = await getJSON("/api/buttonbox");
  const saved = localStorage.getItem("bb-profile");
  profileId = cfg.profiles[saved] ? saved : cfg.profiles[cfg.active] ? cfg.active : Object.keys(cfg.profiles)[0];
  $("editBtn").hidden = !cfg.can_edit;
  $("homeLink").hidden = !cfg.can_edit;
  $("keyList").innerHTML = cfg.keys.map((k) => `<option value="${k}">`).join("");
  renderProfiles();
  renderGrid();
}

function renderProfiles() {
  $("profile").innerHTML = Object.entries(cfg.profiles)
    .map(([id, p]) => `<option value="${id}" ${id === profileId ? "selected" : ""}>${escapeHtml(p.name)}</option>`).join("");
}

$("profile").onchange = (e) => {
  profileId = e.target.value;
  try { localStorage.setItem("bb-profile", profileId); } catch { /* súkromné okno */ }
  renderGrid();
};

function escapeHtml(s) {
  return String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
}

function renderGrid() {
  const prof = cfg.profiles[profileId];
  const grid = $("grid");
  grid.innerHTML = "";
  keyEls.length = 0;
  if (!prof || !prof.buttons.length) {
    grid.innerHTML = `<div class="empty">Profil nemá tlačidlá. ${cfg.can_edit ? "Klikni na ✎ Upraviť." : "Uprav ho na PC."}</div>`;
    return;
  }
  layoutGrid();
  for (const b of prof.buttons) {
    const el = document.createElement("button");
    el.className = `key ${b.color ? "c-" + b.color : ""}`;
    el.innerHTML = `<span>${escapeHtml(b.label)}</span>${b.value ? '<span class="val">–</span>' : ""}${cfg.can_edit ? `<span class="kb">${escapeHtml(b.key)}</span>` : ""}`;
    bindPress(el, b);
    grid.appendChild(el);
    keyEls.push({ el, b, val: el.querySelector(".val") });
  }
  updateValues();
}

// na šírku (mobil otočený) pridáme stĺpce, aby sa všetko zmestilo bez posúvania
function layoutGrid() {
  const prof = cfg && cfg.profiles[profileId];
  if (!prof) return;
  const grid = $("grid");
  let cols = prof.columns || 4;
  const n = prof.buttons.length;
  const rowsFit = Math.max(2, Math.floor(grid.clientHeight / 62));
  if (window.innerWidth > window.innerHeight && Math.ceil(n / cols) > rowsFit) {
    cols = Math.ceil(n / rowsFit);
    if (cols % 2) cols++; // párne, aby páry „−/+“ zostali vedľa seba
    cols = Math.min(8, cols);
  }
  grid.style.gridTemplateColumns = `repeat(${cols}, minmax(0, 1fr))`;
}
window.addEventListener("resize", layoutGrid);

function bindPress(el, b) {
  let pressed = false;
  const down = (e) => {
    e.preventDefault();
    if (pressed) return;
    pressed = true;
    el.classList.add("down");
    if (navigator.vibrate) navigator.vibrate(15);
    ws.send({ type: "press", profile: profileId, id: b.id, action: b.mode === "hold" ? "down" : "tap" });
  };
  const up = (e) => {
    if (!pressed) return;
    e.preventDefault();
    pressed = false;
    el.classList.remove("down");
    if (b.mode === "hold") ws.send({ type: "press", profile: profileId, id: b.id, action: "up" });
  };
  el.addEventListener("pointerdown", (e) => { el.setPointerCapture(e.pointerId); down(e); });
  el.addEventListener("pointerup", up);
  el.addEventListener("pointercancel", up);
  el.addEventListener("contextmenu", (e) => e.preventDefault());
}

function valueText(field, d) {
  const v = d[field];
  if (v === null || v === undefined) return "–";
  if (typeof v === "boolean") return v ? "ZAP" : "VYP";
  if (field === "brake_bias") return Number(v).toFixed(1);
  return Number.isInteger(v) ? String(v) : Number(v).toFixed(2);
}

function updateValues() {
  const d = telemetry;
  for (const { el, b, val } of keyEls) {
    if (!val) continue;
    val.textContent = d.connected ? valueText(b.value, d) : "–";
    el.classList.toggle("on", !!d.connected && d[b.value] === true);
  }
}

function onFrame(d) {
  telemetry = d;
  $("dot").className = d.connected ? (d.paused ? "dot pause" : "dot on") : "dot";
  if (d.connected) {
    $("gear").textContent = gearText(d.gear);
    $("speed").textContent = Math.round(d.speed);
    $("v_tc").textContent = fmtNum(d.tc, Number.isInteger(d.tc) ? 0 : 1);
    $("v_abs").textContent = fmtNum(d.abs, Number.isInteger(d.abs) ? 0 : 1);
    $("v_map").textContent = fmtNum(d.engine_map);
    $("v_bb").textContent = fmtNum(d.brake_bias, 1);
    $("v_fuel").textContent = d.fuel_laps_left ? `${d.fuel_laps_left.toFixed(1)} k` : fmtNum(d.fuel, 1);
    const dl = $("v_delta");
    dl.textContent = d.delta === null || d.delta === undefined ? "–" : fmtDelta(d.delta);
    dl.style.color = d.delta < 0 ? "var(--green)" : d.delta > 0 ? "var(--red)" : "";
  }
  updateValues();
}

setupFullscreen($("fs"));

// ---------- editor (len na PC) ----------
let draft = null;
let draftProfile = null;

$("editBtn").onclick = () => {
  draft = JSON.parse(JSON.stringify(cfg));
  draftProfile = profileId;
  openEditor();
};

function openEditor() {
  const p = draft.profiles[draftProfile];
  $("profName").value = p.name;
  $("profCols").value = p.columns || 4;
  $("holdMs").value = draft.hold_ms || 60;
  renderRows();
  $("editor").classList.add("open");
}

function renderRows() {
  const p = draft.profiles[draftProfile];
  $("edRows").innerHTML = p.buttons.map((b, i) => `
    <tr data-i="${i}">
      <td><button class="btn small" data-act="up">▲</button><button class="btn small" data-act="down">▼</button></td>
      <td><input type="text" data-f="label" value="${escapeHtml(b.label)}"></td>
      <td><div class="keycell"><input type="text" data-f="key" list="keyList" value="${escapeHtml(b.key)}"><button class="btn small" data-act="rec" title="Stlač klávesu na klávesnici">⌨</button></div></td>
      <td><select data-f="mode"><option value="tap" ${b.mode !== "hold" ? "selected" : ""}>stlačiť</option><option value="hold" ${b.mode === "hold" ? "selected" : ""}>držať</option></select></td>
      <td><select data-f="color">${COLORS.map((c) => `<option value="${c}" ${c === (b.color || "") ? "selected" : ""}>${COLOR_NAMES[c]}</option>`).join("")}</select></td>
      <td><select data-f="value">${Object.entries(VALUES).map(([k, n]) => `<option value="${k}" ${k === (b.value || "") ? "selected" : ""}>${n}</option>`).join("")}</select></td>
      <td><button class="btn small" data-act="del">✕</button></td>
    </tr>`).join("");
}

$("edRows").addEventListener("input", (e) => {
  const tr = e.target.closest("tr");
  const f = e.target.dataset.f;
  if (!tr || !f) return;
  const b = draft.profiles[draftProfile].buttons[+tr.dataset.i];
  if (f === "value" && !e.target.value) delete b.value;
  else b[f] = e.target.value;
});

$("edRows").addEventListener("click", (e) => {
  const act = e.target.dataset.act;
  if (!act) return;
  const tr = e.target.closest("tr");
  const i = +tr.dataset.i;
  const list = draft.profiles[draftProfile].buttons;
  if (act === "del") list.splice(i, 1);
  else if (act === "up" && i > 0) [list[i - 1], list[i]] = [list[i], list[i - 1]];
  else if (act === "down" && i < list.length - 1) [list[i + 1], list[i]] = [list[i], list[i + 1]];
  else if (act === "rec") { recordKey(e.target, tr.querySelector('[data-f="key"]'), list[i]); return; }
  renderRows();
});

const CODE_MAP = {
  Escape: "esc", Minus: "minus", Equal: "equals", Backspace: "backspace", Tab: "tab", BracketLeft: "[",
  BracketRight: "]", Enter: "enter", Semicolon: ";", Quote: "'", Backquote: "`", Backslash: "\\",
  Comma: ",", Period: ".", Slash: "/", Space: "space", CapsLock: "capslock", ScrollLock: "scrolllock",
  NumpadMultiply: "num*", NumpadSubtract: "num-", NumpadAdd: "num+", NumpadDecimal: "num.",
  NumpadEnter: "numenter", NumpadDivide: "num/", Home: "home", End: "end", PageUp: "pageup",
  PageDown: "pagedown", Insert: "insert", Delete: "delete", ArrowUp: "up", ArrowDown: "down",
  ArrowLeft: "left", ArrowRight: "right",
};
function codeToKey(code) {
  if (CODE_MAP[code]) return CODE_MAP[code];
  let m;
  if ((m = code.match(/^Key([A-Z])$/))) return m[1].toLowerCase();
  if ((m = code.match(/^Digit(\d)$/))) return m[1];
  if ((m = code.match(/^Numpad(\d)$/))) return `num${m[1]}`;
  if ((m = code.match(/^F(\d+)$/))) return `f${m[1]}`;
  return null;
}

function recordKey(btn, input, b) {
  btn.classList.add("rec");
  btn.textContent = "…";
  const handler = (e) => {
    if (["ControlLeft", "ControlRight", "ShiftLeft", "ShiftRight", "AltLeft", "AltRight"].includes(e.code)) return;
    e.preventDefault();
    const k = codeToKey(e.code);
    window.removeEventListener("keydown", handler, true);
    btn.classList.remove("rec");
    btn.textContent = "⌨";
    if (!k) { toast(`Klávesa ${e.code} nie je podporovaná`); return; }
    const mods = [e.ctrlKey && "ctrl", e.shiftKey && "shift", e.altKey && "alt"].filter(Boolean);
    b.key = [...mods, k].join("+");
    input.value = b.key;
  };
  window.addEventListener("keydown", handler, true);
}

$("profName").oninput = (e) => { draft.profiles[draftProfile].name = e.target.value; };
$("profCols").oninput = (e) => { draft.profiles[draftProfile].columns = Math.max(2, Math.min(8, +e.target.value || 4)); };
$("holdMs").oninput = (e) => { draft.hold_ms = Math.max(20, Math.min(500, +e.target.value || 60)); };
$("addBtn").onclick = () => {
  draft.profiles[draftProfile].buttons.push({ id: `b${Date.now()}`, label: "NOVÉ", key: "", mode: "tap", color: "" });
  renderRows();
};
$("newProf").onclick = () => {
  const id = `p${Date.now()}`;
  draft.profiles[id] = { name: "Nový profil", columns: 4, buttons: [] };
  draftProfile = id;
  openEditor();
};
$("delProf").onclick = () => {
  if (Object.keys(draft.profiles).length <= 1) { toast("Posledný profil sa nedá zmazať"); return; }
  if (!confirm(`Zmazať profil „${draft.profiles[draftProfile].name}“?`)) return;
  delete draft.profiles[draftProfile];
  draftProfile = Object.keys(draft.profiles)[0];
  openEditor();
};
document.querySelectorAll("[data-close]").forEach((b) => b.onclick = () => $("editor").classList.remove("open"));

$("saveBB").onclick = async () => {
  draft.active = draftProfile;
  try {
    await getJSON("/api/buttonbox", { method: "PUT", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ active: draft.active, hold_ms: draft.hold_ms, profiles: draft.profiles }) });
    $("editor").classList.remove("open");
    profileId = draftProfile;
    try { localStorage.setItem("bb-profile", profileId); } catch { /* nič */ }
    await load();
    toast("Uložené");
  } catch (e) { toast(`Chyba: ${e.message}`); }
};

load().catch((e) => toast(`Nepodarilo sa načítať: ${e.message}`));

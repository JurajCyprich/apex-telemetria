// Hlasový pretekársky inžinier: hlási časy kôl, palivo, vlajky a zabudnutý pit limiter.
// Hovorí hlasom Windows cez speechSynthesis (slovenský hlas, inak český, inak čokoľvek).
const engineer = (() => {
  const DEFAULTS = { on: false, voice: "", volume: 1, rate: 1.05, laps: true, fuel: true, flags: true, pit: true };
  const cfg = { ...DEFAULTS };
  try { Object.assign(cfg, JSON.parse(localStorage.getItem("engineer") || "{}")); } catch { /* bez úložiska */ }
  const save = () => { try { localStorage.setItem("engineer", JSON.stringify(cfg)); } catch { /* nevadí */ } };
  const supported = "speechSynthesis" in window;

  let voices = [];
  function loadVoices() { voices = supported ? speechSynthesis.getVoices() : []; }
  if (supported) {
    loadVoices();
    speechSynthesis.addEventListener("voiceschanged", loadVoices);
  }
  const localVoice = () => voices.find((v) => /^sk/i.test(v.lang)) || voices.find((v) => /^cs/i.test(v.lang));
  const pickVoice = () => voices.find((v) => v.name === cfg.voice) || localVoice() || voices[0];

  // prehliadač niekedy pustí reč až po prvom kliknutí na stránku – "odomkneme" ju tichou vetou
  const unlock = () => {
    if (!supported) return;
    const u = new SpeechSynthesisUtterance(" ");
    u.volume = 0;
    speechSynthesis.speak(u);
  };
  addEventListener("pointerdown", unlock, { once: true });
  addEventListener("keydown", unlock, { once: true });

  const lastSaid = {};
  function say(text, key, minGapMs = 0, force = false) {
    if (!supported || (!cfg.on && !force)) return;
    const now = Date.now();
    if (key && now - (lastSaid[key] || 0) < minGapMs) return;
    if (key) lastSaid[key] = now;
    if (speechSynthesis.pending) speechSynthesis.cancel();  // staré hlásenia už nie sú aktuálne
    const u = new SpeechSynthesisUtterance(text);
    const v = pickVoice();
    if (v) { u.voice = v; u.lang = v.lang; } else u.lang = "sk-SK";
    u.volume = cfg.volume;
    u.rate = cfg.rate;
    speechSynthesis.speak(u);
  }

  // ---------- slovné tvary ----------
  const plural = (n, one, few, many) => (n === 1 ? one : n >= 2 && n <= 4 ? few : many);
  const num = (x, digits) => x.toFixed(digits).replace(".", ",");
  function spokenTime(s) {
    const m = Math.floor(s / 60);
    const sec = s - m * 60;
    if (!m) return num(sec, 1);
    const whole = Math.floor(sec);
    const tenth = Math.floor((sec - whole) * 10);
    return `${m} ${whole < 10 ? `nula ${whole}` : whole} ${tenth}`;  // ako inžinier: "1 23 4"
  }
  const spokenGap = (d) => `${num(Math.abs(d), Math.abs(d) < 1 ? 2 : 1)} ${Math.abs(d) < 1 ? "" : "sekundy "}`.trim();

  // ---------- udalosti ----------
  const FLAGS = { yellow: "Žltá vlajka", blue: "Modrá vlajka", black: "Čierna vlajka", white: "Biela vlajka",
    checkered: "Cieľ! Pekná jazda.", penalty: "Penalta", orange: "Oranžová vlajka, máš poškodenie" };
  let last = {};
  let prevRef = null;     // najlepšie uložené kolo pred práve dokončeným kolom
  let flag = { shown: "", cand: "", since: 0 };
  let pitSince = 0;

  function frame(d) {
    if (!d.connected) {
      flag = { shown: "", cand: "", since: 0 };
      pitSince = 0;
      last = d;
      return;
    }
    if (d.ref_time) prevRef = d.ref_time;
    const now = Date.now();

    // vlajky – ohlásime až keď vydrží 0,4 s (niektoré hry krátko preblikávajú)
    const f = d.flag || "";
    if (f !== flag.cand) flag = { ...flag, cand: f, since: now };
    if (flag.cand !== flag.shown && now - flag.since > 400) {
      if (cfg.flags) {
        if (FLAGS[flag.cand]) say(FLAGS[flag.cand], `flag-${flag.cand}`, 8000);
        else if ((flag.cand === "green" || !flag.cand) && ["yellow", "blue", "black"].includes(flag.shown)) {
          say("Zelená, trať je voľná", "flag-green", 8000);
        }
      }
      flag.shown = flag.cand;
    }

    // v boxovej uličke bez pit limitera
    if (d.in_pit && !d.pit_limiter && d.speed > 30) {
      if (!pitSince) pitSince = now;
      if (cfg.pit && now - pitSince > 1000) say("Pit limiter!", "pit", 15000);
    } else {
      pitSince = 0;
    }
    last = d;
  }

  function lap(info) {
    const t = info.time;
    if (cfg.laps && t > 0) {
      let text = `Kolo ${spokenTime(t)}.`;
      if (prevRef && t < prevRef - 0.0005) text = `Najlepšie kolo! ${spokenTime(t)}. O ${spokenGap(prevRef - t)} rýchlejšie.`;
      else if (prevRef && t - prevRef < 0.05) text = `${spokenTime(t)}. Takmer rovnako ako najlepšie.`;
      else if (prevRef) text = `${spokenTime(t)}. O ${spokenGap(t - prevRef)} pomalšie.`;
      say(text);
    }
    if (prevRef === null || t < prevRef) prevRef = t;
    // palivo – údaje o spotrebe prídu s ďalším snímkom, preto chvíľu počkáme
    setTimeout(() => {
      const left = last.fuel_laps_left;
      if (!cfg.fuel || !left) return;
      if (left < 1) say("Palivo dochádza, choď do boxov.", "fuel-low", 20000);  // vlastný kľúč – nesmie ho zablokovať bežné hlásenie
      else if (left < 3.5) {
        const n = Math.floor(left);
        say(`Palivo na ${n} ${plural(n, "kolo", "kolá", "kôl")}.`, "fuel", 20000);
      }
    }, 1500);
  }

  // ---------- nastavenia ----------
  function setupUI() {
    const $ = (id) => document.getElementById(id);
    const btn = $("engBtn");
    const syncBtn = () => {
      btn.classList.toggle("on", cfg.on);
      btn.textContent = cfg.on ? "🔊 Inžinier" : "🔈 Inžinier";
    };
    syncBtn();
    if (!supported) {
      btn.title = "Tento prehliadač nevie čítať text nahlas";
      btn.disabled = true;
      return;
    }

    const fill = () => {
      const sel = $("engVoice");
      const cur = pickVoice();
      sel.innerHTML = voices.map((v) => `<option value="${v.name}">${v.name} (${v.lang})</option>`).join("")
        || "<option value=''>Žiadny hlas</option>";
      if (cur) sel.value = cur.name;
      $("engNoLocal").hidden = !!localVoice() || !voices.length;
      $("engOn").checked = cfg.on;
      for (const k of ["laps", "fuel", "flags", "pit"]) $(`eng_${k}`).checked = cfg[k];
      $("engVolume").value = cfg.volume;
      $("engRate").value = cfg.rate;
    };
    if (supported) speechSynthesis.addEventListener("voiceschanged", () => {
      if ($("engModal").classList.contains("open")) fill();
    });

    btn.addEventListener("click", () => { fill(); $("engModal").classList.add("open"); });
    $("engOn").addEventListener("change", (e) => { cfg.on = e.target.checked; save(); syncBtn(); });
    $("engVoice").addEventListener("change", (e) => { cfg.voice = e.target.value; save(); });
    $("engVolume").addEventListener("input", (e) => { cfg.volume = +e.target.value; save(); });
    $("engRate").addEventListener("input", (e) => { cfg.rate = +e.target.value; save(); });
    for (const k of ["laps", "fuel", "flags", "pit"]) {
      $(`eng_${k}`).addEventListener("change", (e) => { cfg[k] = e.target.checked; save(); });
    }
    $("engTest").addEventListener("click", () => {
      say(`Rádio funguje. Najlepšie kolo! ${spokenTime(83.47)}. O ${spokenGap(0.23)} rýchlejšie. Palivo na 3 kolá.`,
        null, 0, true);
    });
  }

  return { frame, lap, say, setupUI, spokenTime, spokenGap };
})();

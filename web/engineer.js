// Hlasový pretekársky inžinier: hlási časy kôl, palivo, vlajky a zabudnutý pit limiter.
// Hovorí hlasom Windows cez speechSynthesis. Jazyk viet sa riadi hlasom (slovenský/český hlas ->
// slovenčina, inak angličtina), alebo ho určí používateľ v nastaveniach.
const engineer = (() => {
  const DEFAULTS = { on: false, voice: "", lang: "auto", volume: 1, rate: 1.05,
    laps: true, fuel: true, flags: true, pit: true, corners: true, cornerLead: 3, cornerNum: true,
    coach: true, coachMin: 0.1, gaps: true };
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

  // ---------- texty hlásení ----------
  // čas -> minúty, celé sekundy, desatiny; cez celé desatiny, inak 23,8 - 23 = 0,7999… -> "7"
  function split(s) {
    const tenths = Math.floor(s * 10 + 1e-6);
    return { m: Math.floor(tenths / 600), sec: Math.floor(tenths / 10) % 60, tenth: tenths % 10 };
  }
  const T = {
    sk: {
      time(s) {  // ako inžinier: "1 23 7"
        const { m, sec, tenth } = split(s);
        if (!m) return `${sec},${tenth}`;
        return `${m} ${sec < 10 ? `nula ${sec}` : sec} ${tenth}`;
      },
      gap: (d) => (d < 1 ? d.toFixed(2).replace(".", ",") : `${d.toFixed(1).replace(".", ",")} sekundy`),
      lap: (t) => `Kolo ${t}.`,
      best: (t, g) => `Najlepšie kolo! ${t}. O ${g} rýchlejšie.`,
      same: (t) => `${t}. Takmer rovnako ako najlepšie.`,
      slower: (t, g) => `${t}. O ${g} pomalšie.`,
      fuel: (n) => `Palivo na ${n} ${n === 1 ? "kolo" : n <= 4 ? "kolá" : "kôl"}.`,
      fuelLow: "Palivo dochádza, choď do boxov.",
      flags: { yellow: "Žltá vlajka", blue: "Modrá vlajka", black: "Čierna vlajka", white: "Biela vlajka",
        checkered: "Cieľ! Pekná jazda.", penalty: "Penalta", orange: "Oranžová vlajka, máš poškodenie" },
      green: "Zelená, trať je voľná",
      pit: "Pit limiter!",
      corner: (n, v) => `Zákruta ${n}, ${v}`,
      coachLost: (n, g) => `Zákruta ${n}: strata ${g}.`,
      coachGain: (n, g) => `Zákruta ${n}: zisk ${g}.`,
      causeEarly: (m) => `Brzdíš o ${m} metrov skôr.`,
      causeLate: (v) => `Neskoro brzdíš, v zákrute o ${v} pomalšie.`,
      causeSlow: (v) => `V zákrute o ${v} pomalšie.`,
      gaps: (a, b) => [a && `Pred tebou ${a}`, b && `za tebou ${b}`].filter(Boolean).join(", ") + ".",
      test: "Rádio funguje.",
    },
    en: {
      time(s) {  // "1 23 point 7" -> "one twenty-three point seven"
        const { m, sec, tenth } = split(s);
        if (!m) return `${sec}.${tenth}`;
        return `${m} ${sec < 10 ? `oh ${sec}` : sec} point ${tenth}`;
      },
      gap: (d) => (d < 1 ? `${d.toFixed(2)}` : `${d.toFixed(1)} seconds`),
      lap: (t) => `Lap ${t}.`,
      best: (t, g) => `Best lap! ${t}. ${g} faster.`,
      same: (t) => `${t}. Same as your best.`,
      slower: (t, g) => `${t}. ${g} slower.`,
      fuel: (n) => `Fuel for ${n} ${n === 1 ? "lap" : "laps"}.`,
      fuelLow: "Fuel critical, box this lap.",
      flags: { yellow: "Yellow flag", blue: "Blue flag", black: "Black flag", white: "White flag",
        checkered: "Checkered flag! Nice drive.", penalty: "Penalty", orange: "Orange flag, you have damage" },
      green: "Green flag, track is clear",
      pit: "Pit limiter!",
      corner: (n, v) => `Turn ${n}, ${v}`,
      coachLost: (n, g) => `Turn ${n}: lost ${g}.`,
      coachGain: (n, g) => `Turn ${n}: gained ${g}.`,
      causeEarly: (m) => `Braking ${m} metres early.`,
      causeLate: (v) => `Braked late, ${v} slower through the corner.`,
      causeSlow: (v) => `${v} slower through the corner.`,
      gaps: (a, b) => [a && `Gap ahead ${a}`, b && `behind ${b}`].filter(Boolean).join(", ") + ".",
      test: "Radio check.",
    },
  };
  // jazyk viet: ručne zvolený, alebo podľa jazyka hlasu (čeština rozumie slovenčine)
  function lang(voice = pickVoice()) {
    if (cfg.lang !== "auto") return cfg.lang;
    return !voice || /^(sk|cs)/i.test(voice.lang) ? "sk" : "en";
  }
  const t = () => T[lang()];

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
  function say(text, key, minGapMs = 0, force = false, urgent = false) {
    if (!supported || (!cfg.on && !force)) return;
    const now = Date.now();
    if (key && now - (lastSaid[key] || 0) < minGapMs) return;
    if (key) lastSaid[key] = now;
    // staré hlásenia už nie sú aktuálne; naliehavé (zákruta pred tebou) preruší aj práve hovorené
    if (urgent ? speechSynthesis.speaking || speechSynthesis.pending : speechSynthesis.pending) speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    const v = pickVoice();
    if (v) { u.voice = v; u.lang = v.lang; } else u.lang = lang() === "sk" ? "sk-SK" : "en-US";
    u.volume = cfg.volume;
    u.rate = cfg.rate;
    speechSynthesis.speak(u);
  }

  // ---------- udalosti ----------
  let last = {};
  let prevRef = null;     // najlepšie uložené kolo pred práve dokončeným kolom
  let flag = { shown: "", cand: "", since: 0 };
  let pitSince = 0;
  let cornerSaid = "";  // kolo-zákruta, ktorá už bola ohlásená

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
        const tx = t();
        if (tx.flags[flag.cand]) say(tx.flags[flag.cand], `flag-${flag.cand}`, 8000);
        else if ((flag.cand === "green" || !flag.cand) && ["yellow", "blue", "black"].includes(flag.shown)) {
          say(tx.green, "flag-green", 8000);
        }
      }
      flag.shown = flag.cand;
    }

    // rýchlosť pred zákrutou: najnižšia rýchlosť v tej zákrute z najlepšieho uloženého kola s týmto autom.
    // Hlásime s predstihom v sekundách pred bodom brzdenia (pri vyššej rýchlosti teda skôr v metroch).
    const c = d.corner;
    if (cfg.on && cfg.corners && c && d.speed > 30) {
      const secs = c.dist / (d.speed / 3.6);
      const key = `${d.lap}-${c.n}`;
      if (secs <= cfg.cornerLead && secs > 0.5 && key !== cornerSaid) {
        cornerSaid = key;
        say(cfg.cornerNum ? t().corner(c.n, c.speed) : String(c.speed), null, 0, false, true);
      }
    }

    // v boxovej uličke bez pit limitera
    if (d.in_pit && !d.pit_limiter && d.speed > 30) {
      if (!pitSince) pitSince = now;
      if (cfg.pit && now - pitSince > 1000) say(t().pit, "pit", 15000);
    } else {
      pitSince = 0;
    }
    last = d;
  }

  function lapText(time, ref, tx = t()) {
    const tt = tx.time(time);
    if (!ref) return tx.lap(tt);
    if (time < ref - 0.0005) return tx.best(tt, tx.gap(ref - time));
    if (time - ref < 0.05) return tx.same(tt);
    return tx.slower(tt, tx.gap(time - ref));
  }

  // hodnotenie zákruty po výjazde: strata/zisk oproti najlepšiemu kolu a hlavná príčina
  function coachText(st, tx = t()) {
    if (st.dt === undefined || Math.abs(st.dt) < cfg.coachMin) return null;
    const gap = tx.gap(Math.abs(st.dt));
    if (st.dt < 0) return tx.coachGain(st.n, gap);
    const bd = st.brake_diff;
    let cause = "";
    if (bd !== null && bd <= -10) cause = tx.causeEarly(Math.abs(bd));
    else if (bd !== null && bd >= 15 && st.dv <= -3) cause = tx.causeLate(Math.abs(st.dv));
    else if (st.dv <= -3) cause = tx.causeSlow(Math.abs(st.dv));
    return `${tx.coachLost(st.n, gap)} ${cause}`.trim();
  }

  function corner(st) {
    if (!cfg.coach) return;
    const text = coachText(st);
    if (text) say(text);
  }

  function lap(info) {
    const time = info.time;
    if (cfg.laps && time > 0) say(lapText(time, prevRef));
    if (prevRef === null || time < prevRef) prevRef = time;
    // palivo – údaje o spotrebe prídu s ďalším snímkom, preto chvíľu počkáme
    setTimeout(() => {
      if (cfg.gaps && (last.gap_ahead || last.gap_behind)) {
        const g = (x) => (x ? t().gap(x) : "");
        say(t().gaps(g(last.gap_ahead), g(last.gap_behind)));
      }
      const left = last.fuel_laps_left;
      if (!cfg.fuel || !left) return;
      // kritické hlásenie má vlastný kľúč – nesmie ho zablokovať bežné hlásenie o palive
      if (left < 1) say(t().fuelLow, "fuel-low", 20000);
      else if (left < 3.5) say(t().fuel(Math.floor(left)), "fuel", 20000);
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

    const showLang = () => {
      $("engLangInfo").textContent = cfg.lang === "auto"
        ? `→ ${lang() === "sk" ? "slovenčina" : "angličtina"} (podľa hlasu)` : "";
    };
    const fill = () => {
      const sel = $("engVoice");
      const cur = pickVoice();
      sel.innerHTML = voices.map((v) => `<option value="${v.name}">${v.name} (${v.lang})</option>`).join("")
        || "<option value=''>Žiadny hlas</option>";
      if (cur) sel.value = cur.name;
      $("engNoLocal").hidden = !!localVoice() || !voices.length || lang() !== "sk";
      $("engOn").checked = cfg.on;
      $("engLang").value = cfg.lang;
      for (const k of ["laps", "fuel", "flags", "pit", "corners", "cornerNum", "coach", "gaps"]) $(`eng_${k}`).checked = cfg[k];
      $("engVolume").value = cfg.volume;
      $("engRate").value = cfg.rate;
      $("engLead").value = cfg.cornerLead;
      $("engCoachMin").value = cfg.coachMin;
      showLang();
    };
    speechSynthesis.addEventListener("voiceschanged", () => {
      if ($("engModal").classList.contains("open")) fill();
    });

    btn.addEventListener("click", () => { fill(); $("engModal").classList.add("open"); });
    $("engOn").addEventListener("change", (e) => { cfg.on = e.target.checked; save(); syncBtn(); });
    $("engVoice").addEventListener("change", (e) => { cfg.voice = e.target.value; save(); fill(); });
    $("engLang").addEventListener("change", (e) => { cfg.lang = e.target.value; save(); fill(); });
    $("engVolume").addEventListener("input", (e) => { cfg.volume = +e.target.value; save(); });
    $("engRate").addEventListener("input", (e) => { cfg.rate = +e.target.value; save(); });
    $("engLead").addEventListener("change", (e) => { cfg.cornerLead = +e.target.value; save(); });
    $("engCoachMin").addEventListener("change", (e) => { cfg.coachMin = +e.target.value; save(); });
    for (const k of ["laps", "fuel", "flags", "pit", "corners", "cornerNum", "coach", "gaps"]) {
      $(`eng_${k}`).addEventListener("change", (e) => { cfg[k] = e.target.checked; save(); });
    }
    $("engTest").addEventListener("click", () => {
      const tx = t();
      say(`${tx.test} ${tx.corner(3, 87)}. ${lapText(83.47, 83.7, tx)} ${tx.fuel(3)}`, null, 0, true);
    });
  }

  return { frame, lap, corner, coachText, say, setupUI, lapText, lang, T };
})();

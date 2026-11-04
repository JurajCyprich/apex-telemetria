// Hlasový pretekársky inžinier: hlási časy kôl, palivo, vlajky a zabudnutý pit limiter.
// Hovorí hlasom Windows cez speechSynthesis. Jazyk viet sa riadi hlasom (slovenský/český hlas ->
// slovenčina, inak angličtina), alebo ho určí používateľ v nastaveniach.
const engineer = (() => {
  const DEFAULTS = { on: false, voice: "", lang: "auto", volume: 1, rate: 1.05,
    laps: true, fuel: true, flags: true, pit: true, corners: true, cornerLead: 3, cornerNum: true,
    coach: true, coachMin: 0.1, gaps: true,
    strategy: true, tyres: true, tyreLo: 75, tyreHi: 100, pressLo: 0, pressHi: 0, brakeHot: 800 };
  const CHECKS = ["laps", "fuel", "flags", "pit", "corners", "cornerNum", "coach", "gaps", "strategy", "tyres"];
  const NUMS = { engTyreLo: "tyreLo", engTyreHi: "tyreHi", engPressLo: "pressLo", engPressHi: "pressHi", engBrakeHot: "brakeHot" };
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
      wheels: ["ľavá predná", "pravá predná", "ľavá zadná", "pravá zadná"],
      groups: { front: "predné", rear: "zadné", left: "ľavé", right: "pravé", all: "všetky" },
      tyresCold: (w) => `${cap(w)} gumy sú studené.`,
      tyresHot: (w, t) => `${cap(w)} gumy sa prehrievajú, ${t} stupňov.`,
      tyreCold: (w, t) => `${cap(w)} guma je studená, ${t} stupňov.`,
      tyreHot: (w, t) => `${cap(w)} guma sa prehrieva, ${t} stupňov.`,
      pressHigh: (w, p) => `Tlak ${w} ${p}, vysoko.`,
      pressLow: (w, p) => `Tlak ${w} ${p}, nízko.`,
      tyresWarm: "Gumy sú ešte studené, opatrne.",
      brakesHot: "Brzdy sa prehrievajú.",
      boxNow: "Box, box! Toto kolo do boxov.",
      boxIn: (n) => `Do boxov o ${n} ${n === 1 ? "kolo" : n <= 4 ? "kolá" : "kôl"}.`,
      boxFuel: (l) => `Na cieľ chýba ${l} litrov.`,
      fuelOk: "Palivo vystačí do cieľa.",
      fuelTight: "Palivo na tesno, šetri.",
      tyreLaps: (n) => `Gumy vydržia ešte ${n} ${n === 1 ? "kolo" : n <= 4 ? "kolá" : "kôl"}.`,
      num: (v, n = 1) => v.toFixed(n).replace(".", ","),
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
      wheels: ["front left", "front right", "rear left", "rear right"],
      groups: { front: "front", rear: "rear", left: "left side", right: "right side", all: "all four" },
      tyresCold: (w) => `${cap(w)} tyres are cold.`,
      tyresHot: (w, t) => `${cap(w)} tyres overheating, ${t} degrees.`,
      tyreCold: (w, t) => `${cap(w)} tyre is cold, ${t} degrees.`,
      tyreHot: (w, t) => `${cap(w)} tyre overheating, ${t} degrees.`,
      pressHigh: (w, p) => `${cap(w)} pressure ${p}, too high.`,
      pressLow: (w, p) => `${cap(w)} pressure ${p}, too low.`,
      tyresWarm: "Tyres still cold, take care.",
      brakesHot: "Brakes are overheating.",
      boxNow: "Box, box! Box this lap.",
      boxIn: (n) => `Box in ${n} ${n === 1 ? "lap" : "laps"}.`,
      boxFuel: (l) => `${l} litres short to the finish.`,
      fuelOk: "Fuel is good to the end.",
      fuelTight: "Fuel is tight, save some.",
      tyreLaps: (n) => `Tyres good for ${n} more ${n === 1 ? "lap" : "laps"}.`,
      num: (v, n = 1) => v.toFixed(n),
      test: "Radio check.",
    },
  };
  function cap(s) { return s.charAt(0).toUpperCase() + s.slice(1); }
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
  // priemery teplôt a tlakov počas kola (hodnotí sa po kole, aby to neotravovalo v zákrutách)
  let tyreAcc = { n: 0, temp: [0, 0, 0, 0], press: [0, 0, 0, 0], pn: 0 };
  let coldSince = 0, brakeSince = 0;
  let fuelOkSaid = false;

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

    // pneumatiky a brzdy
    if (d.speed > 40 && !d.in_pit) {
      const temps = d.tyre_temp || [];
      if (temps.every((v) => typeof v === "number")) {
        tyreAcc.n++;
        temps.forEach((v, i) => { tyreAcc.temp[i] += v; });
        const pr = d.tyre_pressure || [];
        if (pr.every((v) => typeof v === "number" && v > 0)) {
          tyreAcc.pn++;
          pr.forEach((v, i) => { tyreAcc.press[i] += v; });
        }
        // výjazd z boxov na studených gumách
        if (cfg.on && cfg.tyres && Math.max(...temps) < cfg.tyreLo - 15) {
          if (!coldSince) coldSince = now;
          if (now - coldSince > 5000) say(t().tyresWarm, "tyres-warm", 180000);
        } else coldSince = 0;
      }
      const bt = (d.brake_temp || []).filter((v) => typeof v === "number");
      if (bt.length && Math.max(...bt) > cfg.brakeHot) {
        if (!brakeSince) brakeSince = now;
        if (cfg.on && cfg.tyres && now - brakeSince > 3000) say(t().brakesHot, "brakes-hot", 60000);
      } else brakeSince = 0;
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

  // hodnotenie gúm za kolo: najviac jedna veta o teplote a jedna o tlaku
  function wheelGroup(idx, tx) {
    const k = idx.join("");
    const map = { "01": "front", "23": "rear", "02": "left", "13": "right", "0123": "all" };
    return map[k] ? tx.groups[map[k]] : null;
  }
  function tyreText(acc, tx = t()) {
    if (acc.n < 30) return [];
    const out = [];
    const avg = acc.temp.map((v) => v / acc.n);
    const cold = avg.map((v, i) => [v, i]).filter(([v]) => v < cfg.tyreLo);
    const hot = avg.map((v, i) => [v, i]).filter(([v]) => v > cfg.tyreHi);
    // celá náprava / strana naraz -> "predné gumy", inak najhoršia guma
    const describe = (list, many, one, hotter) => {
      const g = wheelGroup(list.map(([, i]) => i), tx);
      const worst = list.reduce((a, b) => ((hotter ? b[0] > a[0] : b[0] < a[0]) ? b : a));
      return g ? many(g, Math.round(worst[0])) : one(tx.wheels[worst[1]], Math.round(worst[0]));
    };
    if (hot.length) out.push(describe(hot, tx.tyresHot, tx.tyreHot, true));
    else if (cold.length) out.push(describe(cold, tx.tyresCold, tx.tyreCold, false));
    if (cfg.pressLo > 0 && cfg.pressHi > cfg.pressLo && acc.pn > 30) {
      const pr = acc.press.map((v) => v / acc.pn);
      let worst = null;
      pr.forEach((p, i) => {
        const off = p > cfg.pressHi ? p - cfg.pressHi : p < cfg.pressLo ? p - cfg.pressLo : 0;
        if (off && (!worst || Math.abs(off) > Math.abs(worst.off))) worst = { off, p, i };
      });
      if (worst) out.push((worst.off > 0 ? tx.pressHigh : tx.pressLow)(tx.wheels[worst.i], tx.num(worst.p)));
    }
    return out;
  }

  // stratégia po kole: kedy do boxov, či vystačí palivo
  function strategyText(d, tx = t()) {
    if (typeof strategy === "undefined") return null;
    const s = strategy.compute(d);
    if (s.remaining === null) return null;
    const lapNo = (d.lap || 0) + 1;
    if (s.needsPit && s.pitLatest !== null) {
      const n = s.pitLatest - lapNo;
      if (n <= 0) return tx.boxNow;
      if (n <= 3) return tx.boxIn(n);
      return null;
    }
    if (s.fuelDelta !== null && s.remaining > 0.5) {
      if (d.fuel_per_lap && s.fuelDelta < d.fuel_per_lap * 0.5 && s.fuelDelta >= 0) return tx.fuelTight;
      if (!fuelOkSaid && s.remaining < 6) { fuelOkSaid = true; return tx.fuelOk; }
    }
    return null;
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
      if (cfg.tyres) tyreText(tyreAcc).forEach((s) => say(s));
      tyreAcc = { n: 0, temp: [0, 0, 0, 0], press: [0, 0, 0, 0], pn: 0 };
      const st = cfg.strategy ? strategyText(last) : null;
      if (st) say(st, "strategy", 20000);
      const left = last.fuel_laps_left;
      if (!cfg.fuel || !left || st) return;
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
      for (const k of CHECKS) $(`eng_${k}`).checked = cfg[k];
      for (const [id, k] of Object.entries(NUMS)) $(id).value = cfg[k];
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
    for (const k of CHECKS) {
      $(`eng_${k}`).addEventListener("change", (e) => { cfg[k] = e.target.checked; save(); });
    }
    for (const [id, k] of Object.entries(NUMS)) {
      $(id).addEventListener("change", (e) => { cfg[k] = +e.target.value || 0; save(); });
    }
    $("engTest").addEventListener("click", () => {
      const tx = t();
      say(`${tx.test} ${tx.corner(3, 87)}. ${lapText(83.47, 83.7, tx)} ${tx.fuel(3)}`, null, 0, true);
    });
  }

  return { frame, lap, corner, coachText, tyreText, strategyText, say, setupUI, lapText, lang, T, cfg };
})();

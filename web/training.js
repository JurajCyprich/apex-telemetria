// Tréning jednej zákruty: vyberieš zákrutu, ktorá ti nejde, a pri každom prejazde sa zmeria len ona –
// čas úseku, kde si začal brzdiť, najnižšia rýchlosť a rýchlosť na výjazde. Hneď vidíš, či to bolo lepšie.
const training = (() => {
  const $ = (id) => document.getElementById(id);
  const enc = encodeURIComponent;
  let seg = null;       // {start, end, corner, best (najlepší úsek z uložených kôl), brake (najlepšie brzdenie)}
  let combo = "";
  let cur = null;       // práve meraný prejazd
  let prev = null;      // predchádzajúci rámec {x, t}
  let attempts = [];

  const sec = (s) => s.toFixed(3).replace(".", ",");
  const lerpT = (a, b, x) => a.t + (b.t - a.t) * ((x - a.x) / Math.max(1e-6, b.x - a.x));
  const comboOf = (d) => `${d.game}|${d.track}|${d.car}`;

  async function open(d) {
    if (!d.connected) { toast("Najprv choď s autom na trať"); return; }
    let a;
    try {
      a = await getJSON(`/api/analysis?game=${enc(d.game)}&track=${enc(d.track)}&car=${enc(d.car)}`);
    } catch {
      toast("Najprv odjazdi aspoň jedno celé kolo s týmto autom na tejto trati");
      return;
    }
    const list = a.segments.filter((s) => s.corner);
    if (!list.length) { toast("V uloženom kole som nenašiel zákruty"); return; }
    const brakeOf = (s) => a.brakes.find((b) => String(b.n) === s.corner.split("–")[0]);
    $("trList").innerHTML = list.map((s) => {
      const b = brakeOf(s);
      const info = b ? ` · vstup ${b.entry} → ${b.speed} km/h` : "";
      return `<button class="btn tr-pick" data-i="${s.i}"><b>Zákruta ${s.corner}</b>
        <small class="muted">najlepšie ${sec(s.best)} s${info}</small></button>`;
    }).join("");
    $("trList").querySelectorAll(".tr-pick").forEach((btn) => btn.addEventListener("click", () => {
      const s = list.find((x) => x.i === +btn.dataset.i);
      start({ ...s, brake: brakeOf(s) || null }, comboOf(d));
      $("trModal").classList.remove("open");
    }));
    $("trModal").classList.add("open");
  }

  function start(s, key) {
    seg = s;
    combo = key;
    cur = null;
    prev = null;
    attempts = [];
    $("trPanel").hidden = false;
    $("trBtn").classList.add("on");
    render();
    toast(`Tréning zákruty ${s.corner} – meriam každý prejazd`);
  }

  function stop() {
    seg = null;
    $("trPanel").hidden = true;
    $("trBtn").classList.remove("on");
  }

  function frame(d) {
    if (!seg) return;
    if (!d.connected || d.paused || d.lap_dist < 0) { cur = null; prev = null; return; }
    if (comboOf(d) !== combo) { stop(); return; }
    const x = d.lap_dist;
    const t = d.lap_time;
    const p = prev;
    prev = { x, t };
    if (!p) return;
    if (!cur) {
      // vjazd do úseku (skok o viac ako 60 m = reset auta, nie jazda)
      if (p.x < seg.start && x >= seg.start && x - p.x < 60 && t >= p.t) {
        cur = { t0: lerpT(p, prev, seg.start), brake: null, vmin: d.speed };
      }
      return;
    }
    if (x < p.x - 5 || x - p.x > 60 || d.in_pit || t < p.t) { cur = null; return; }
    if (cur.brake === null && d.brake > 0.2) cur.brake = x;
    cur.vmin = Math.min(cur.vmin, d.speed);
    if (x >= seg.end) {
      finish(lerpT(p, prev, seg.end) - cur.t0, d.speed);
      cur = null;
    }
  }

  function finish(time, vout) {
    if (time <= 0) return;
    const before = attempts.length ? Math.min(...attempts.map((a) => a.time)) : null;
    const bestAtt = before !== null ? attempts.find((a) => a.time === before) : null;
    const a = { n: attempts.length + 1, time, brake: cur.brake, vmin: Math.round(cur.vmin), vout: Math.round(vout) };
    attempts.push(a);
    render();
    speak(a, before, bestAtt);
  }

  function speak(a, before, bestAtt) {
    const en = engineer.lang() === "en";
    const tx = engineer.T[en ? "en" : "sk"];
    const parts = [tx.time(a.time)];
    if (before !== null) {
      const diff = a.time - before;
      const g = tx.gap(Math.abs(diff));
      if (diff < -0.0005) parts.push(en ? `New best, ${g} faster.` : `Nový najlepší, o ${g} rýchlejšie.`);
      else parts.push(en ? `${g} slower.` : `O ${g} pomalšie.`);
      if (a.brake !== null && bestAtt?.brake !== null && bestAtt?.brake !== undefined) {
        const m = Math.round(a.brake - bestAtt.brake);
        if (Math.abs(m) >= 5) {
          parts.push(en ? `Braked ${Math.abs(m)} metres ${m > 0 ? "later" : "earlier"}.`
            : `Brzdil si o ${Math.abs(m)} metrov ${m > 0 ? "neskôr" : "skôr"}.`);
        }
      }
    }
    engineer.say(parts.join(" "), null, 0, false, true);
  }

  function render() {
    if (!seg) return;
    $("trTitle").textContent = `🎯 Zákruta ${seg.corner}`;
    const best = attempts.length ? Math.min(...attempts.map((a) => a.time)) : null;
    const lastA = attempts[attempts.length - 1];
    const sign = (v) => (v > 0 ? "+" : v < 0 ? "−" : "±") + Math.abs(v).toFixed(3).replace(".", ",");
    $("trLast").innerHTML = lastA
      ? `${sec(lastA.time)} s <span class="${lastA.time <= best ? "faster" : "slower"}">${
        attempts.length > 1 ? sign(lastA.time - best) : ""}</span>` : "prejdi zákrutou…";
    $("trBest").textContent = best !== null ? `${sec(best)} s` : "–";
    $("trSaved").textContent = `${sec(seg.best)} s`;
    $("trGoal").textContent = seg.brake
      ? `Najrýchlejší prejazd z uložených kôl: vstup ${seg.brake.entry} km/h, v zákrute ${seg.brake.speed} km/h.` : "";
    // brzdenie ukazujeme voči najlepšiemu brzdeniu z uložených kôl (+ = neskôr)
    const ref = seg.brake ? seg.brake.d : null;
    const rows = attempts.slice(-8).reverse().map((a) => {
      const bd = a.brake !== null && ref !== null ? Math.round(a.brake - ref) : null;
      return `<tr class="${a.time === best ? "best" : ""}"><td>${a.n}</td><td>${sec(a.time)}</td>
        <td>${bd === null ? "–" : `${bd > 0 ? "+" : ""}${bd} m`}</td><td>${a.vmin}</td><td>${a.vout}</td></tr>`;
    }).join("");
    $("trRows").innerHTML = rows || `<tr><td colspan="5" class="muted">Zatiaľ žiadny prejazd</td></tr>`;
  }

  function setup() {
    $("trBtn").addEventListener("click", () => (seg ? stop() : open(last)));
    $("trStop").addEventListener("click", stop);
    $("trOther").addEventListener("click", () => open(last));
  }

  return { frame, setup, open, stop, get active() { return !!seg; } };
})();

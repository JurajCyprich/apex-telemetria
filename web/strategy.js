// Stratégia na preteky: koľko paliva treba do cieľa, ako dlho vydržia gumy a kedy ísť do boxov.
// Dĺžku pretekov berieme z hry (počet kôl), alebo ju zadá používateľ (kolá / minúty).
const strategy = (() => {
  const DEFAULTS = { mode: "auto", laps: 20, minutes: 30, start: 0, reserve: 1, wearLimit: 30 };
  const cfg = { ...DEFAULTS };
  try { Object.assign(cfg, JSON.parse(localStorage.getItem("strategy") || "{}")); } catch { /* bez úložiska */ }
  const save = () => { try { localStorage.setItem("strategy", JSON.stringify(cfg)); } catch { /* nevadí */ } };

  // koľko kôl ešte zostáva (vrátane práve jazdeného), null = nevieme
  function remainingLaps(d) {
    const done = d.lap || 0;
    const frac = d.track_length > 0 && d.lap_dist >= 0 ? Math.min(1, d.lap_dist / d.track_length) : 0;
    if (cfg.mode === "auto") return d.total_laps > 0 ? Math.max(0, d.total_laps - done - frac) : null;
    if (cfg.mode === "laps") return Math.max(0, cfg.laps - done - frac);
    if (cfg.mode === "minutes") {
      if (!cfg.start || !d.avg_lap) return null;
      const left = cfg.minutes * 60 - (Date.now() - cfg.start) / 1000;
      // časové preteky: po uplynutí času sa dojazdí ešte rozbehnuté kolo
      return Math.max(0, left / d.avg_lap + (1 - frac));
    }
    return null;
  }

  function compute(d) {
    const out = { remaining: remainingLaps(d), fuelNeed: null, fuelDelta: null, stops: null,
      tyreLaps: null, pitLatest: null, pitEarliest: null, needsPit: false, refuel: null };
    const fpl = d.fuel_per_lap;
    const wear = d.wear_per_lap ? Math.max(...d.wear_per_lap) : null;
    const tyreNow = (d.tyre_wear || []).filter((v) => v !== null && v !== undefined);
    if (wear > 0.05 && tyreNow.length) out.tyreLaps = Math.max(0, (Math.min(...tyreNow) - cfg.wearLimit) / wear);
    const fuelLaps = fpl > 0 && d.fuel !== null ? d.fuel / fpl - cfg.reserve : null;
    const lapNo = (d.lap || 0) + 1;
    const limits = [fuelLaps, out.tyreLaps].filter((v) => v !== null);
    if (out.remaining !== null && fpl > 0 && d.fuel !== null) {
      out.fuelNeed = (out.remaining + cfg.reserve) * fpl;
      out.fuelDelta = d.fuel - out.fuelNeed;
      if (out.fuelDelta < 0) {
        out.refuel = -out.fuelDelta;
        out.stops = d.fuel_capacity ? Math.ceil(out.refuel / d.fuel_capacity) : 1;
      } else out.stops = 0;
    }
    if (limits.length) {
      const until = Math.min(...limits);
      out.pitLatest = lapNo + Math.max(0, Math.floor(until));
      out.needsPit = out.remaining === null ? until < 3 : out.remaining > until + 0.05;
      // najskôr: po zastávke s plnou nádržou musí palivo vydržať do cieľa
      if (out.needsPit && out.remaining !== null && fpl > 0 && d.fuel_capacity) {
        const perTank = d.fuel_capacity / fpl - cfg.reserve;
        out.pitEarliest = lapNo + Math.max(0, Math.ceil(out.remaining - perTank));
        if (out.pitEarliest > out.pitLatest) out.pitEarliest = out.pitLatest;
      }
    }
    return out;
  }

  return { cfg, save, compute, DEFAULTS };
})();

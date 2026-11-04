"""Rozbor všetkých kôl na jednej trati s jedným autom.

- teoretické najlepšie kolo: trať rozdelená na úseky (každý od brzdenia do zákruty po brzdenie ďalšej),
  v každom úseku najlepší čas z ľubovoľného kola,
- najlepšie brzdné body: pre každú zákrutu brzdenie z kola, ktoré ňou prešlo najrýchlejšie,
- najrýchlejšia stopa: poskladaná z polôh auta v kolách s najlepšími úsekmi.
"""
import bisect

from .laps import _time_at, brake_point, corner_segment, find_corners

MAX_LAPS = 40         # stačí najrýchlejších 40 kôl – najlepšie úseky sú takmer vždy z nich
MIN_SEGMENT = 30.0    # m


def _interp(ch, key, dist):
    d, v = ch["d"], ch.get(key)
    if not v:
        return None
    i = bisect.bisect_left(d, dist)
    if i <= 0:
        return v[0]
    if i >= len(d):
        return v[-1]
    f = (dist - d[i - 1]) / max(1e-6, d[i] - d[i - 1])
    return v[i - 1] + f * (v[i] - v[i - 1])


def _same_layout(ref, lap):
    """Rovnaká dĺžka trate (inak iná konfigurácia, skratka alebo pokazené kolo)."""
    a, b = ref["channels"]["d"][-1], lap["channels"]["d"][-1]
    return abs(a - b) <= 0.03 * a


def boundaries(ref_ch, corners):
    """Hranice úsekov: pred brzdením do každej zákruty (rovnako ako začiatok úseku zákruty)."""
    d = ref_ch["d"]
    start, end = d[0], d[-1]
    cuts = [corner_segment(c)[0] for c in corners] if corners else [start + (end - start) * k / 10 for k in range(1, 10)]
    out = [start]
    for x in sorted(cuts):
        if x - out[-1] >= MIN_SEGMENT and end - x >= MIN_SEGMENT:
            out.append(x)
    out.append(end)
    return out


def analyse(laps):
    """laps = celé kolá (s kanálmi) z jednej kombinácie hra/trať/auto. Vráti rozbor alebo None."""
    laps = [l for l in laps if l and len(l.get("channels", {}).get("d", [])) > 50]
    if not laps:
        return None
    laps.sort(key=lambda l: l["time"])
    ref = laps[0]
    laps = [l for l in laps[:MAX_LAPS] if _same_layout(ref, l)]
    rc = ref["channels"]
    corners = find_corners(rc)
    cuts = boundaries(rc, corners)
    # úseky pokryté všetkými kolami (začiatok/koniec kola sa môže o pár metrov líšiť)
    lo = max(l["channels"]["d"][0] for l in laps) + 0.5
    hi = min(l["channels"]["d"][-1] for l in laps) - 0.5
    cuts = [max(lo, min(hi, c)) for c in cuts]
    cuts[0], cuts[-1] = lo, hi

    segments = []
    for i in range(len(cuts) - 1):
        a, b = cuts[i], cuts[i + 1]
        if b - a < 1:
            continue
        times = []
        for l in laps:
            ta, tb = _time_at(l["channels"], a), _time_at(l["channels"], b)
            if ta is not None and tb is not None and tb > ta:
                times.append((tb - ta, l["id"]))
        if not times:
            continue
        best_t, best_id = min(times)
        ref_t = next((t for t, lid in times if lid == ref["id"]), best_t)
        # zákruty, ktorých vrchol je v úseku (zvyčajne jedna; prvý úsek po štart býva bez zákruty)
        inside = [c["n"] for c in corners if a <= c["d"] < b]
        corner = "–".join(map(str, inside)) if inside else None
        segments.append({"i": len(segments), "start": round(a, 1), "end": round(b, 1), "corner": corner,
                         "best": round(best_t, 3), "best_lap": best_id, "ref": round(ref_t, 3),
                         "gain": round(ref_t - best_t, 3)})
    covered_ref = sum(s["ref"] for s in segments)
    rest = max(0.0, ref["time"] - covered_ref)  # kúsky pred prvým a za posledným úsekom
    theo = sum(s["best"] for s in segments) + rest

    by_id = {l["id"]: l for l in laps}
    return {
        "game": ref["game"], "track": ref["track"], "car": ref["car"],
        "laps": len(laps), "ref_id": ref["id"], "ref_time": ref["time"],
        "time": round(theo, 3), "gain": round(ref["time"] - theo, 3),
        "segments": segments,
        "brakes": best_brakes(laps, corners),
        "line": best_line(segments, by_id),
    }


def best_brakes(laps, corners):
    """Pre každú zákrutu: kde brzdilo kolo, ktoré ňou prešlo najrýchlejšie, a akou rýchlosťou."""
    out = []
    for i, c in enumerate(corners):
        nxt = corners[i + 1] if i + 1 < len(corners) else None
        prev = corners[i - 1] if i else None
        a, b = corner_segment(c, nxt)
        best = None
        for l in laps:
            ch = l["channels"]
            ta, tb = _time_at(ch, a), _time_at(ch, b)
            if ta is None or tb is None:
                continue
            if best is None or tb - ta < best[0]:
                best = (tb - ta, l)
        if not best:
            continue
        ch = best[1]["channels"]
        lo = c["brake_d"] - 250
        if prev is not None:
            lo = max(lo, prev["d"] + 50)
        bp = brake_point(ch, lo, c["d"])
        if bp is None:
            continue
        lo_i, hi_i = bisect.bisect_left(ch["d"], c["d"] - 80), bisect.bisect_right(ch["d"], c["d"] + 80)
        apex_v = min(ch["speed"][lo_i:hi_i]) if hi_i > lo_i else c["speed"]
        apex_i = lo_i + ch["speed"][lo_i:hi_i].index(apex_v) if hi_i > lo_i else None
        out.append({
            "n": c["n"], "d": round(bp, 1), "apex_d": round(ch["d"][apex_i], 1) if apex_i is not None else round(c["d"], 1),
            "speed": round(apex_v), "entry": round(_interp(ch, "speed", bp) or 0),
            "gear": ch["gear"][apex_i] if apex_i is not None and ch.get("gear") else None,
            "x": round(_interp(ch, "x", bp) or 0, 2), "z": round(_interp(ch, "z", bp) or 0, 2),
            "ax": round(_interp(ch, "x", ch["d"][apex_i] if apex_i is not None else c["d"]) or 0, 2),
            "az": round(_interp(ch, "z", ch["d"][apex_i] if apex_i is not None else c["d"]) or 0, 2),
            "lap": best[1]["id"], "time": round(best[0], 3),
        })
    return out


def best_line(segments, by_id, step=3.0):
    """Najrýchlejšia stopa: polohy auta z kola s najlepším časom v každom úseku, každé ~3 m.
    [[d, x, z, speed], …]"""
    out = []
    for s in segments:
        lap = by_id.get(s["best_lap"])
        if not lap:
            continue
        ch = lap["channels"]
        if not ch.get("x"):
            continue
        d = s["start"]
        while d < s["end"]:
            out.append([round(d, 1), round(_interp(ch, "x", d), 2), round(_interp(ch, "z", d), 2),
                        round(_interp(ch, "speed", d), 1)])
            d += step
    return out

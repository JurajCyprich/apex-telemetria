"""Kontrola novej verzie na GitHube (najnovšie vydanie v Releases)."""
import logging
import re
import time

import aiohttp

from . import GITHUB_REPO, __version__

log = logging.getLogger("updates")
CACHE_FOR = 6 * 3600  # GitHub API bez prihlásenia povolí 60 dotazov za hodinu

_cache = {"at": 0.0, "data": None}


def _parse(tag):
    nums = re.findall(r"\d+", tag or "")
    return tuple(int(n) for n in nums[:3]) if nums else (0,)


async def check():
    """{current, latest, update, url, notes}; pri chybe siete len current (nikdy nevyhodí výnimku)."""
    if _cache["data"] and time.monotonic() - _cache["at"] < CACHE_FOR:
        return _cache["data"]
    data = {"current": __version__, "latest": None, "update": False, "url": None, "notes": ""}
    url = f"https://api.github.com/repos/{GITHUB_REPO}/releases/latest"
    try:
        timeout = aiohttp.ClientTimeout(total=6)
        async with aiohttp.ClientSession(timeout=timeout) as s:
            async with s.get(url, headers={"Accept": "application/vnd.github+json",
                                           "User-Agent": f"ApexTelemetria/{__version__}"}) as r:
                if r.status != 200:
                    raise RuntimeError(f"HTTP {r.status}")
                rel = await r.json()
        latest = rel.get("tag_name", "").lstrip("v")
        data.update(latest=latest, url=rel.get("html_url"), notes=(rel.get("name") or ""),
                    update=_parse(latest) > _parse(__version__))
        if data["update"]:
            log.info("Nová verzia %s (máš %s)", latest, __version__)
    except Exception as e:  # offline, GitHub nedostupný…
        log.info("Kontrola aktualizácií zlyhala: %s", e)
        _cache.update(at=time.monotonic() - CACHE_FOR + 600, data=data)  # skúsiť znova o 10 min
        return data
    _cache.update(at=time.monotonic(), data=data)
    return data

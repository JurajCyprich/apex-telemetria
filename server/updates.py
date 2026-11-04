"""Kontrola novej verzie na GitHube (najnovšie vydanie v Releases) a aktualizácia jedným klikom."""
import asyncio
import logging
import os
import re
import subprocess
import sys
import time
import zipfile

import aiohttp

from . import GITHUB_REPO, __version__
from .config import DATA

log = logging.getLogger("updates")
CACHE_FOR = 6 * 3600  # GitHub API bez prihlásenia povolí 60 dotazov za hodinu
ASSET = "ApexTelemetria.zip"
EXE = "ApexTelemetria.exe"
MAX_DOWNLOAD = 200 * 1024 * 1024
UPDATE_DIR = DATA / "update"

_cache = {"at": 0.0, "data": None}


def _parse(tag):
    nums = re.findall(r"\d+", tag or "")
    return tuple(int(n) for n in nums[:3]) if nums else (0,)


def can_self_update():
    """Nahradiť sa vie len zabalený .exe na Windows (zo zdrojákov sa aktualizuje cez git)."""
    return sys.platform == "win32" and getattr(sys, "frozen", False)


async def check():
    """{current, latest, update, url, notes, can_install}; pri chybe siete len current (nikdy nevyhodí výnimku)."""
    if _cache["data"] and time.monotonic() - _cache["at"] < CACHE_FOR:
        return _cache["data"]
    data = {"current": __version__, "latest": None, "update": False, "url": None, "notes": "",
            "asset_url": None, "can_install": False}
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
        asset = next((a for a in rel.get("assets", []) if a.get("name") == ASSET), None)
        data.update(latest=latest, url=rel.get("html_url"), notes=(rel.get("name") or ""),
                    update=_parse(latest) > _parse(__version__),
                    asset_url=asset.get("browser_download_url") if asset else None)
        data["can_install"] = bool(data["update"] and data["asset_url"] and can_self_update())
        if data["update"]:
            log.info("Nová verzia %s (máš %s)", latest, __version__)
    except Exception as e:  # offline, GitHub nedostupný…
        log.info("Kontrola aktualizácií zlyhala: %s", e)
        _cache.update(at=time.monotonic() - CACHE_FOR + 600, data=data)  # skúsiť znova o 10 min
        return data
    _cache.update(at=time.monotonic(), data=data)
    return data


# pomocný skript: počká, kým sa aplikácia zavrie (.exe sa uvoľní), nahradí ho a spustí novú verziu.
# `ping` namiesto `timeout`, lebo skript beží bez okna konzoly (timeout by hneď skončil).
_UPDATER = r"""@echo off
chcp 65001 >nul
set "EXE={exe}"
set "NEW={new}"
set N=0
:wait
ping -n 2 127.0.0.1 >nul
move /y "%NEW%" "%EXE%" >nul 2>&1
if not errorlevel 1 goto done
set /a N+=1
if %N% lss 90 goto wait
exit /b 1
:done
start "" "%EXE%"
(goto) 2>nul & del "%~f0"
"""


async def install():
    """Stiahne novú verziu, pripraví výmenu .exe a vráti cestu k pomocnému skriptu (spustí ho volajúci)."""
    if not can_self_update():
        raise RuntimeError("Aktualizácia jedným klikom funguje len v ApexTelemetria.exe.")
    info = await check()
    if not info["update"] or not info["asset_url"]:
        raise RuntimeError("Nová verzia nie je k dispozícii.")
    UPDATE_DIR.mkdir(parents=True, exist_ok=True)
    zip_path = UPDATE_DIR / ASSET
    log.info("Sťahujem %s", info["asset_url"])
    size = 0
    timeout = aiohttp.ClientTimeout(total=600, sock_read=60)
    async with aiohttp.ClientSession(timeout=timeout) as s:
        async with s.get(info["asset_url"], headers={"User-Agent": f"ApexTelemetria/{__version__}"}) as r:
            if r.status != 200:
                raise RuntimeError(f"Sťahovanie zlyhalo (HTTP {r.status}).")
            with open(zip_path, "wb") as fh:
                async for chunk in r.content.iter_chunked(256 * 1024):
                    size += len(chunk)
                    if size > MAX_DOWNLOAD:
                        raise RuntimeError("Súbor je podozrivo veľký, aktualizácia zrušená.")
                    fh.write(chunk)

    def unpack():
        with zipfile.ZipFile(zip_path) as z:
            data = z.read(EXE)  # ZIP musí obsahovať presne tento súbor
        if not data.startswith(b"MZ") or len(data) < 1_000_000:
            raise RuntimeError("Stiahnutý súbor nie je platná aplikácia.")
        new = UPDATE_DIR / "ApexTelemetria.new.exe"
        new.write_bytes(data)
        zip_path.unlink(missing_ok=True)
        return new

    new = await asyncio.to_thread(unpack)
    exe = os.path.abspath(sys.executable)
    bat = UPDATE_DIR / "update.bat"
    script = _UPDATER.format(exe=exe, new=str(new))
    bat.write_bytes(script.replace("\r\n", "\n").replace("\n", "\r\n").encode("utf-8"))  # CRLF pre cmd
    log.info("Aktualizácia na %s pripravená, reštartujem", info["latest"])
    return bat


def launch_updater(bat):
    """Spustí pomocný skript odpojený od aplikácie (prežije jej ukončenie), bez okna konzoly."""
    # Jednosúborový .exe si pri štarte nastaví premenné _PYI_*; nová verzia by ich zdedila,
    # považovala by sa za podproces starej (už neexistujúcej) aplikácie a zasekla by sa.
    env = {k: v for k, v in os.environ.items() if not k.startswith("_PYI") and k != "_MEIPASS2"}
    env["PYINSTALLER_RESET_ENVIRONMENT"] = "1"
    flags = 0x08000000 | 0x00000200  # CREATE_NO_WINDOW | CREATE_NEW_PROCESS_GROUP
    subprocess.Popen(["cmd.exe", "/c", str(bat)], creationflags=flags, close_fds=True, env=env,
                     stdin=subprocess.DEVNULL, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)

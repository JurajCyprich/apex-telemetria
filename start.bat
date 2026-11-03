@echo off
chcp 65001 >nul
title Apex Telemetria
cd /d "%~dp0"

if not exist ".venv\Scripts\python.exe" (
    echo Prvé spustenie - pripravujem prostredie...
    py -3 -m venv .venv 2>nul || python -m venv .venv
    if errorlevel 1 (
        echo Python nie je nainštalovaný. Stiahni ho z https://www.python.org/downloads/
        pause
        exit /b 1
    )
)
".venv\Scripts\python.exe" -m pip install -q --disable-pip-version-check -r requirements.txt
".venv\Scripts\python.exe" -m server %*
pause

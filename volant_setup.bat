@echo off
chcp 65001 >nul
title Apex Telemetria - volant
cd /d "%~dp0"

if not exist ".venv\Scripts\python.exe" (
    echo Najprv raz spusti start.bat.
    pause
    exit /b 1
)
echo Volant na mobile potrebuje virtuálny Xbox ovládač (ovládač ViGEmBus).
echo Teraz sa otvorí jeho inštalátor - potvrď ho. Stačí to urobiť raz.
echo.
".venv\Scripts\python.exe" -m pip install --disable-pip-version-check vgamepad
echo.
echo Hotovo. Reštartuj start.bat.
pause

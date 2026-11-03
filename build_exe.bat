@echo off
chcp 65001 >nul
title Apex Telemetria - zostavenie .exe
cd /d "%~dp0"

if not exist ".venv\Scripts\python.exe" (
    echo Najprv raz spusti start.bat.
    pause
    exit /b 1
)
set PY=.venv\Scripts\python.exe
set OUT=dist\ApexTelemetria

echo Pripravujem PyInstaller...
"%PY%" -m pip install -q --disable-pip-version-check -r requirements.txt pyinstaller
if errorlevel 1 goto fail

set EXTRA=
"%PY%" -c "import importlib.util,sys; sys.exit(importlib.util.find_spec('vgamepad') is None)" && set EXTRA=--collect-all vgamepad
if not defined EXTRA echo Upozornenie: vgamepad nie je nainštalovaný - volant v .exe nebude fungovať (spusti volant_setup.bat).

echo Zostavujem ApexTelemetria.exe (trvá to asi minútu)...
"%PY%" -m PyInstaller --noconfirm --clean --onefile --console --name ApexTelemetria ^
    --icon "%CD%\web\icon.ico" --add-data "%CD%\web;web" %EXTRA% ^
    --distpath build\pyi --workpath build\work --specpath build apex.py
if errorlevel 1 goto fail

if exist "%OUT%" rmdir /s /q "%OUT%"
mkdir "%OUT%"
copy /y build\pyi\ApexTelemetria.exe "%OUT%\" >nul
copy /y tools\NAVOD.txt "%OUT%\NAVOD.txt" >nul
set MSI=.venv\Lib\site-packages\vgamepad\win\vigem\install\x64\ViGEmBusSetup_x64.msi
if exist "%MSI%" copy /y "%MSI%" "%OUT%\ViGEmBus_setup.msi" >nul

if exist dist\ApexTelemetria.zip del dist\ApexTelemetria.zip
powershell -NoProfile -Command "Compress-Archive -Path '%OUT%\*' -DestinationPath 'dist\ApexTelemetria.zip'"
if errorlevel 1 goto fail

echo.
echo Hotovo: dist\ApexTelemetria.zip  (toto pošli kamošovi)
pause
exit /b 0

:fail
echo.
echo Zostavenie zlyhalo - pozri chyby vyššie.
pause
exit /b 1

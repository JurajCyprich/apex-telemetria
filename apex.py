"""Vstupný bod pre zabalený .exe (PyInstaller): aplikácia vo vlastnom okne.

Bežne sa zo zdrojákov spúšťa cez start.bat (python -m server, v prehliadači).
`ApexTelemetria.exe --browser` spustí starý režim v prehliadači.
"""
import sys
import traceback

from server.__main__ import main

if __name__ == "__main__":
    if "--browser" in sys.argv:
        sys.argv.remove("--browser")
    elif "--desktop" not in sys.argv:
        sys.argv.append("--desktop")
    try:
        main()
    except Exception:
        traceback.print_exc()
        from server.desktop import message_box
        message_box(f"Aplikácia spadla:\n\n{traceback.format_exc(limit=3)}")
        raise

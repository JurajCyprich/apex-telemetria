"""Vstupný bod pre zabalený .exe (PyInstaller). Bežne sa spúšťa cez start.bat (python -m server)."""
import sys
import traceback

from server.__main__ import main

if __name__ == "__main__":
    try:
        main()
    except Exception:
        traceback.print_exc()
        if getattr(sys, "frozen", False):
            input("\nAplikácia spadla. Stlač Enter pre zatvorenie…")
        raise

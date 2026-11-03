import argparse
import asyncio
import ctypes
import logging
import sys

from .app import serve


def main():
    parser = argparse.ArgumentParser(description="Sim racing telemetria + button box")
    parser.add_argument("--port", type=int, help="HTTP port (predvolene 8777)")
    parser.add_argument("--no-browser", action="store_true", help="neotvárať prehliadač")
    args = parser.parse_args()
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(name)s: %(message)s",
                        datefmt="%H:%M:%S")
    logging.getLogger("aiohttp.access").setLevel(logging.WARNING)
    if sys.platform == "win32":
        # jemnejší systémový časovač -> asyncio.sleep(1/60) naozaj trvá ~16 ms
        ctypes.windll.winmm.timeBeginPeriod(1)
    try:
        asyncio.run(serve(args.port, not args.no_browser))
    except KeyboardInterrupt:
        pass


if __name__ == "__main__":
    main()

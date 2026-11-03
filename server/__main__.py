import argparse
import asyncio
import ctypes
import logging
import sys

from .config import DATA


def setup_logging(to_file):
    handlers = [logging.StreamHandler()]
    if to_file:
        # bez konzoly (zabalený .exe) nie je kam písať – všetko ide do data/apex.log
        DATA.mkdir(parents=True, exist_ok=True)
        path = DATA / "apex.log"
        # pripisujeme (druhé spustenie nesmie zmazať log bežiacej aplikácie), veľký log začneme odznova
        big = path.exists() and path.stat().st_size > 2_000_000
        log_file = open(path, "w" if big else "a", encoding="utf-8", buffering=1)
        sys.stdout = sys.stderr = log_file
        handlers = [logging.StreamHandler(log_file)]
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(name)s: %(message)s",
                        datefmt="%H:%M:%S", handlers=handlers)
    logging.getLogger("aiohttp.access").setLevel(logging.WARNING)


def main():
    parser = argparse.ArgumentParser(description="Sim racing telemetria + button box")
    parser.add_argument("--port", type=int, help="HTTP port (predvolene 8777)")
    parser.add_argument("--no-browser", action="store_true", help="neotvárať prehliadač")
    parser.add_argument("--desktop", action="store_true", help="vlastné okno namiesto prehliadača")
    args = parser.parse_args()
    setup_logging(to_file=sys.stdout is None or args.desktop and getattr(sys, "frozen", False))
    if sys.platform == "win32":
        # jemnejší systémový časovač -> asyncio.sleep(1/60) naozaj trvá ~16 ms
        ctypes.windll.winmm.timeBeginPeriod(1)
    if args.desktop:
        from .desktop import run
        run(args.port)
        return
    try:
        asyncio.run(serve_cli(args))
    except KeyboardInterrupt:
        pass


async def serve_cli(args):
    from .app import serve
    await serve(args.port, not args.no_browser)


if __name__ == "__main__":
    main()

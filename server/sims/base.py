import asyncio
import logging

log = logging.getLogger("sims")


class Source:
    """Zdroj telemetrie. Potomok implementuje run() a volá self.emit(frame)."""
    id = ""
    name = ""

    def __init__(self, settings, emit):
        self.settings = settings
        self.emit = emit

    async def run(self):
        raise NotImplementedError

    def close(self):
        pass


class _Proto(asyncio.DatagramProtocol):
    def __init__(self, handler):
        self.handler = handler

    def datagram_received(self, data, addr):
        try:
            self.handler(data, addr)
        except Exception:  # chybný paket nesmie zhodiť listener
            log.exception("Chyba pri spracovaní UDP paketu")


class UdpSource(Source):
    """Zdroj, ktorý počúva na UDP porte."""
    port = 0

    def __init__(self, settings, emit):
        super().__init__(settings, emit)
        self.transport = None

    async def run(self):
        loop = asyncio.get_running_loop()
        self.transport, _ = await loop.create_datagram_endpoint(
            lambda: _Proto(self.on_packet), local_addr=("0.0.0.0", self.port))
        log.info("%s: počúvam na UDP porte %d", self.name, self.port)
        try:
            await self.background()
        finally:
            self.close()

    async def background(self):
        await asyncio.Event().wait()

    def on_packet(self, data, addr):
        raise NotImplementedError

    def close(self):
        if self.transport:
            self.transport.close()
            self.transport = None

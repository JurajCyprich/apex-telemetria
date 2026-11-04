"""Assetto Corsa (a ACC) - zdieľaná pamäť acpmf_physics / acpmf_graphics / acpmf_static."""
import asyncio
import ctypes
import time

from ..model import Frame
from ..winapi import SharedMemory, running_processes
from .base import Source

I = ctypes.c_int32
F = ctypes.c_float
F3 = F * 3
F4 = F * 4


def W(n):
    return ctypes.c_wchar * n


class Physics(ctypes.Structure):
    _pack_ = 4
    _fields_ = [
        ("packetId", I), ("gas", F), ("brake", F), ("fuel", F), ("gear", I), ("rpms", I),
        ("steerAngle", F), ("speedKmh", F), ("velocity", F3), ("accG", F3), ("wheelSlip", F4),
        ("wheelLoad", F4), ("wheelsPressure", F4), ("wheelAngularSpeed", F4), ("tyreWear", F4),
        ("tyreDirtyLevel", F4), ("tyreCoreTemperature", F4), ("camberRAD", F4),
        ("suspensionTravel", F4), ("drs", F), ("tc", F), ("heading", F), ("pitch", F), ("roll", F),
        ("cgHeight", F), ("carDamage", F * 5), ("numberOfTyresOut", I), ("pitLimiterOn", I),
        ("abs", F), ("kersCharge", F), ("kersInput", F), ("autoShifterOn", I), ("rideHeight", F * 2),
        ("turboBoost", F), ("ballast", F), ("airDensity", F), ("airTemp", F), ("roadTemp", F),
        ("localAngularVel", F3), ("finalFF", F), ("performanceMeter", F), ("engineBrake", I),
        ("ersRecoveryLevel", I), ("ersPowerLevel", I), ("ersHeatCharging", I), ("ersIsCharging", I),
        ("kersCurrentKJ", F), ("drsAvailable", I), ("drsEnabled", I), ("brakeTemp", F4),
        ("clutch", F), ("tyreTempI", F4), ("tyreTempM", F4), ("tyreTempO", F4),
        ("isAIControlled", I), ("tyreContactPoint", F3 * 4), ("tyreContactNormal", F3 * 4),
        ("tyreContactHeading", F3 * 4), ("brakeBias", F), ("localVelocity", F3),
    ]


_GRAPHICS_COMMON = [
    ("packetId", I), ("status", I), ("session", I), ("currentTime", W(15)), ("lastTime", W(15)),
    ("bestTime", W(15)), ("split", W(15)), ("completedLaps", I), ("position", I),
    ("iCurrentTime", I), ("iLastTime", I), ("iBestTime", I), ("sessionTimeLeft", F),
    ("distanceTraveled", F), ("isInPit", I), ("currentSectorIndex", I), ("lastSectorTime", I),
    ("numberOfLaps", I), ("tyreCompound", W(33)), ("replayTimeMultiplier", F),
    ("normalizedCarPosition", F),
]


class GraphicsAC(ctypes.Structure):
    _pack_ = 4
    _fields_ = _GRAPHICS_COMMON + [
        ("carCoordinates", F3), ("penaltyTime", F), ("flag", I), ("idealLineOn", I),
        ("isInPitLane", I), ("surfaceGrip", F),
    ]


class GraphicsACC(ctypes.Structure):
    _pack_ = 4
    _fields_ = _GRAPHICS_COMMON + [
        ("activeCars", I), ("carCoordinates", F3 * 60), ("carID", I * 60), ("playerCarID", I),
        ("penaltyTime", F), ("flag", I), ("penalty", I), ("idealLineOn", I), ("isInPitLane", I),
        ("surfaceGrip", F), ("mandatoryPitDone", I), ("windSpeed", F), ("windDirection", F),
        ("isSetupMenuVisible", I), ("mainDisplayIndex", I), ("secondaryDisplayIndex", I),
        ("TC", I), ("TCCut", I), ("EngineMap", I), ("ABS", I), ("fuelXLap", F), ("rainLights", I),
        ("flashingLights", I), ("lightsStage", I), ("exhaustTemperature", F), ("wiperLV", I),
        ("DriverStintTotalTimeLeft", I), ("DriverStintTimeLeft", I), ("rainTyres", I),
        # ACC 1.8+ (staršia verzia tu má nuly – stránka pamäte je aj tak 4 KB)
        ("sessionIndex", I), ("usedFuel", F), ("deltaLapTime", W(15)), ("iDeltaLapTime", I),
        ("estimatedLapTime", W(15)), ("iEstimatedLapTime", I), ("isDeltaPositive", I), ("iSplit", I),
        ("isValidLap", I), ("fuelEstimatedLaps", F), ("trackStatus", W(33)), ("missingMandatoryPits", I),
        ("Clock", F), ("directionLightsLeft", I), ("directionLightsRight", I), ("GlobalYellow", I),
        ("GlobalYellow1", I), ("GlobalYellow2", I), ("GlobalYellow3", I), ("GlobalWhite", I),
        ("GlobalGreen", I), ("GlobalChequered", I), ("GlobalRed", I), ("mfdTyreSet", I),
        ("mfdFuelToAdd", F), ("mfdTyrePressureLF", F), ("mfdTyrePressureRF", F), ("mfdTyrePressureLR", F),
        ("mfdTyrePressureRR", F), ("trackGripStatus", I), ("rainIntensity", I), ("rainIntensityIn10min", I),
        ("rainIntensityIn30min", I), ("currentTyreSet", I), ("strategyTyreSet", I),
        ("gapAhead", I), ("gapBehind", I),  # ms
    ]


class Static(ctypes.Structure):
    _pack_ = 4
    _fields_ = [
        ("smVersion", W(15)), ("acVersion", W(15)), ("numberOfSessions", I), ("numCars", I),
        ("carModel", W(33)), ("track", W(33)), ("playerName", W(33)), ("playerSurname", W(33)),
        ("playerNick", W(33)), ("sectorCount", I), ("maxTorque", F), ("maxPower", F),
        ("maxRpm", I), ("maxFuel", F), ("suspensionMaxTravel", F4), ("tyreRadius", F4),
        ("maxTurboBoost", F), ("deprecated_1", F), ("deprecated_2", F), ("penaltiesEnabled", I),
        ("aidFuelRate", F), ("aidTireRate", F), ("aidMechanicalDamage", F),
        ("aidAllowTyreBlankets", I), ("aidStability", F), ("aidAutoClutch", I), ("aidAutoBlip", I),
        ("hasDRS", I), ("hasERS", I), ("hasKERS", I), ("kersMaxJ", F),
        ("engineBrakeSettingsCount", I), ("ersPowerControllerCount", I),
        ("trackSPlineLength", F), ("trackConfiguration", W(33)),
    ]


AC_OFF, AC_REPLAY, AC_LIVE, AC_PAUSE = 0, 1, 2, 3
ACC_FLAGS = {1: "blue", 2: "yellow", 3: "black", 4: "white", 5: "checkered", 6: "penalty",
             7: "green", 8: "orange"}


def _wheels(arr, fn=lambda v: v):
    vals = [float(v) for v in arr]
    if not any(vals):
        return [None] * 4
    return [round(fn(v), 1) for v in vals]


class AssettoSource(Source):
    id = "ac"
    name = "Assetto Corsa"

    def __init__(self, settings, emit):
        super().__init__(settings, emit)
        self.physics = SharedMemory("Local\\acpmf_physics", Physics)
        self.static = SharedMemory("Local\\acpmf_static", Static)
        self.graphics = None
        self.is_acc = False
        self._static_data = None
        self._static_at = 0.0
        self._last_packet = None
        self._last_change = 0.0

    def _detect_variant(self):
        procs = running_processes()
        self.is_acc = "ac2-win64-shipping.exe" in procs
        gtype = GraphicsACC if self.is_acc else GraphicsAC
        self.graphics = SharedMemory("Local\\acpmf_graphics", gtype)
        self.name = "Assetto Corsa Competizione" if self.is_acc else "Assetto Corsa"

    def close(self):
        for shm in (self.physics, self.static, self.graphics):
            if shm:
                shm.close()
        self.graphics = None

    async def run(self):
        try:
            while True:
                if not self._tick():
                    await asyncio.sleep(1.0)
                else:
                    await asyncio.sleep(1 / 60)
        finally:
            self.close()

    def _tick(self):
        p = self.physics.read()
        if p is None:
            return False
        if self.graphics is None:
            self._detect_variant()
        g = self.graphics.read()
        now = time.monotonic()
        if self._static_data is None or now - self._static_at > 2.0:
            self._static_data = self.static.read()
            self._static_at = now
        s = self._static_data
        if g is None or s is None:
            return False

        if p.packetId != self._last_packet:
            self._last_packet = p.packetId
            self._last_change = now
        stale = now - self._last_change > 2.0
        if g.status == AC_OFF or (stale and g.status != AC_PAUSE):
            # hra skončila alebo je v menu - pustíme handle, aby pamäť mohla zaniknúť
            if stale and now - self._last_change > 5.0:
                self.close()
                self._last_change = now
            return False

        self.emit(self._frame(p, g, s))
        return True

    def _frame(self, p, g, s):
        f = Frame(source=self.id, game=self.name, connected=True)
        f.paused = g.status == AC_PAUSE
        f.car = s.carModel
        f.track = s.track + (f" ({s.trackConfiguration})" if s.trackConfiguration else "")
        f.track_length = float(s.trackSPlineLength or 0)
        f.speed = p.speedKmh
        f.rpm = p.rpms
        f.max_rpm = s.maxRpm
        f.gear = p.gear - 1
        f.throttle = p.gas
        f.brake = p.brake
        f.clutch = p.clutch
        f.steer = max(-1.0, min(1.0, p.steerAngle))
        f.fuel = p.fuel
        f.fuel_capacity = s.maxFuel or None
        f.lap = g.completedLaps
        f.total_laps = g.numberOfLaps
        f.position = g.position
        f.lap_time = g.iCurrentTime / 1000
        f.last_lap = max(0, g.iLastTime) / 1000 if g.iLastTime < 2_000_000_000 else 0
        f.best_lap = max(0, g.iBestTime) / 1000 if g.iBestTime < 2_000_000_000 else 0
        if f.track_length:
            f.lap_dist = g.normalizedCarPosition * f.track_length
        f.sector = g.currentSectorIndex
        f.g_lat = p.accG[0]
        f.g_lon = p.accG[2]
        f.tyre_temp = _wheels(p.tyreCoreTemperature)
        f.tyre_pressure = _wheels(p.wheelsPressure)
        f.tyre_wear = _wheels(p.tyreWear)
        f.brake_temp = _wheels(p.brakeTemp)
        f.tyre_compound = g.tyreCompound
        f.pit_limiter = bool(p.pitLimiterOn)
        f.in_pit = bool(g.isInPit or g.isInPitLane)
        f.drs = bool(p.drsEnabled)
        f.air_temp = round(p.airTemp, 1)
        f.track_temp = round(p.roadTemp, 1)
        if p.brakeBias:
            f.brake_bias = round(p.brakeBias * 100, 1)
        f.flag = ACC_FLAGS.get(g.flag, "")

        if self.is_acc:
            idx = 0
            for i in range(min(max(g.activeCars, 0), 60)):
                if g.carID[i] == g.playerCarID:
                    idx = i
                    break
            f.pos_x, f.pos_z = g.carCoordinates[idx][0], g.carCoordinates[idx][2]
            f.tc, f.tc2, f.abs, f.engine_map = g.TC, g.TCCut, g.ABS, g.EngineMap + 1
            f.lights = g.lightsStage
            f.wipers = g.wiperLV
            f.rain_lights = bool(g.rainLights)
            # odstupy v ms; 0 = nie je auto pred / za tebou alebo staršia verzia ACC
            f.gap_ahead = g.gapAhead / 1000 if 0 < g.gapAhead < 3_600_000 else None
            f.gap_behind = g.gapBehind / 1000 if 0 < g.gapBehind < 3_600_000 else None
        else:
            f.pos_x, f.pos_z = g.carCoordinates[0], g.carCoordinates[2]
            # v AC sú tc/abs úrovne asistentov (0 = vypnuté)
            f.tc = round(p.tc, 2) if p.tc else None
            f.abs = round(p.abs, 2) if p.abs else None
        return f

"""RaceRoom Racing Experience - zdieľaná pamäť "$R3E" (r3e.h, verzia 3, pack 1)."""
import asyncio
import ctypes
import math
import time

from ..model import Frame
from ..winapi import SharedMemory
from .base import Source

I = ctypes.c_int32
F = ctypes.c_float
D = ctypes.c_double
U8 = ctypes.c_uint8


class _S(ctypes.Structure):
    _pack_ = 1


class Vec3F64(_S):
    _fields_ = [("x", D), ("y", D), ("z", D)]


class Vec3F32(_S):
    _fields_ = [("x", F), ("y", F), ("z", F)]


class Ori(_S):
    _fields_ = [("pitch", F), ("yaw", F), ("roll", F)]


class PlayerData(_S):
    _fields_ = [
        ("user_id", I), ("game_simulation_ticks", I), ("game_simulation_time", D),
        ("position", Vec3F64), ("velocity", Vec3F64), ("local_velocity", Vec3F64),
        ("acceleration", Vec3F64), ("local_acceleration", Vec3F64), ("orientation", Vec3F64),
        ("rotation", Vec3F64), ("angular_acceleration", Vec3F64), ("angular_velocity", Vec3F64),
        ("local_angular_velocity", Vec3F64), ("local_g_force", Vec3F64),
        ("steering_force", D), ("steering_force_percentage", D), ("engine_torque", D),
        ("current_downforce", D), ("voltage", D), ("ers_level", D), ("power_mgu_h", D),
        ("power_mgu_k", D), ("torque_mgu_k", D), ("suspension_deflection", D * 4),
        ("suspension_velocity", D * 4), ("camber", D * 4), ("ride_height", D * 4),
        ("front_wing_height", D), ("front_roll_angle", D), ("rear_roll_angle", D),
        ("third_spring_suspension_deflection_front", D), ("third_spring_suspension_velocity_front", D),
        ("third_spring_suspension_deflection_rear", D), ("third_spring_suspension_velocity_rear", D),
        ("unused1", D), ("unused2", D), ("unused3", D),
    ]


class Flags(_S):
    _fields_ = [
        ("yellow", I), ("yellowCausedIt", I), ("yellowOvertake", I), ("yellowPositionsGained", I),
        ("sector_yellow", I * 3), ("closest_yellow_distance_into_track", F), ("blue", I),
        ("black", I), ("green", I), ("checkered", I), ("white", I), ("black_and_white", I),
    ]


class CutTrackPenalties(_S):
    _fields_ = [("drive_through", F), ("stop_and_go", F), ("pit_stop", F),
                ("time_deduction", F), ("slow_down", F)]


class DriverInfo(_S):
    _fields_ = [
        ("name", U8 * 64), ("car_number", I), ("class_id", I), ("model_id", I), ("team_id", I),
        ("livery_id", I), ("manufacturer_id", I), ("user_id", I), ("slot_id", I),
        ("class_performance_index", I), ("engine_type", I), ("car_width", F), ("car_length", F),
        ("rating", F), ("reputation", F), ("unused1", F), ("unused2", F),
    ]


class AidSettings(_S):
    _fields_ = [("abs", I), ("tc", I), ("esp", I), ("countersteer", I), ("cornering", I)]


class Drs(_S):
    _fields_ = [("equipped", I), ("available", I), ("numActivationsLeft", I), ("engaged", I)]


class PushToPass(_S):
    _fields_ = [("available", I), ("engaged", I), ("amount_left", I),
                ("engaged_time_left", F), ("wait_time_left", F)]


class TireTemp(_S):
    _fields_ = [("current_temp", F * 3), ("optimal_temp", F), ("cold_temp", F), ("hot_temp", F)]


class BrakeTemp(_S):
    _fields_ = [("current_temp", F), ("optimal_temp", F), ("cold_temp", F), ("hot_temp", F)]


class CarDamage(_S):
    _fields_ = [("engine", F), ("transmission", F), ("aerodynamics", F), ("suspension", F),
                ("unused1", F), ("unused2", F)]


class Shared(_S):
    _fields_ = [
        ("version_major", I), ("version_minor", I), ("all_drivers_offset", I),
        ("driver_data_size", I), ("game_mode", I), ("game_paused", I), ("game_in_menus", I),
        ("game_in_replay", I), ("game_using_vr", I), ("game_player_in_garage", I),
        ("player", PlayerData),
        ("track_name", U8 * 64), ("layout_name", U8 * 64), ("track_id", I), ("layout_id", I),
        ("layout_length", F), ("sector_start_factors", F * 3), ("race_session_laps", I * 3),
        ("race_session_minutes", I * 3), ("event_index", I), ("session_type", I),
        ("session_iteration", I), ("session_length_format", I), ("session_pit_speed_limit", F),
        ("session_phase", I), ("start_lights", I), ("tire_wear_active", I),
        ("fuel_use_active", I), ("number_of_laps", I), ("session_time_duration", F),
        ("session_time_remaining", F), ("max_incident_points", I), ("start_mode", I),
        ("start_group_count", I),
        ("pit_window_status", I), ("pit_window_start", I), ("pit_window_end", I),
        ("in_pitlane", I), ("pit_menu_selection", I), ("pit_menu_state", I * 12),
        ("pit_state", I), ("pit_total_duration", F), ("pit_elapsed_time", F), ("pit_action", I),
        ("num_pitstops", I), ("pit_min_duration_total", F), ("pit_min_duration_left", F),
        ("flags", Flags), ("position", I), ("position_class", I), ("finish_status", I),
        ("cut_track_warnings", I), ("penalties", CutTrackPenalties), ("num_penalties", I),
        ("completed_laps", I), ("current_lap_valid", I), ("track_sector", I),
        ("lap_distance", F), ("lap_distance_fraction", F), ("lap_time_best_leader", F),
        ("lap_time_best_leader_class", F), ("session_best_lap_sector_times", F * 3),
        ("lap_time_best_self", F), ("sector_time_best_self", F * 3),
        ("lap_time_previous_self", F), ("sector_time_previous_self", F * 3),
        ("lap_time_current_self", F), ("sector_time_current_self", F * 3),
        ("lap_time_delta_leader", F), ("lap_time_delta_leader_class", F),
        ("time_delta_front", F), ("time_delta_behind", F), ("time_delta_best_self", F),
        ("best_individual_sector_time_self", F * 3), ("best_individual_sector_time_leader", F * 3),
        ("best_individual_sector_time_leader_class", F * 3), ("incident_points", I),
        ("lap_valid_state", I), ("prev_lap_valid", I), ("discharge_rate", F), ("brake_regen", F),
        ("unused1", F),
        ("vehicle_info", DriverInfo), ("player_name", U8 * 64), ("control_type", I),
        ("car_speed", F), ("engine_rps", F), ("max_engine_rps", F), ("upshift_rps", F),
        ("gear", I), ("num_gears", I), ("car_cg_location", Vec3F32), ("car_orientation", Ori),
        ("local_acceleration", Vec3F32), ("total_mass", F), ("fuel_left", F),
        ("fuel_capacity", F), ("fuel_per_lap", F), ("virtual_energy_left", F),
        ("virtual_energy_capacity", F), ("virtual_energy_per_lap", F), ("engine_temp", F),
        ("engine_oil_temp", F), ("fuel_pressure", F), ("engine_oil_pressure", F),
        ("turbo_pressure", F), ("throttle", F), ("throttle_raw", F), ("brake", F),
        ("brake_raw", F), ("clutch", F), ("clutch_raw", F), ("steer_input_raw", F),
        ("steer_lock_degrees", I), ("steer_wheel_range_degrees", I),
        ("aid_settings", AidSettings), ("drs", Drs), ("pit_limiter", I),
        ("push_to_pass", PushToPass), ("brake_bias", F), ("drs_numActivationsTotal", I),
        ("ptp_numActivationsTotal", I), ("battery_soc", F), ("water_left", F),
        ("abs_setting", I), ("headlights", I), ("steer_wheel_max_rotation", I), ("tire_type", I),
        ("tire_rps", F * 4), ("tire_speed", F * 4), ("tire_grip", F * 4), ("tire_wear", F * 4),
        ("tire_flatspot", I * 4), ("tire_pressure", F * 4), ("tire_dirt", F * 4),
        ("tire_temp", TireTemp * 4), ("tire_type_front", I), ("tire_type_rear", I),
        ("tire_subtype_front", I), ("tire_subtype_rear", I), ("brake_temp", BrakeTemp * 4),
        ("brake_pressure", F * 4), ("traction_control_setting", I), ("engine_map_setting", I),
        ("engine_brake_setting", I), ("traction_control_percent", F), ("tire_on_mtrl", I * 4),
        ("tire_load", F * 4), ("car_damage", CarDamage), ("num_cars", I),
    ]


RPS_TO_RPM = 60 / (2 * math.pi)
KPA_TO_PSI = 0.1450377


def _text(arr):
    return bytes(arr).split(b"\0", 1)[0].decode("utf-8", "replace")


def _opt(v, scale=1.0, nd=1):
    return None if v is None or v < 0 else round(v * scale, nd)


class RaceRoomSource(Source):
    id = "r3e"
    name = "RaceRoom"

    def __init__(self, settings, emit):
        super().__init__(settings, emit)
        self.shm = SharedMemory("$R3E", Shared)
        self._last_tick = None
        self._last_change = 0.0

    def close(self):
        self.shm.close()

    async def run(self):
        try:
            while True:
                await asyncio.sleep(1 / 60 if self._tick() else 1.0)
        finally:
            self.close()

    def _tick(self):
        d = self.shm.read()
        if d is None or d.version_major != 3:
            return False
        now = time.monotonic()
        if d.player.game_simulation_ticks != self._last_tick:
            self._last_tick = d.player.game_simulation_ticks
            self._last_change = now
        idle = d.game_paused or d.game_in_menus
        if now - self._last_change > 2.0 and not idle:
            if now - self._last_change > 5.0:
                self.close()  # hra skončila - uvoľníme pamäť
                self._last_change = now
            return False
        if d.game_in_menus and d.car_speed == 0 and d.engine_rps <= 0:
            return False
        self.emit(self._frame(d))
        return True

    def _frame(self, d):
        f = Frame(source=self.id, game=self.name, connected=True)
        f.paused = bool(d.game_paused or d.game_in_menus or d.game_in_replay)
        # zdieľaná pamäť obsahuje len ID modelu, nie jeho názov
        f.car = f"Model {d.vehicle_info.model_id} (trieda {d.vehicle_info.class_id})"
        layout = _text(d.layout_name)
        f.track = _text(d.track_name) + (f" - {layout}" if layout else "")
        f.track_length = max(0.0, d.layout_length)
        f.speed = d.car_speed * 3.6
        f.rpm = max(0.0, d.engine_rps * RPS_TO_RPM)
        f.max_rpm = max(0.0, d.max_engine_rps * RPS_TO_RPM)
        f.gear = d.gear
        f.throttle = max(0.0, d.throttle)
        f.brake = max(0.0, d.brake)
        f.clutch = max(0.0, d.clutch)
        f.steer = max(-1.0, min(1.0, d.steer_input_raw))
        f.fuel = _opt(d.fuel_left, nd=2)
        f.fuel_capacity = _opt(d.fuel_capacity)
        f.lap = max(0, d.completed_laps)
        f.total_laps = max(0, d.number_of_laps)
        f.position = max(0, d.position)
        # odstupy v s; -1 = nie je k dispozícii
        f.gap_ahead = round(d.time_delta_front, 3) if d.time_delta_front > 0 else None
        f.gap_behind = round(d.time_delta_behind, 3) if d.time_delta_behind > 0 else None
        f.lap_time = max(0.0, d.lap_time_current_self)
        f.last_lap = max(0.0, d.lap_time_previous_self)
        f.best_lap = max(0.0, d.lap_time_best_self)
        f.lap_dist = d.lap_distance if d.lap_distance >= 0 else -1.0
        f.sector = max(0, d.track_sector - 1)
        f.pos_x, f.pos_z = d.player.position.x, d.player.position.z
        f.g_lat = d.player.local_g_force.x
        f.g_lon = d.player.local_g_force.z
        f.tyre_temp = [round(t.current_temp[1], 1) if t.current_temp[1] > -1 else None
                       for t in d.tire_temp]
        f.tyre_pressure = [_opt(p, KPA_TO_PSI) for p in d.tire_pressure]
        f.tyre_wear = [_opt(w, 100) for w in d.tire_wear]
        f.brake_temp = [_opt(b.current_temp, nd=0) for b in d.brake_temp]
        f.tc = d.traction_control_setting if d.traction_control_setting >= 0 else None
        f.abs = d.abs_setting if d.abs_setting >= 0 else None
        f.engine_map = d.engine_map_setting if d.engine_map_setting >= 0 else None
        if d.brake_bias >= 0:
            # R3E posiela podiel zadnej nápravy
            f.brake_bias = round((1 - d.brake_bias) * 100, 1)
        f.pit_limiter = d.pit_limiter == 1
        f.in_pit = d.in_pitlane == 1
        f.drs = d.drs.engaged == 1
        f.lights = d.headlights if d.headlights >= 0 else None
        f.water_temp = _opt(d.engine_temp)
        if d.flags.checkered == 1:
            f.flag = "checkered"
        elif d.flags.black == 1:
            f.flag = "black"
        elif d.flags.blue == 1:
            f.flag = "blue"
        elif d.flags.yellow == 1:
            f.flag = "yellow"
        elif d.flags.green == 1:
            f.flag = "green"
        return f

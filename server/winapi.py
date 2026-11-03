"""Windows API pomocníci: čítanie zdieľanej pamäte (len otvorenie, nikdy nevytvára)
a zoznam bežiacich procesov."""
import ctypes
import sys

IS_WINDOWS = sys.platform == "win32"

if IS_WINDOWS:
    from ctypes import wintypes

    _k32 = ctypes.WinDLL("kernel32", use_last_error=True)

    FILE_MAP_READ = 0x0004
    _k32.OpenFileMappingW.argtypes = [wintypes.DWORD, wintypes.BOOL, wintypes.LPCWSTR]
    _k32.OpenFileMappingW.restype = wintypes.HANDLE
    _k32.MapViewOfFile.argtypes = [wintypes.HANDLE, wintypes.DWORD, wintypes.DWORD,
                                   wintypes.DWORD, ctypes.c_size_t]
    _k32.MapViewOfFile.restype = ctypes.c_void_p
    _k32.UnmapViewOfFile.argtypes = [ctypes.c_void_p]
    _k32.UnmapViewOfFile.restype = wintypes.BOOL
    _k32.CloseHandle.argtypes = [wintypes.HANDLE]
    _k32.CloseHandle.restype = wintypes.BOOL

    class _MBI(ctypes.Structure):
        _fields_ = [("BaseAddress", ctypes.c_void_p), ("AllocationBase", ctypes.c_void_p),
                    ("AllocationProtect", wintypes.DWORD), ("RegionSize", ctypes.c_size_t),
                    ("State", wintypes.DWORD), ("Protect", wintypes.DWORD), ("Type", wintypes.DWORD)]

    _k32.VirtualQuery.argtypes = [ctypes.c_void_p, ctypes.POINTER(_MBI), ctypes.c_size_t]
    _k32.VirtualQuery.restype = ctypes.c_size_t

    TH32CS_SNAPPROCESS = 0x2

    class _PE32(ctypes.Structure):
        _fields_ = [("dwSize", wintypes.DWORD), ("cntUsage", wintypes.DWORD),
                    ("th32ProcessID", wintypes.DWORD), ("th32DefaultHeapID", ctypes.c_size_t),
                    ("th32ModuleID", wintypes.DWORD), ("cntThreads", wintypes.DWORD),
                    ("th32ParentProcessID", wintypes.DWORD), ("pcPriClassBase", ctypes.c_long),
                    ("dwFlags", wintypes.DWORD), ("szExeFile", ctypes.c_wchar * 260)]

    _k32.CreateToolhelp32Snapshot.argtypes = [wintypes.DWORD, wintypes.DWORD]
    _k32.CreateToolhelp32Snapshot.restype = wintypes.HANDLE
    _k32.Process32FirstW.argtypes = [wintypes.HANDLE, ctypes.POINTER(_PE32)]
    _k32.Process32FirstW.restype = wintypes.BOOL
    _k32.Process32NextW.argtypes = [wintypes.HANDLE, ctypes.POINTER(_PE32)]
    _k32.Process32NextW.restype = wintypes.BOOL


class SharedMemory:
    """Read-only pohľad na existujúcu pomenovanú zdieľanú pamäť hry.

    Používa OpenFileMapping, takže pamäť nikdy nevytvorí - inak by hra mohla dostať
    menší blok, než očakáva."""

    def __init__(self, name, struct_type):
        self.name = name
        self.struct_type = struct_type
        self.size = ctypes.sizeof(struct_type)
        self._handle = None
        self._view = None

    def _open(self):
        if not IS_WINDOWS:
            return False
        handle = _k32.OpenFileMappingW(FILE_MAP_READ, False, self.name)
        if not handle:
            return False
        view = _k32.MapViewOfFile(handle, FILE_MAP_READ, 0, 0, 0)
        if not view:
            _k32.CloseHandle(handle)
            return False
        mbi = _MBI()
        if _k32.VirtualQuery(view, ctypes.byref(mbi), ctypes.sizeof(mbi)) and mbi.RegionSize < self.size:
            _k32.UnmapViewOfFile(view)
            _k32.CloseHandle(handle)
            return False
        self._handle, self._view = handle, view
        return True

    def read(self):
        if self._view is None and not self._open():
            return None
        return self.struct_type.from_buffer_copy(ctypes.string_at(self._view, self.size))

    def close(self):
        if self._view:
            _k32.UnmapViewOfFile(self._view)
        if self._handle:
            _k32.CloseHandle(self._handle)
        self._handle = self._view = None


def running_processes():
    """Množina názvov exe (malými písmenami) bežiacich procesov."""
    if not IS_WINDOWS:
        return set()
    snap = _k32.CreateToolhelp32Snapshot(TH32CS_SNAPPROCESS, 0)
    if not snap or snap == wintypes.HANDLE(-1).value:
        return set()
    names = set()
    try:
        entry = _PE32()
        entry.dwSize = ctypes.sizeof(_PE32)
        ok = _k32.Process32FirstW(snap, ctypes.byref(entry))
        while ok:
            names.add(entry.szExeFile.lower())
            ok = _k32.Process32NextW(snap, ctypes.byref(entry))
    finally:
        _k32.CloseHandle(snap)
    return names

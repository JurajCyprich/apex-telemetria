from .assetto import AssettoSource
from .demo import DemoSource
from .f1 import F1Source
from .forza import ForzaSource
from .gt7 import GT7Source
from .raceroom import RaceRoomSource

SOURCES = {cls.id: cls for cls in
           (AssettoSource, RaceRoomSource, F1Source, ForzaSource, GT7Source, DemoSource)}

"""fabric-skills-settings: install Microsoft Fabric agent profiles into a target repo."""

from importlib.metadata import PackageNotFoundError, version

try:
    __version__ = version("fabric-skills-settings")
except PackageNotFoundError:
    __version__ = "0+unknown"

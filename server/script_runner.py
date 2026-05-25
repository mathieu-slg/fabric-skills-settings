"""Shared subprocess helper for the remaining MCP tool wrappers that shell
out to standalone CLI scripts (currently semantic_model/inspect.py,
validate/pipeline-lineage.py, data/mock-data-generator.py).

Used by tools.py modules under server/tools/<area>/.

Conventions:
- All helpers honor FABRIC_PROJECT_ROOT to locate the target project tree.
  We pass through whatever the server process has set.
- All helpers print results to stdout and diagnostics to stderr.
- Non-zero exit codes raise RuntimeError with stderr included.
- We never include raw stdout/stderr in audit logs (handled by CallTimer).
"""

from __future__ import annotations

import os
import subprocess
import sys
from pathlib import Path


def run_script(script: Path, args: list[str], *, timeout: int = 3600) -> str:
    """Run a Fabric helper script and return its stdout.

    Raises RuntimeError with stderr if the script exits non-zero.
    """
    if not script.is_file():
        raise RuntimeError(f"helper script not found: {script}")

    env = os.environ.copy()
    # FABRIC_PROJECT_ROOT may be set by the server's deployment context
    # (Docker mounts the target repo there). Leave it alone if already set.
    proc = subprocess.run(
        [sys.executable, str(script), *args],
        capture_output=True,
        text=True,
        timeout=timeout,
        env=env,
        check=False,
    )
    if proc.returncode != 0:
        raise RuntimeError(
            f"{script.name} exited with code {proc.returncode}: {proc.stderr.strip()}"
        )
    return proc.stdout

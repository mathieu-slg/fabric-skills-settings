"""FastMCP wrapper for the deterministic lint scaffold (server/tools/lint/).

The lints are pure Python — no subprocess; we import the package and call
``run_all`` directly. ``target_dir`` is the project root to scan. For dev,
this is the user's project path; in Docker it's whatever the user mounted.
"""

from __future__ import annotations

import io
from pathlib import Path

from mcp.server.fastmcp import FastMCP

from ...audit import CallTimer
from . import LINTS
from .core import emit_report, run_all


def register(mcp: FastMCP) -> None:
    @mcp.tool()
    def lint_run(target_dir: str) -> str:
        """Run all registered lints (SEC-01 hardcoded secrets, DE-09 Faker seed)
        against the given project directory. Returns the formatted findings report.

        target_dir: absolute path to the project root the server can read (in
            Docker this is whatever the user mounted; locally this is the
            project repo path).
        """
        with CallTimer("lint_run", {"target_dir": target_dir}) as t:
            root = Path(target_dir).resolve()
            if not root.is_dir():
                raise RuntimeError(f"target_dir does not exist or is not a directory: {root}")
            findings, code = run_all(LINTS, root)
            buf = io.StringIO()
            emit_report(findings, root, stream=buf)
            t.ok()
            report = buf.getvalue()
            if code != 0:
                report += f"\n(lint exit code: {code})"
            return report

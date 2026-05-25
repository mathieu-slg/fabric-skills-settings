"""FastMCP wrapper aggregating the pre-commit checks (lint + pipeline-lineage).

Mirrors server/tools/pre-commit-check.{ps1,sh} but runs the steps in-process
so they're callable as a single MCP tool without spawning a shell.
"""

from __future__ import annotations

import io
import os
import subprocess
import sys
from pathlib import Path

from mcp.server.fastmcp import FastMCP

from ...audit import CallTimer
from ..lint import LINTS
from ..lint.core import emit_report, run_all

_VALIDATE = Path(__file__).resolve().parent.parent / "validate" / "pipeline-lineage.py"


def register(mcp: FastMCP) -> None:
    @mcp.tool()
    def precommit_run(target_dir: str) -> str:
        """Run pre-commit checks (pipeline-lineage + deterministic lints) on a project.

        Returns a combined report. Aggregate exit status is appended at the end
        and is non-zero if any check failed.
        """
        with CallTimer("precommit_run", {"target_dir": target_dir}) as t:
            root = Path(target_dir).resolve()
            if not root.is_dir():
                raise RuntimeError(f"target_dir does not exist: {root}")

            report = io.StringIO()
            failed = False

            # 1. Pipeline staging-path consistency
            report.write("── Pipeline staging-path consistency ──\n")
            proc = subprocess.run(
                [sys.executable, str(_VALIDATE)],
                cwd=root,
                capture_output=True,
                text=True,
                env=os.environ.copy(),
            )
            report.write(proc.stdout)
            if proc.stderr:
                report.write(proc.stderr)
            if proc.returncode != 0:
                failed = True
                report.write("✗ pipeline-lineage failed\n")
            else:
                report.write("✓ pipeline-lineage passed\n")

            # 2. Deterministic lints
            report.write("\n── Deterministic lints ──\n")
            findings, code = run_all(LINTS, root)
            emit_report(findings, root, stream=report)
            if code != 0:
                failed = True

            report.write("\n" + "═" * 44 + "\n")
            report.write(
                "✗ Pre-commit checks failed\n" if failed
                else "✓ All pre-commit checks passed\n"
            )
            t.ok()
            return report.getvalue()

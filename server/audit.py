"""Structured-JSON audit log to stdout.

One JSON line per tool call. Same SHA-256-first-16-chars args-hash
convention as the legacy ``mcp/server.py:_audit``. Argument values are
never logged raw — only the hash. Container log aggregator (docker logs /
App Insights / Loki) picks up stdout.
"""

from __future__ import annotations

import hashlib
import json
import sys
import time
from datetime import datetime, timezone
from typing import Any


def args_hash(arguments: dict[str, Any]) -> str:
    """Stable SHA-256-first-16-chars hash of the JSON-serialised arguments."""
    payload = json.dumps(arguments, sort_keys=True, default=str).encode("utf-8")
    return hashlib.sha256(payload).hexdigest()[:16]


def log_call(
    tool: str,
    arguments: dict[str, Any],
    *,
    status: str,
    latency_ms: int | None = None,
    error: str | None = None,
) -> None:
    """Emit one audit line. status in {"ok", "error"}."""
    entry: dict[str, Any] = {
        "ts": datetime.now(timezone.utc).isoformat(),
        "tool": tool,
        "args_hash": args_hash(arguments),
        "status": status,
    }
    if latency_ms is not None:
        entry["latency_ms"] = latency_ms
    if error:
        entry["error"] = error
    print(json.dumps(entry, separators=(",", ":")), flush=True)


class CallTimer:
    """Context manager that emits an audit line on exit.

    ``with CallTimer("fabric_list", arguments) as t: ...; t.ok()`` /
    ``t.error("msg")``. If neither is called the line shows status="error"
    with the exception type.
    """

    def __init__(self, tool: str, arguments: dict[str, Any]) -> None:
        self.tool = tool
        self.arguments = arguments
        self._start = 0.0
        self._status: str | None = None
        self._error: str | None = None

    def __enter__(self) -> "CallTimer":
        self._start = time.monotonic()
        return self

    def ok(self) -> None:
        self._status = "ok"

    def error(self, msg: str) -> None:
        self._status = "error"
        self._error = msg

    def __exit__(self, exc_type, exc, tb) -> None:
        if self._status is None:
            self._status = "error"
            self._error = f"{exc_type.__name__}: {exc}" if exc else "no status set"
        latency_ms = int((time.monotonic() - self._start) * 1000)
        log_call(
            self.tool,
            self.arguments,
            status=self._status,
            latency_ms=latency_ms,
            error=self._error,
        )
        # Don't suppress exceptions.

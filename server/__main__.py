"""Uvicorn entrypoint — ``python -m server``.

Reads ``PORT`` (default 8000) and binds to ``0.0.0.0`` so it's reachable
from outside the container. Local-only deploys should map the port to
``127.0.0.1`` on the host to avoid LAN exposure.
"""

from __future__ import annotations

import os
import sys

import uvicorn

from .app import build_app


def main() -> int:
    port = int(os.environ.get("PORT", "8000"))
    host = os.environ.get("HOST", "0.0.0.0")
    log_level = os.environ.get("LOG_LEVEL", "info").lower()
    app = build_app()
    print(f"fabric-server listening on http://{host}:{port}/mcp", file=sys.stderr)
    uvicorn.run(app, host=host, port=port, log_level=log_level)
    return 0


if __name__ == "__main__":
    sys.exit(main())

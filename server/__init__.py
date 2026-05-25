"""Fabric MCP server — Docker-hosted FastMCP service.

Consolidates the legacy stdio `mcp/server.py` (Fabric CLI wrapper) and
`mcp/graph-server.py` (knowledge graph) into a single long-running HTTP
process. Same tool surface, different transport.

Run with::

    docker compose up --build              # from server/
    # or, without Docker:
    python -m server

Listens on ``$PORT`` (default 8000) at ``/mcp``.
"""

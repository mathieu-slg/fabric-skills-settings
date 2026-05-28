"""Pure-ASGI authentication middleware for the Fabric MCP server.

Handles the ``/auth/login`` and ``/auth/refresh`` endpoints and enforces a
valid Bearer JWT on every other request. Key sourcing lives in
``repository.py`` and JWT handling in ``tokens.py`` — this module only wires
them onto the ASGI request flow.
"""

from __future__ import annotations

import json

from .repository import load_api_keys
from .tokens import JtiStore, decode_jwt, jwt_secret, mint_jwt

_LOGIN_PATH = "/auth/login"
_REFRESH_PATH = "/auth/refresh"


async def _read_body(receive, max_bytes: int = 16_384) -> bytes:
    body = b""
    while True:
        event = await receive()
        if event["type"] == "http.request":
            body += event.get("body", b"")
            if len(body) > max_bytes:
                raise ValueError("request body too large")
            if not event.get("more_body", False):
                break
        elif event["type"] == "http.disconnect":
            break
    return body


async def _send_json(send, data: dict, status: int) -> None:
    body = json.dumps(data).encode("utf-8")
    await send({
        "type": "http.response.start",
        "status": status,
        "headers": [
            (b"content-type", b"application/json"),
            (b"content-length", str(len(body)).encode()),
        ],
    })
    await send({"type": "http.response.body", "body": body})


class FabricAuthMiddleware:
    """Pure-ASGI middleware: handles /auth/login, /auth/refresh, and JWT validation.

    All non-auth paths require Authorization: Bearer <jwt>. The JWT is obtained
    by POSTing {"api_key": "..."} to /auth/login. Refresh via POST /auth/refresh
    with the current token in the Authorization header — the old JTI is revoked,
    preventing replay of the superseded token.
    """

    def __init__(self, app, *, api_keys: set[str], secret: str, jti_store: JtiStore) -> None:
        self.app = app
        self._api_keys = api_keys
        self._secret = secret
        self._jti_store = jti_store

    async def __call__(self, scope, receive, send) -> None:
        if scope["type"] not in ("http", "websocket"):
            await self.app(scope, receive, send)
            return

        if scope["type"] == "http":
            path = scope.get("path", "")
            if path == _LOGIN_PATH:
                await self._login(receive, send)
                return
            if path == _REFRESH_PATH:
                await self._refresh(scope, receive, send)
                return

        token = self._extract_token(scope)
        if not token:
            if scope["type"] == "http":
                await _send_json(send, {"error": "missing_token"}, 401)
            return

        payload = decode_jwt(token, self._secret, self._jti_store)
        if payload is None:
            if scope["type"] == "http":
                await _send_json(send, {"error": "invalid_token"}, 401)
            return

        await self.app(scope, receive, send)

    async def _login(self, receive, send) -> None:
        try:
            body = await _read_body(receive)
            data = json.loads(body)
        except (ValueError, json.JSONDecodeError):
            await _send_json(send, {"error": "invalid_request"}, 400)
            return
        api_key = data.get("api_key", "")
        if not api_key or api_key not in self._api_keys:
            await _send_json(send, {"error": "invalid_api_key"}, 401)
            return
        token, expiry = mint_jwt("client", self._secret, self._jti_store)
        await _send_json(send, {"token": token, "expires_at": expiry, "token_type": "Bearer"}, 200)

    async def _refresh(self, scope, receive, send) -> None:
        await _read_body(receive)  # consume body to keep ASGI lifecycle clean
        old_token = self._extract_token(scope)
        if not old_token:
            await _send_json(send, {"error": "missing_token"}, 401)
            return
        old_payload = decode_jwt(old_token, self._secret, self._jti_store)
        if old_payload is None:
            await _send_json(send, {"error": "invalid_token"}, 401)
            return
        self._jti_store.revoke(old_payload["jti"])
        token, expiry = mint_jwt(old_payload.get("sub", "client"), self._secret, self._jti_store)
        await _send_json(send, {"token": token, "expires_at": expiry, "token_type": "Bearer"}, 200)

    @staticmethod
    def _extract_token(scope) -> str | None:
        headers = {k.lower(): v for k, v in scope.get("headers", [])}
        auth = headers.get(b"authorization", b"").decode("utf-8", errors="replace")
        if auth.startswith("Bearer ") and len(auth) > 7:
            return auth[7:]
        return None


def install_auth_middleware(app) -> bool:
    """Add :class:`FabricAuthMiddleware` to ``app`` when API keys are configured.

    Reads the configured key sources and, if any keys exist, requires a JWT
    secret and installs the middleware. Returns ``True`` when auth was enabled,
    ``False`` for local single-user dev mode (no keys configured). Raises
    ``RuntimeError`` if keys exist but ``FABRIC_MCP_JWT_SECRET`` is unset.
    """
    api_keys = load_api_keys()
    if not api_keys:
        return False
    secret = jwt_secret()
    if not secret:
        raise RuntimeError(
            "FABRIC_MCP_JWT_SECRET must be set when API key auth is enabled. "
            "Generate one with: python -c \"import secrets; print(secrets.token_hex(32))\""
        )
    app.add_middleware(
        FabricAuthMiddleware,
        api_keys=api_keys,
        secret=secret,
        jti_store=JtiStore(),
    )
    return True

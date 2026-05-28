"""JWT minting/verification and the replay-guard JTI store.

The server hands clients a short-lived HS256 JWT after they present a valid API
key (see ``middleware.py``). Every issued token carries a unique ``jti`` tracked
in :class:`JtiStore` so revoked or forged tokens can be rejected even if their
signature would otherwise verify.
"""

from __future__ import annotations

import os
import time
import uuid

import jwt  # PyJWT

_JWT_ALGORITHM = "HS256"
_JWT_EXPIRY_SECONDS = 3600  # 1 hour


def jwt_secret() -> str:
    """Read the HS256 signing secret from the environment."""
    return os.environ.get("FABRIC_MCP_JWT_SECRET", "").strip()


class JtiStore:
    """Track issued JTIs to prevent replay of revoked or forged tokens."""

    def __init__(self) -> None:
        self._store: dict[str, float] = {}  # jti -> expiry (unix timestamp)

    def issue(self, jti: str, expiry: float) -> None:
        self._store[jti] = expiry
        self._purge()

    def revoke(self, jti: str) -> None:
        self._store.pop(jti, None)

    def is_valid(self, jti: str) -> bool:
        exp = self._store.get(jti)
        return exp is not None and time.time() < exp

    def _purge(self) -> None:
        now = time.time()
        stale = [j for j, e in self._store.items() if e <= now]
        for j in stale:
            del self._store[j]


def mint_jwt(sub: str, secret: str, jti_store: JtiStore) -> tuple[str, float]:
    """Return (encoded_jwt, expires_at_unix_timestamp)."""
    jti = str(uuid.uuid4())
    now = time.time()
    expiry = now + _JWT_EXPIRY_SECONDS
    payload = {
        "sub": sub,
        "jti": jti,
        "iat": now,
        "exp": expiry,
        "iss": "fabric-mcp-server",
    }
    token = jwt.encode(payload, secret, algorithm=_JWT_ALGORITHM)
    jti_store.issue(jti, expiry)
    return token, expiry


def decode_jwt(token: str, secret: str, jti_store: JtiStore) -> dict | None:
    """Return the verified payload dict, or None if invalid / expired / replayed."""
    try:
        payload = jwt.decode(token, secret, algorithms=[_JWT_ALGORITHM])
    except jwt.PyJWTError:
        return None
    jti = payload.get("jti", "")
    if not jti_store.is_valid(jti):
        return None
    return payload

"""Authentication helpers for the Fabric MCP server.

The API-key store is loaded through a small repository abstraction so the
*source* of the keys (local disk vs Azure Blob Storage vs inline env var) can be
swapped at deploy time without touching the auth middleware. Callers use
:func:`load_api_keys`; see ``repository.py``.
"""

from .repository import (
    ApiKeyRepository,
    AzureBlobApiKeyRepository,
    CompositeApiKeyRepository,
    CsvApiKeyRepository,
    EnvVarApiKeyRepository,
    LocalFileApiKeyRepository,
    build_api_key_repository,
    build_csv_api_key_repository,
    load_api_keys,
    parse_api_keys_csv,
)

__all__ = [
    "ApiKeyRepository",
    "AzureBlobApiKeyRepository",
    "CompositeApiKeyRepository",
    "CsvApiKeyRepository",
    "EnvVarApiKeyRepository",
    "LocalFileApiKeyRepository",
    "build_api_key_repository",
    "build_csv_api_key_repository",
    "load_api_keys",
    "parse_api_keys_csv",
]

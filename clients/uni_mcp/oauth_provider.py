# SPDX-License-Identifier: AGPL-3.0-or-later

"""Single-user OAuth provider for the isolated remote MCP gateway."""

from __future__ import annotations

import base64
import hashlib
import json
import os
import re
import secrets
import sqlite3
import time
from pathlib import Path
from threading import RLock
from urllib.parse import quote, urlsplit

from cryptography.fernet import Fernet, InvalidToken
from mcp.server.auth.provider import (
    AccessToken,
    AuthorizationCode,
    AuthorizationParams,
    AuthorizeError,
    IdentityAssertionParams,
    RefreshToken,
    RegistrationError,
    TokenError,
    construct_redirect_uri,
)
from mcp.shared.auth import OAuthClientInformationFull, OAuthToken

SCOPE = "mcp"
READ_SCOPES = ['catalog:read', 'corpus:read', 'changes:read', 'actions:read', 'jobs:read']
VALID_SCOPES = {SCOPE, *READ_SCOPES, 'coding:propose'}
CODE_SECONDS = 300
PENDING_SECONDS = 600
ACCESS_SECONDS = 3600
REFRESH_SECONDS = 30 * 24 * 3600


class PrivateOAuthProvider:
    """DCR, PKCE codes and rotated tokens; encrypted state stays on the host."""

    def __init__(self, path: Path, master_secret: str, approval_pin: str,
                 issuer_url: str, resource_url: str):
        if len(master_secret) < 32 or not re.fullmatch(r"[0-9]{12,20}", approval_pin):
            raise ValueError("Fernzugriff braucht einen langen MCP-Token und eine zufällige 12- bis 20-stellige PIN")
        if path.is_symlink():
            raise ValueError("OAuth-Speicher darf kein Symlink sein")
        self.path = path
        self.issuer_url = issuer_url.rstrip("/")
        self.resource_url = resource_url
        self.pin_digest = hashlib.sha256(approval_pin.encode()).digest()
        key = base64.urlsafe_b64encode(hashlib.sha256(b"marc-uni-os-remote-oauth-v1\0" + master_secret.encode()).digest())
        self.cipher = Fernet(key)
        self.lock = RLock()
        path.parent.mkdir(parents=True, exist_ok=True)
        if os.name != "nt":
            path.parent.chmod(0o700)
        with self._connect() as db:
            db.execute("CREATE TABLE IF NOT EXISTS oauth_items ("
                       "kind TEXT NOT NULL, key_hash TEXT NOT NULL, payload BLOB NOT NULL, "
                       "expires_at INTEGER, family TEXT, attempts INTEGER NOT NULL DEFAULT 0, "
                       "PRIMARY KEY (kind, key_hash))")
            sample = db.execute("SELECT payload FROM oauth_items LIMIT 1").fetchone()
        if sample is not None:
            try:
                self.cipher.decrypt(sample[0])
            except InvalidToken as exc:
                raise ValueError("OAuth-Speicher passt nicht zum MCP_TOKEN") from exc
        if os.name != "nt":
            path.chmod(0o600)

    def _connect(self) -> sqlite3.Connection:
        if self.path.is_symlink():
            raise ValueError("OAuth-Speicher darf kein Symlink sein")
        return sqlite3.connect(self.path, timeout=5)

    @staticmethod
    def _key(raw: str) -> str:
        return hashlib.sha256(raw.encode()).hexdigest()

    def _put(self, kind: str, raw_key: str, payload: dict, expires_at: int | None = None,
             family: str | None = None) -> None:
        encrypted = self.cipher.encrypt(json.dumps(payload, separators=(",", ":")).encode())
        with self._connect() as db:
            db.execute("INSERT OR REPLACE INTO oauth_items(kind,key_hash,payload,expires_at,family) VALUES(?,?,?,?,?)",
                       (kind, self._key(raw_key), encrypted, expires_at, family))

    def _get(self, kind: str, raw_key: str) -> dict | None:
        with self._connect() as db:
            row = db.execute("SELECT payload,expires_at,attempts FROM oauth_items WHERE kind=? AND key_hash=?",
                             (kind, self._key(raw_key))).fetchone()
            if row is None:
                return None
            if row[1] is not None and row[1] < int(time.time()):
                db.execute("DELETE FROM oauth_items WHERE kind=? AND key_hash=?", (kind, self._key(raw_key)))
                return None
        result = json.loads(self.cipher.decrypt(row[0]))
        if kind == "pending":
            result["attempts"] = row[2]
        return result

    def _delete(self, kind: str, raw_key: str) -> None:
        with self._connect() as db:
            db.execute("DELETE FROM oauth_items WHERE kind=? AND key_hash=?", (kind, self._key(raw_key)))

    async def get_client(self, client_id: str) -> OAuthClientInformationFull | None:
        with self.lock:
            stored = self._get("client", client_id)
            return OAuthClientInformationFull.model_validate(stored) if stored else None

    async def register_client(self, client_info: OAuthClientInformationFull) -> None:
        if client_info.client_id is None or not client_info.redirect_uris or len(client_info.redirect_uris) > 5:
            raise RegistrationError(error="invalid_client_metadata", error_description="Client-Weiterleitungen fehlen")
        for redirect in client_info.redirect_uris:
            parsed = urlsplit(str(redirect))
            if (parsed.scheme != "https" and not (parsed.scheme == "http"
                                                   and parsed.hostname in {"localhost", "127.0.0.1", "::1"})):
                raise RegistrationError(error="invalid_redirect_uri", error_description="Weiterleitung braucht HTTPS")
        with self.lock:
            with self._connect() as db:
                db.execute("DELETE FROM oauth_items WHERE kind='client' AND expires_at < ?", (int(time.time()),))
                count = db.execute("SELECT COUNT(*) FROM oauth_items WHERE kind='client'").fetchone()[0]
            if count >= 32 and self._get("client", client_info.client_id) is None:
                raise RegistrationError(error="invalid_client_metadata", error_description="Zu viele Clients")
            self._put("client", client_info.client_id, client_info.model_dump(mode="json"),
                      int(time.time()) + 24 * 3600)

    async def authorize(self, client: OAuthClientInformationFull, params: AuthorizationParams) -> str:
        if (client.client_id is None or params.resource != self.resource_url
                or not set(params.scopes or [SCOPE]).issubset(VALID_SCOPES)):
            raise AuthorizeError(error="invalid_target", error_description="OAuth-Ziel oder Freigabe ist ungültig")
        ticket = secrets.token_urlsafe(32)
        with self.lock:
            with self._connect() as db:
                db.execute("DELETE FROM oauth_items WHERE kind='pending' AND expires_at < ?", (int(time.time()),))
                count = db.execute("SELECT COUNT(*) FROM oauth_items WHERE kind='pending'").fetchone()[0]
            if count >= 64:
                raise AuthorizeError(error="temporarily_unavailable")
            self._put("pending", ticket,
                      {"client_id": client.client_id, "params": params.model_dump(mode="json")},
                      int(time.time()) + PENDING_SECONDS)
        return f"{self.issuer_url}/approval?ticket={quote(ticket)}"

    def pending_details(self, ticket: str) -> tuple[str, str] | None:
        with self.lock:
            pending = self._get("pending", ticket)
            if pending is None or pending["attempts"] >= 5:
                return None
            client = self._get("client", pending["client_id"])
            if client is None:
                return None
            params = AuthorizationParams.model_validate(pending["params"])
            return str(client.get("client_name") or "Unbekannter Client")[:80], str(params.redirect_uri)

    def approve(self, ticket: str, pin: str) -> str:
        with self.lock:
            pending = self._get("pending", ticket)
            if pending is None or pending["attempts"] >= 5:
                raise ValueError("Freigabe ist abgelaufen")
            if not secrets.compare_digest(hashlib.sha256(pin.encode()).digest(), self.pin_digest):
                with self._connect() as db:
                    db.execute("UPDATE oauth_items SET attempts=attempts+1 WHERE kind='pending' AND key_hash=?",
                               (self._key(ticket),))
                raise ValueError("PIN ist ungültig")
            params = AuthorizationParams.model_validate(pending["params"])
            client = self._get("client", pending["client_id"])
            if client is None:
                raise ValueError("Freigabe ist abgelaufen")
            code = AuthorizationCode(
                code=secrets.token_urlsafe(32), client_id=pending["client_id"],
                scopes=params.scopes or [SCOPE], expires_at=time.time() + CODE_SECONDS,
                code_challenge=params.code_challenge, redirect_uri=params.redirect_uri,
                redirect_uri_provided_explicitly=params.redirect_uri_provided_explicitly,
                resource=params.resource, subject="owner",
            )
            self._put("code", code.code, code.model_dump(mode="json"), int(code.expires_at))
            self._put("client", pending["client_id"], client)
            self._delete("pending", ticket)
            return construct_redirect_uri(str(params.redirect_uri), code=code.code,
                                          state=params.state, iss=self.issuer_url)

    def pending_scopes(self, ticket: str) -> list[str]:
        with self.lock:
            pending = self._get('pending', ticket)
            return (AuthorizationParams.model_validate(pending['params']).scopes or [SCOPE]) if pending else []

    async def load_authorization_code(self, client: OAuthClientInformationFull,
                                      authorization_code: str) -> AuthorizationCode | None:
        with self.lock:
            stored = self._get("code", authorization_code)
            if stored is None or stored["client_id"] != client.client_id:
                return None
            return AuthorizationCode.model_validate(stored)

    def _mint_pair(self, client_id: str, scopes: list[str], resource: str | None) -> OAuthToken:
        now = int(time.time())
        family = secrets.token_hex(16)
        access = AccessToken(token=secrets.token_urlsafe(32), client_id=client_id, scopes=scopes,
                             expires_at=now + ACCESS_SECONDS, resource=resource, subject="owner")
        refresh = RefreshToken(token=secrets.token_urlsafe(32), client_id=client_id, scopes=scopes,
                               expires_at=now + REFRESH_SECONDS, resource=resource)
        self._put("access", access.token, access.model_dump(mode="json"), access.expires_at, family)
        self._put("refresh", refresh.token, refresh.model_dump(mode="json"), refresh.expires_at, family)
        return OAuthToken(access_token=access.token, token_type="Bearer", expires_in=ACCESS_SECONDS,
                          refresh_token=refresh.token, scope=" ".join(scopes))

    async def exchange_authorization_code(self, client: OAuthClientInformationFull,
                                          authorization_code: AuthorizationCode) -> OAuthToken:
        with self.lock:
            stored = self._get("code", authorization_code.code)
            if stored is None or stored["client_id"] != client.client_id:
                raise TokenError(error="invalid_grant")
            self._delete("code", authorization_code.code)
            return self._mint_pair(client.client_id, authorization_code.scopes, authorization_code.resource)

    async def load_access_token(self, token: str) -> AccessToken | None:
        with self.lock:
            stored = self._get("access", token)
            return AccessToken.model_validate(stored) if stored else None

    async def load_refresh_token(self, client: OAuthClientInformationFull,
                                 refresh_token: str) -> RefreshToken | None:
        with self.lock:
            stored = self._get("refresh", refresh_token)
            if stored is None or stored["client_id"] != client.client_id:
                return None
            return RefreshToken.model_validate(stored)

    async def exchange_refresh_token(self, client: OAuthClientInformationFull, refresh_token: RefreshToken,
                                     scopes: list[str]) -> OAuthToken:
        with self.lock:
            current = await self.load_refresh_token(client, refresh_token.token)
            if current is None or not set(scopes).issubset(set(current.scopes)):
                raise TokenError(error="invalid_grant" if current is None else "invalid_scope")
            with self._connect() as db:
                row = db.execute("SELECT family FROM oauth_items WHERE kind='refresh' AND key_hash=?",
                                 (self._key(refresh_token.token),)).fetchone()
                if row is None:
                    raise TokenError(error="invalid_grant")
                db.execute("DELETE FROM oauth_items WHERE family=?", (row[0],))
            return self._mint_pair(client.client_id, scopes or current.scopes, current.resource)

    async def revoke_token(self, token: AccessToken | RefreshToken) -> None:
        with self.lock, self._connect() as db:
            row = db.execute("SELECT family FROM oauth_items WHERE kind IN ('access','refresh') AND key_hash=?",
                             (self._key(token.token),)).fetchone()
            if row:
                db.execute("DELETE FROM oauth_items WHERE family=?", (row[0],))

    async def exchange_identity_assertion(self, client: OAuthClientInformationFull,
                                          params: IdentityAssertionParams) -> OAuthToken:
        raise TokenError(error="unsupported_grant_type")

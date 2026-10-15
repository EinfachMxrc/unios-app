# SPDX-License-Identifier: AGPL-3.0-or-later

import json
import os
from functools import lru_cache
from ipaddress import ip_address, ip_network
from pathlib import Path
from typing import Literal
from urllib.parse import urlsplit
from zoneinfo import ZoneInfo

from pydantic import Field, field_validator, model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class RemoteAddressNotConfigured(Exception):
    """Raised instead of building a link that would fall back to 127.0.0.1.

    That address only ever resolves to the device reading the link, never to
    this host, so a link built from it is dead on any other device.
    """


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    moodle_base_url: str = ""
    moodle_enabled: bool = True
    moodle_token: str = Field(default="", repr=False)
    institution_slug: str = "generic"
    public_periods_enabled: bool = True
    data_dir: Path = Path("./data")
    local_dir: Path = Path("./local")
    serve_react: bool = False
    server_mode: bool = False
    demo_mode: bool = False
    public_server_url: str = ""
    react_dist_dir: Path = Path("./frontend/dist")
    voice_model_dir: Path = Path("./desktop/voice-model")
    database_url: str = ""
    device_name: str = ""
    host_heartbeat_seconds: int = Field(default=300, ge=5)
    automatic_takeover_enabled: bool = True
    automatic_takeover_after_seconds: int = Field(default=7200, ge=600)
    automatic_takeover_snapshot_max_age_seconds: int = Field(default=10800, ge=600)
    automatic_takeover_poll_seconds: int = Field(default=60, ge=10)
    host_health_url: str = ""
    allowed_hosts: str = "127.0.0.1,localhost,[::1]"
    api_auth_required: bool = True
    snapshot_interval_seconds: int = Field(default=900, ge=60)
    snapshot_keep: int = Field(default=20, ge=2)
    tz: str = "Europe/Berlin"
    sync_interval_minutes: int = Field(default=60, ge=5)
    sync_jitter_minutes: int = Field(default=5, ge=0)
    stale_sync_hours: int = Field(default=24, ge=1)
    quiet_hours_start: int | None = Field(default=1, ge=0, le=23)
    quiet_hours_end: int | None = Field(default=6, ge=0, le=23)
    request_delay_seconds: float = Field(default=0.5, ge=0)
    ntfy_url: str = ""
    discord_webhook_url: str = Field(default="", repr=False)
    deadline_warning_days: str = "7,3,1"
    tailscale_ip: str = ""
    syncthing_api_url: str = "http://127.0.0.1:8384"
    syncthing_folder_id: str = ""
    syncthing_api_key: str = Field(default="", repr=False)
    restic_repository: str = ""
    restic_password: str = Field(default="", repr=False)
    current_semester_name: str = "Semester_1"
    max_anki_candidates_per_resource: int = Field(default=15, ge=1, le=100)
    anki_agent_token: str = Field(default="", repr=False)
    mcp_enabled: bool = False
    mcp_token: str = Field(default="", repr=False)
    remote_mcp_public_url: str = ""
    remote_mcp_approval_pin: str = Field(default="", repr=False)
    github_token: str = Field(default="", repr=False)
    learning_min_reviews: int = Field(default=5, ge=1)
    learning_min_attempts: int = Field(default=3, ge=1)
    study_block_lookahead_days: int = Field(default=14, ge=1)
    study_block_minutes: int = Field(default=45, ge=15, le=240)
    ai_adapter_enabled: bool = False
    ai_adapter_monthly_budget_tokens: int | None = Field(default=None, ge=0)
    ai_adapter_api_key: str = Field(default="", repr=False)
    ai_adapter_model: str = ""  # chosen in the app from the provider's own model list
    ai_adapter_max_output_tokens: int = Field(default=16000, ge=1)
    ai_adapter_effort: Literal["low", "medium", "high"] | None = None
    submission_tsa_url: str = ""
    connector_plugins: str = ""
    allow_trusted_python_connectors: bool = False
    coding_runner_url: str = ''
    coding_runner_token: str = Field(default='', repr=False)
    coding_runner_isolated: bool = False

    @field_validator('coding_runner_url')
    @classmethod
    def validate_coding_runner_url(cls, value: str) -> str:
        if not value:
            return value
        parsed = urlsplit(value)
        if (parsed.scheme not in {'http', 'https'} or not parsed.hostname or parsed.username
                or parsed.password or parsed.query or parsed.fragment or parsed.path not in {'', '/'}
                or parsed.hostname in {'ce.judge0.com', 'api.judge0.com', 'judge0.com'}
                or parsed.scheme == 'http' and parsed.hostname not in {'localhost', '127.0.0.1', 'judge0'}):
            raise ValueError('CODING_RUNNER_URL muss ein eigener HTTPS-Runner oder lokaler Tunnel sein')
        return value.rstrip('/')

    @field_validator("ai_adapter_monthly_budget_tokens", mode="before")
    @classmethod
    def empty_ai_budget_is_unset(cls, value: object) -> object:
        return None if value == "" else value

    @field_validator("ai_adapter_effort", mode="before")
    @classmethod
    def empty_ai_effort_is_unset(cls, value: object) -> object:
        return None if value == "" else value

    @model_validator(mode="after")
    def resolve_database_url(self) -> "Settings":
        if self.server_mode:
            self.api_auth_required = True
            self.automatic_takeover_enabled = False
        if not self.database_url:
            self.database_url = f"sqlite:///{(self.local_dir / 'uni_os.sqlite3').resolve()}"
        return self

    @field_validator("moodle_base_url")
    @classmethod
    def validate_moodle_url(cls, value: str) -> str:
        value = value.rstrip("/")
        if value and not value.startswith("https://"):
            raise ValueError("MOODLE_BASE_URL muss HTTPS verwenden")
        return value

    @field_validator("public_server_url")
    @classmethod
    def validate_public_server_url(cls, value: str) -> str:
        if not value:
            return ""
        from app.client.service import validate_server_url

        return validate_server_url(value)

    @field_validator("host_health_url")
    @classmethod
    def validate_host_health_url(cls, value: str) -> str:
        if not value:
            return value
        parsed = urlsplit(value)
        if (parsed.scheme != "https" or not parsed.hostname or not parsed.hostname.endswith(".ts.net")
                or parsed.hostname == "ts.net" or parsed.username or parsed.password
                or parsed.port not in {None, 443} or parsed.path != "/health" or parsed.query or parsed.fragment):
            raise ValueError("HOST_HEALTH_URL muss eine Tailscale-Serve-Adresse mit /health sein")
        return value

    @field_validator("submission_tsa_url")
    @classmethod
    def validate_submission_tsa_url(cls, value: str) -> str:
        if value and not value.startswith("https://"):
            raise ValueError("SUBMISSION_TSA_URL muss HTTPS verwenden")
        return value

    @property
    def timezone(self) -> ZoneInfo:
        return ZoneInfo(self.tz)

    @property
    def allowed_host_names(self) -> frozenset[str]:
        """Hostnames (no ports) an incoming ``Host`` header may match.

        Combines the comma-separated ``allowed_hosts`` setting with the
        hostname of ``host_health_url`` when configured, so a device does not
        need to list its own Tailscale name twice.
        """

        def unbracket(value: str) -> str:
            return value[1:-1] if value.startswith("[") and value.endswith("]") else value

        names = {unbracket(value.strip()).casefold() for value in self.allowed_hosts.split(",") if value.strip()}
        if self.host_health_url:
            hostname = urlsplit(self.host_health_url).hostname
            if hostname:
                names.add(hostname.casefold())
        if self.public_server_url:
            hostname = urlsplit(self.public_server_url).hostname
            if hostname:
                names.add(hostname.casefold())
        return frozenset(names)

    @property
    def warning_days(self) -> tuple[int, ...]:
        return tuple(sorted({int(value.strip()) for value in self.deadline_warning_days.split(",") if value.strip()}, reverse=True))

    def remote_base_url(self) -> str:
        """A base URL another device can actually reach this host at.

        Prefers the configured public/Tailscale address; raises rather than
        falling back to 127.0.0.1, which would silently produce dead links.
        """
        if self.public_server_url:
            return self.public_server_url.rstrip("/")
        if self.tailscale_ip:
            try:
                address = ip_address(self.tailscale_ip)
            except ValueError:
                address = None
            if address is not None and (
                address in ip_network("100.64.0.0/10") or address in ip_network("fd7a:115c:a1e0::/48")
            ):
                host = f"[{address}]" if address.version == 6 else str(address)
                return f"http://{host}:8000"
        for name in self.allowed_hosts.split(","):
            name = name.strip()
            if name.endswith(".ts.net"):
                return f"https://{name}"
        raise RemoteAddressNotConfigured(
            "Kein von außen erreichbarer Host konfiguriert (public_server_url oder Tailscale einrichten)"
        )

    @property
    def secret_values(self) -> tuple[str, ...]:
        return tuple(value for value in (self.moodle_token, self.ntfy_url, self.discord_webhook_url,
                                         self.restic_password, self.anki_agent_token, self.mcp_token,
                                         self.remote_mcp_approval_pin,
                                         self.syncthing_api_key, self.github_token,
                                         self.ai_adapter_api_key) if value)


def implicit_institution_slug(local_dir: Path) -> str:
    """Tell a new installer marker apart from a pre-profile Coburg database."""
    marker = local_dir / "setup.json"
    if marker.is_file():
        try:
            state = json.loads(marker.read_text(encoding="utf-8"))
            if state.get("version") == 1 and state.get("institution") is None:
                return "generic"
            if state.get("version") == 1 and state.get("institution") in {"generic", "hs-coburg"}:
                return state["institution"]
        except (OSError, ValueError, AttributeError):
            pass
    return "hs-coburg"


@lru_cache
def get_settings() -> Settings:
    from app.secrets import require_private_env

    require_private_env(Path(".env"))
    server_values = {}
    if os.environ.get("SERVER_MODE", "").casefold() in {"true", "1"}:
        import keyring

        from app.secrets import _secure_backend

        if not _secure_backend():
            raise RuntimeError("Verschlüsselter Server-Schlüsselbund fehlt")
        stored = keyring.get_password("unios.server", "settings")
        if stored:
            server_values = json.loads(stored)
            if not isinstance(server_values, dict):
                raise RuntimeError("Server-Einstellungen sind ungültig")
    settings = Settings(**server_values)
    from app.institutions import chosen_institution

    selected_profile = chosen_institution(settings.local_dir)
    if selected_profile is not None:
        if selected_profile != settings.institution_slug:
            settings.moodle_base_url = ""
            settings.moodle_token = ""
        settings.institution_slug = selected_profile
    elif "institution_slug" not in settings.model_fields_set and (settings.local_dir / "uni_os.sqlite3").exists():
        settings.institution_slug = implicit_institution_slug(settings.local_dir)
    if not settings.moodle_base_url:
        from app.institutions import load_institution

        profile = load_institution(settings.institution_slug)
        moodle = profile.connectors.get("moodle")
        configured_url = moodle.config.get("base_url") if moodle and moodle.enabled else None
        if configured_url or profile.moodle_url is not None:
            settings.moodle_base_url = settings.validate_moodle_url(str(configured_url or profile.moodle_url))
    if settings.moodle_enabled and settings.moodle_base_url and not settings.moodle_token:
        from app.secrets import load_moodle_token

        settings.moodle_token = load_moodle_token(settings.moodle_base_url)
    if not settings.ntfy_url:
        from app.secrets import load_ntfy_url

        settings.ntfy_url = load_ntfy_url()
    return settings

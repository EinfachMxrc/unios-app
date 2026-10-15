# SPDX-License-Identifier: AGPL-3.0-or-later

import json
import logging
import re
from logging.handlers import RotatingFileHandler
from pathlib import Path

SECRET_PARAMETER = re.compile(
    r"(?i)(^|[?&;\s])((?:session|sesskey|user|token|wstoken|access_token|id_token|oauth_token|password|api[_-]?key)=)([^&#\s]+)"
)
BEARER = re.compile(r"(?i)\bBearer\s+[^\s,;]+")


def redact_sensitive(value: str, known_secrets: tuple[str, ...] = ()) -> str:
    """Remove session URL values, bearer tokens and configured secrets from messages."""
    result = str(value)
    for secret in known_secrets:
        if secret:
            result = result.replace(secret, "[REDACTED]")
    result = SECRET_PARAMETER.sub(lambda match: f"{match[1]}{match[2]}[REDACTED]", result)
    return BEARER.sub("Bearer [REDACTED]", result)


class JsonFormatter(logging.Formatter):
    def __init__(self, known_secrets: tuple[str, ...] = ()) -> None:
        super().__init__()
        self.known_secrets = known_secrets

    def format(self, record: logging.LogRecord) -> str:
        return json.dumps({"time": self.formatTime(record), "level": record.levelname,
                           "logger": record.name, "message": redact_sensitive(record.getMessage(), self.known_secrets)},
                          ensure_ascii=False)


class RedactingFormatter(logging.Formatter):
    """Redact rendered console output without changing Uvicorn's structured record."""

    def __init__(self, wrapped: logging.Formatter, known_secrets: tuple[str, ...]) -> None:
        super().__init__()
        self.wrapped = wrapped
        self.known_secrets = known_secrets

    def format(self, record: logging.LogRecord) -> str:
        return redact_sensitive(self.wrapped.format(record), self.known_secrets)


def configure_logging(local_dir: Path, known_secrets: tuple[str, ...] = ()) -> None:
    log_dir = local_dir / "logs"
    log_dir.mkdir(parents=True, exist_ok=True)
    handler = RotatingFileHandler(log_dir / "uni_os.log", maxBytes=5_000_000, backupCount=5, encoding="utf-8")
    handler.setFormatter(JsonFormatter(known_secrets))
    root = logging.getLogger()
    root.setLevel(logging.INFO)
    if not any(isinstance(item, RotatingFileHandler) and item.baseFilename == handler.baseFilename for item in root.handlers):
        root.addHandler(handler)
    else:
        handler.close()
        for item in root.handlers:
            if isinstance(item, RotatingFileHandler) and item.baseFilename == handler.baseFilename:
                item.setFormatter(JsonFormatter(known_secrets))
    for name in ("uvicorn", "uvicorn.error", "uvicorn.access"):
        for console_handler in logging.getLogger(name).handlers:
            formatter = console_handler.formatter or logging.Formatter()
            if isinstance(formatter, RedactingFormatter):
                formatter.known_secrets = known_secrets
            else:
                console_handler.setFormatter(RedactingFormatter(formatter, known_secrets))
    # httpx würde sonst GET-URLs samt Moodle-Token im Querystring protokollieren.
    logging.getLogger("httpx").setLevel(logging.WARNING)
    logging.getLogger("httpcore").setLevel(logging.WARNING)

# SPDX-License-Identifier: AGPL-3.0-or-later

import logging
from io import StringIO

from sqlalchemy import select
from uvicorn.logging import AccessFormatter

from app.db.models import ConnectorHealth
from app.health.logging import configure_logging, redact_sensitive
from app.notify.service import Notifier
from app.sync.engine import SyncEngine


def test_session_url_and_tokens_are_redacted_in_log(tmp_path):
    secret = "private-token-xyz"  # pragma: allowlist secret
    configure_logging(tmp_path, (secret,))
    logging.getLogger("test.sensitive").error(
        "Request https://www3.primuss.de/index.pl?FH=x&Session=abc123&User=marc and Bearer %s", secret)
    content = (tmp_path / "logs" / "uni_os.log").read_text(encoding="utf-8")
    assert "abc123" not in content
    assert "marc" not in content
    assert secret not in content
    assert "[REDACTED]" in content
    assert "Session=[REDACTED]" in content


def test_uvicorn_access_log_keeps_its_structured_arguments(tmp_path):
    output = StringIO()
    logger = logging.getLogger("uvicorn.access")
    previous_level, previous_disabled = logger.level, logger.disabled
    logger.setLevel(logging.INFO)
    logger.disabled = False
    handler = logging.StreamHandler(output)
    handler.setFormatter(AccessFormatter(use_colors=False))
    logger.addHandler(handler)
    try:
        configure_logging(tmp_path)
        logger.info('%s - "%s %s HTTP/%s" %d', "127.0.0.1", "GET", "/?token=private", "1.1", 200)
        assert "token=[REDACTED]" in output.getvalue()
        assert "private" not in output.getvalue()
    finally:
        logger.removeHandler(handler)
        logger.setLevel(previous_level)
        logger.disabled = previous_disabled


def test_connector_error_is_safe_for_dashboard_and_push(settings, factory, coordinator):
    class Leaky:
        name = "leaky"
        def fetch_changes(self, since=None):
            raise RuntimeError("https://www3.primuss.de/?Session=abc123&User=private")

    SyncEngine(factory, settings, [Leaky()], Notifier(settings, coordinator), coordinator).run()
    with factory() as session:
        message = session.scalar(select(ConnectorHealth).where(ConnectorHealth.connector == "leaky")).message
    assert "abc123" not in message
    assert "private" not in message
    assert "Session=[REDACTED]" in message
    assert redact_sensitive("token=abc&sesskey=xyz&access_token=def&password=123") == (
        "token=[REDACTED]&sesskey=[REDACTED]&access_token=[REDACTED]&password=[REDACTED]"
    )


def test_secrets_saved_while_running_are_redacted_immediately(tmp_path):
    current: list[str] = []
    configure_logging(tmp_path, lambda: tuple(current))
    logging.getLogger("test.runtime").error("key=%s", "late-secret-value")  # pragma: allowlist secret
    current.append("late-secret-value")  # pragma: allowlist secret
    logging.getLogger("test.runtime").error("key=%s", "late-secret-value")  # pragma: allowlist secret
    lines = (tmp_path / "logs" / "uni_os.log").read_text(encoding="utf-8").splitlines()
    assert "late-secret-value" in lines[-2]
    assert "late-secret-value" not in lines[-1]

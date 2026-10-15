# SPDX-License-Identifier: AGPL-3.0-or-later

"""The local cost estimate never leaves the machine and always respects the allow-list."""

from datetime import UTC, datetime, timedelta

from fastapi.testclient import TestClient
from typer.testing import CliRunner

from app.ai.prices import PriceList, load_prices
from app.cli.main import cli
from app.db.models import Course, Resource, ResourceText, ResourceVersion
from app.main import create_app


def _material(factory) -> int:
    with factory() as session:
        course = Course(source="fixture", source_id="c1", name="Programmieren")
        session.add(course)
        session.flush()
        resource = Resource(source="fixture", source_key="r1", course_id=course.id, kind="file",
                            name="Blatt.pdf", url="https://example.invalid/file", group_category="general")
        session.add(resource)
        session.flush()
        version = ResourceVersion(resource_id=resource.id, version=1, sha256="a" * 64,
                                  relative_path="uni/blatt.pdf", size=10, mime_type="application/pdf",
                                  downloaded_at=datetime.now(UTC))
        session.add(version)
        session.flush()
        session.add(ResourceText(version_id=version.id, page_number=1, text="x" * 4000, markdown=None))
        session.commit()
        return course.id


def test_prices_load_and_get_flagged_stale():
    prices = load_prices()
    assert isinstance(prices, PriceList)
    assert len(prices.models) >= 1
    old = prices.model_copy(update={"as_of": datetime.now(UTC).date() - timedelta(days=91)})
    fresh = prices.model_copy(update={"as_of": datetime.now(UTC).date()})
    assert old.stale is True
    assert fresh.stale is False


def test_cost_estimate_counts_only_allowed_material(settings, factory, coordinator):
    course_id = _material(factory)
    app = create_app(settings, connectors=[], start_scheduler=False, coordinator=coordinator)
    with TestClient(app) as client:
        estimate = client.get("/api/ai/costs").json()
        assert estimate["estimated_tokens"] == 1000  # 4000 chars / 4
        assert estimate["models"]
        first = estimate["models"][0]
        assert first["stale_price"] == load_prices().stale
        assert first["one_time_cost_with_batch"] < first["one_time_cost"]

        locked = client.put(f"/api/ai/access/course/{course_id}", json={"allowed": False})
        assert locked.status_code == 200
        after_lock = client.get("/api/ai/costs").json()
        assert after_lock["estimated_tokens"] == 0
        assert all(item["one_time_cost"] == 0 for item in after_lock["models"])


def test_cli_ai_costs_reports_json(monkeypatch, settings, factory, coordinator):
    _material(factory)
    monkeypatch.setattr("app.cli.main.get_settings", lambda: settings)
    result = CliRunner().invoke(cli, ["ai-costs"])
    assert result.exit_code == 0, result.output
    assert '"estimated_tokens"' in result.output

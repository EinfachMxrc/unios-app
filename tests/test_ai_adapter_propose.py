# SPDX-License-Identifier: AGPL-3.0-or-later

"""POST /api/ai/adapter/propose: same allow-list as packages, results always land as proposals."""

import json
from datetime import UTC, datetime
from types import SimpleNamespace

import anthropic
from fastapi.testclient import TestClient

from app.db.models import Course, Resource, ResourceText, ResourceVersion
from app.main import create_app


class FakeMessages:
    def __init__(self, response=None, error=None):
        self.response = response
        self.error = error
        self.calls: list[dict] = []

    def create(self, **kwargs):
        self.calls.append(kwargs)
        if self.error is not None:
            raise self.error
        return self.response


class FakeClient:
    def __init__(self, response=None, error=None):
        self.messages_stub = FakeMessages(response, error)
        self.messages = self.messages_stub


def make_response(payload: dict, stop_reason="end_turn"):
    return SimpleNamespace(
        stop_reason=stop_reason,
        stop_details=None,
        content=[SimpleNamespace(type="text", text=json.dumps(payload))],
        usage=SimpleNamespace(input_tokens=100, output_tokens=50,
                              cache_creation_input_tokens=0, cache_read_input_tokens=0),
        model="claude-opus-5",
    )


def patch_client(monkeypatch, fake_client):
    monkeypatch.setattr(anthropic, "Anthropic", lambda **kwargs: fake_client)


def _material(factory) -> tuple[int, int]:
    with factory() as session:
        course = Course(source="fixture", source_id="c1", name="Programmieren")
        session.add(course)
        session.flush()
        resource = Resource(source="fixture", source_key="r1", course_id=course.id, kind="file",
                            name="Schleifen.pdf", url="https://example.invalid/file")
        session.add(resource)
        session.flush()
        version = ResourceVersion(resource_id=resource.id, version=1, sha256="a" * 64,
                                  relative_path="uni/schleifen.pdf", size=10, mime_type="application/pdf",
                                  downloaded_at=datetime.now(UTC))
        session.add(version)
        session.flush()
        session.add(ResourceText(version_id=version.id, page_number=1,
                                 text="Eine while-Schleife wiederholt Anweisungen.", markdown=None))
        session.commit()
        return course.id, resource.id


def _card_payload(resource_id: int) -> dict:
    return {"schema_version": 1, "generated_by": "claude-opus-5", "generated_at": datetime.now(UTC).isoformat(),
            "source": {"resource_id": resource_id, "version": 1},
            "cards": [{"card_type": "basic", "front": "Was ist eine Schleife?", "back": "Eine Wiederholung.",
                       "course": "prog1", "topic": "schleifen", "source_page": 1, "confidence": "high"}]}


def _exercise_payload(resource_id: int) -> dict:
    return {"schema_version": 1, "generated_by": "claude-opus-5", "generated_at": datetime.now(UTC).isoformat(),
            "source": {"resource_id": resource_id, "version": 1},
            "exercises": [{"question": "Erkläre eine while-Schleife.", "topic": "schleifen", "difficulty": "easy",
                           "sample_solution": "Sie wiederholt Anweisungen.",
                           "solution_steps": "Bedingung prüfen, Block ausführen, erneut prüfen.",
                           "source_page": 1}]}


def test_propose_refuses_when_adapter_disabled(settings, factory, coordinator):
    app = create_app(settings, connectors=[], start_scheduler=False, coordinator=coordinator)
    with TestClient(app) as client:
        response = client.post("/api/ai/adapter/propose", json={"course_id": 1, "mode": "cards"})
    assert response.status_code == 409
    assert "ausgeschaltet" in response.json()["detail"]


def test_propose_refuses_without_configured_key(settings, factory, coordinator):
    settings.ai_adapter_enabled = True
    app = create_app(settings, connectors=[], start_scheduler=False, coordinator=coordinator)
    with TestClient(app) as client:
        response = client.post("/api/ai/adapter/propose", json={"course_id": 1, "mode": "cards"})
    assert response.status_code == 409
    assert "Schlüssel" in response.json()["detail"]


def test_propose_refuses_locked_course_and_never_calls_sdk(monkeypatch, settings, factory, coordinator):
    settings.ai_adapter_enabled = True
    settings.ai_adapter_api_key = "sk-test"  # pragma: allowlist secret
    settings.ai_adapter_model = "claude-opus-5"
    course_id, resource_id = _material(factory)
    fake_client = FakeClient(response=make_response(_card_payload(resource_id)))
    patch_client(monkeypatch, fake_client)
    app = create_app(settings, connectors=[], start_scheduler=False, coordinator=coordinator)
    with TestClient(app) as client:
        assert client.put(f"/api/ai/access/course/{course_id}", json={"allowed": False}).status_code == 200
        response = client.post("/api/ai/adapter/propose", json={"course_id": course_id, "mode": "cards"})
    assert response.status_code == 403
    assert fake_client.messages_stub.calls == []


def test_propose_worst_case_budget_gate_refuses_before_calling_sdk(monkeypatch, settings, factory, coordinator):
    settings.ai_adapter_enabled = True
    settings.ai_adapter_api_key = "sk-test"  # pragma: allowlist secret
    settings.ai_adapter_model = "claude-opus-5"
    settings.ai_adapter_monthly_budget_tokens = 1  # prompt alone already exceeds this
    course_id, resource_id = _material(factory)
    fake_client = FakeClient(response=make_response(_card_payload(resource_id)))
    patch_client(monkeypatch, fake_client)
    app = create_app(settings, connectors=[], start_scheduler=False, coordinator=coordinator)
    with TestClient(app) as client:
        response = client.post("/api/ai/adapter/propose", json={"course_id": course_id, "mode": "cards"})
    assert response.status_code == 409
    assert fake_client.messages_stub.calls == []


def test_propose_imports_cards_as_proposed_and_records_usage(monkeypatch, settings, factory, coordinator):
    settings.ai_adapter_enabled = True
    settings.ai_adapter_api_key = "sk-test"  # pragma: allowlist secret
    settings.ai_adapter_model = "claude-opus-5"
    course_id, resource_id = _material(factory)
    fake_client = FakeClient(response=make_response(_card_payload(resource_id)))
    patch_client(monkeypatch, fake_client)
    app = create_app(settings, connectors=[], start_scheduler=False, coordinator=coordinator)
    with TestClient(app) as client:
        response = client.post("/api/ai/adapter/propose", json={"course_id": course_id, "mode": "cards"})
        assert response.status_code == 200, response.text
        body = response.json()
        assert body == {"imported": 1, "tokens_used": 150, "model": "claude-opus-5"}
        queue = client.get("/api/anki/queue").json()
        assert len(queue) == 1
        assert queue[0]["status"] == "proposed"
        status = client.get("/api/ai/adapter/status").json()
        assert status["tokens_used_this_month"] == 150
    assert len(fake_client.messages_stub.calls) == 1


def test_propose_imports_exercises_as_proposed(monkeypatch, settings, factory, coordinator):
    settings.ai_adapter_enabled = True
    settings.ai_adapter_api_key = "sk-test"  # pragma: allowlist secret
    settings.ai_adapter_model = "claude-opus-5"
    course_id, resource_id = _material(factory)
    fake_client = FakeClient(response=make_response(_exercise_payload(resource_id)))
    patch_client(monkeypatch, fake_client)
    app = create_app(settings, connectors=[], start_scheduler=False, coordinator=coordinator)
    with TestClient(app) as client:
        response = client.post("/api/ai/adapter/propose", json={"course_id": course_id, "mode": "exercises"})
        assert response.status_code == 200, response.text
        assert response.json()["imported"] == 1
        queue = client.get("/api/ai/exercises").json()
        assert len(queue) == 1
        assert queue[0]["status"] == "proposed"


def test_propose_invalid_json_imports_nothing_but_records_usage(monkeypatch, settings, factory, coordinator):
    settings.ai_adapter_enabled = True
    settings.ai_adapter_api_key = "sk-test"  # pragma: allowlist secret
    settings.ai_adapter_model = "claude-opus-5"
    course_id, _resource_id = _material(factory)
    broken_response = SimpleNamespace(
        stop_reason="end_turn", stop_details=None,
        content=[SimpleNamespace(type="text", text="das ist kein JSON")],
        usage=SimpleNamespace(input_tokens=10, output_tokens=5,
                              cache_creation_input_tokens=0, cache_read_input_tokens=0),
        model="claude-opus-5")
    fake_client = FakeClient(response=broken_response)
    patch_client(monkeypatch, fake_client)
    app = create_app(settings, connectors=[], start_scheduler=False, coordinator=coordinator)
    with TestClient(app) as client:
        response = client.post("/api/ai/adapter/propose", json={"course_id": course_id, "mode": "cards"})
        assert response.status_code == 422
        assert client.get("/api/anki/queue").json() == []
        status = client.get("/api/ai/adapter/status").json()
        assert status["tokens_used_this_month"] == 15


def test_propose_schema_violation_imports_nothing(monkeypatch, settings, factory, coordinator):
    settings.ai_adapter_enabled = True
    settings.ai_adapter_api_key = "sk-test"  # pragma: allowlist secret
    settings.ai_adapter_model = "claude-opus-5"
    course_id, resource_id = _material(factory)
    bad_payload = _card_payload(resource_id)
    del bad_payload["cards"][0]["confidence"]  # required field missing
    fake_client = FakeClient(response=make_response(bad_payload))
    patch_client(monkeypatch, fake_client)
    app = create_app(settings, connectors=[], start_scheduler=False, coordinator=coordinator)
    with TestClient(app) as client:
        response = client.post("/api/ai/adapter/propose", json={"course_id": course_id, "mode": "cards"})
        assert response.status_code == 422
        assert client.get("/api/anki/queue").json() == []


def test_propose_maps_rate_limit_error_to_service_unavailable(monkeypatch, settings, factory, coordinator):
    import httpx2

    settings.ai_adapter_enabled = True
    settings.ai_adapter_api_key = "sk-test"  # pragma: allowlist secret
    settings.ai_adapter_model = "claude-opus-5"
    course_id, _resource_id = _material(factory)
    request = httpx2.Request("POST", "https://api.anthropic.com/v1/messages")
    error = anthropic.RateLimitError("rate limited", response=httpx2.Response(429, request=request), body=None)
    fake_client = FakeClient(error=error)
    patch_client(monkeypatch, fake_client)
    app = create_app(settings, connectors=[], start_scheduler=False, coordinator=coordinator)
    with TestClient(app) as client:
        response = client.post("/api/ai/adapter/propose", json={"course_id": course_id, "mode": "cards"})
    assert response.status_code == 503
    assert client.get("/api/anki/queue").json() == []


def test_propose_refusal_imports_nothing(monkeypatch, settings, factory, coordinator):
    settings.ai_adapter_enabled = True
    settings.ai_adapter_api_key = "sk-test"  # pragma: allowlist secret
    settings.ai_adapter_model = "claude-opus-5"
    course_id, _resource_id = _material(factory)
    fake_client = FakeClient(response=make_response({}, stop_reason="refusal"))
    patch_client(monkeypatch, fake_client)
    app = create_app(settings, connectors=[], start_scheduler=False, coordinator=coordinator)
    with TestClient(app) as client:
        response = client.post("/api/ai/adapter/propose", json={"course_id": course_id, "mode": "cards"})
    assert response.status_code == 502
    assert client.get("/api/anki/queue").json() == []

# SPDX-License-Identifier: AGPL-3.0-or-later

"""Connecting an API key and choosing a model: the model list always comes from the provider."""

from types import SimpleNamespace

import anthropic
import httpx2
import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.ai.provider_api import provider_router
from app.ai.provider_repository import ProviderRepository
from app.ai.provider_service import ProviderService


class FakeModels:
    def __init__(self, items=None, error=None):
        self.items = items if items is not None else [("model-new", "Neues Modell"), ("model-old", "Altes Modell")]
        self.error = error

    def list(self, **kwargs):
        if self.error is not None:
            raise self.error
        return SimpleNamespace(data=[SimpleNamespace(id=i, display_name=n) for i, n in self.items])


def factory_for(models):
    return lambda api_key: SimpleNamespace(models=models)


def rejection(status, exception):
    request = httpx2.Request("GET", "https://api.anthropic.com/v1/models")
    return exception("rejected", response=httpx2.Response(status, request=request), body=None)


@pytest.fixture(autouse=True)
def memory_keychain(monkeypatch):
    """Never touch the real operating-system keychain from tests."""
    vault: dict[tuple[str, str], str] = {}
    monkeypatch.setattr("app.ai.provider_repository.load_connector_secret",
                        lambda connector, alias: vault.get((connector, alias), ""))
    monkeypatch.setattr("app.ai.provider_repository.save_connector_secret",
                        lambda connector, alias, value: vault.__setitem__((connector, alias), value) or True)
    monkeypatch.setattr("app.ai.provider_repository.delete_connector_secret",
                        lambda connector, alias: vault.pop((connector, alias), None))
    return vault


@pytest.fixture
def service(settings):
    settings.ai_adapter_api_key = ""
    settings.ai_adapter_model = ""
    settings.ai_adapter_enabled = False
    return ProviderService(settings, ProviderRepository(settings), factory_for(FakeModels()))


def test_connect_preselects_newest_model_and_enables_adapter(settings, service):
    state = service.connect("  sk-fixture-key  ")  # pragma: allowlist secret

    assert state.configured and state.model == "model-new"
    assert [item.id for item in state.models] == ["model-new", "model-old"]
    assert settings.ai_adapter_api_key == "sk-fixture-key"  # pragma: allowlist secret
    assert settings.ai_adapter_enabled is True


def test_saved_key_and_choice_survive_a_restart(settings, service):
    service.connect("sk-fixture-key")  # pragma: allowlist secret
    service.choose("model-old")
    settings.ai_adapter_api_key = ""
    settings.ai_adapter_model = ""
    settings.ai_adapter_enabled = False

    ProviderService(settings, ProviderRepository(settings), factory_for(FakeModels())).apply_stored()

    assert settings.ai_adapter_api_key == "sk-fixture-key"  # pragma: allowlist secret
    assert settings.ai_adapter_model == "model-old" and settings.ai_adapter_enabled is True


def test_choosing_a_model_the_key_cannot_use_is_refused(service):
    from app.ai.adapter import AdapterCallError

    service.connect("sk-fixture-key")  # pragma: allowlist secret
    with pytest.raises(AdapterCallError) as error:
        service.choose("made-up-model")
    assert error.value.status_code == 422


def test_invalid_key_is_not_stored(settings):
    from app.ai.adapter import AdapterCallError

    repository = ProviderRepository(settings)
    broken = ProviderService(settings, repository, factory_for(FakeModels(
        error=rejection(401, anthropic.AuthenticationError))))
    with pytest.raises(AdapterCallError, match="ungültig"):
        broken.connect("sk-wrong-key")  # pragma: allowlist secret
    assert repository.load_key() == "" and not settings.ai_adapter_api_key


def test_disconnect_forgets_key_and_model(settings, service):
    service.connect("sk-fixture-key")  # pragma: allowlist secret
    service.disconnect()

    assert settings.ai_adapter_api_key == "" and settings.ai_adapter_model == ""
    assert settings.ai_adapter_enabled is False
    assert ProviderRepository(settings).load_key() == ""
    assert ProviderRepository(settings).load_choice() == {}


def test_http_flow_never_returns_the_key(settings, coordinator):
    settings.ai_adapter_api_key = ""
    settings.ai_adapter_model = ""
    provider = ProviderService(settings, ProviderRepository(settings), factory_for(FakeModels()))
    app = FastAPI()
    app.include_router(provider_router(settings, coordinator, provider))
    client = TestClient(app)

    assert client.get("/api/ai/provider").json() == {"configured": False, "model": "", "models": []}
    connected = client.put("/api/ai/provider/key", json={"api_key": "sk-fixture-key"})  # pragma: allowlist secret
    assert connected.status_code == 200 and connected.json()["model"] == "model-new"
    assert "sk-fixture-key" not in connected.text  # pragma: allowlist secret
    assert client.put("/api/ai/provider/model", json={"model": "model-old"}).json()["model"] == "model-old"
    assert client.put("/api/ai/provider/model", json={"model": "nope"}).status_code == 422
    assert client.delete("/api/ai/provider/key").status_code == 204
    assert client.get("/api/ai/provider").json()["configured"] is False


def test_demo_state_does_not_open_storage_or_call_the_provider(settings, monkeypatch):
    settings.demo_mode = True
    settings.ai_adapter_api_key = "synthetic-existing-key"  # pragma: allowlist secret
    settings.ai_adapter_model = "model-new"
    settings.ai_adapter_enabled = True
    repository = ProviderRepository(settings)

    def forbidden(*_args, **_kwargs):
        raise AssertionError("Demo must not access credentials, provider state or network")

    monkeypatch.setattr(repository, "load_key", forbidden)
    monkeypatch.setattr(repository, "load_choice", forbidden)
    provider = ProviderService(settings, repository, forbidden)
    provider.apply_stored()
    assert provider.state().configured is False
    assert provider.state().models == []
    assert settings.ai_adapter_api_key == settings.ai_adapter_model == ""
    assert settings.ai_adapter_enabled is False


@pytest.mark.parametrize("method,path,payload", [
    ("PUT", "/key", {"api_key": "synthetic-demo-key"}),  # pragma: allowlist secret
    ("PUT", "/model", {"model": "model-new"}),
    ("DELETE", "/key", None),
])
def test_demo_rejects_connection_changes_before_storage_or_network(settings, coordinator, monkeypatch,
                                                                method, path, payload):
    settings.demo_mode = True
    repository = ProviderRepository(settings)

    def forbidden(*_args, **_kwargs):
        raise AssertionError("Demo must not access credentials, provider state or network")

    for name in ("load_key", "load_choice", "save_key", "save_choice", "delete_key"):
        monkeypatch.setattr(repository, name, forbidden)
    provider = ProviderService(settings, repository, forbidden)
    app = FastAPI()
    app.include_router(provider_router(settings, coordinator, provider))
    with TestClient(app) as client:
        assert client.request(method, f"/api/ai/provider{path}", json=payload).status_code == 403

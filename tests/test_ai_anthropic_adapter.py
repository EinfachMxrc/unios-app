# SPDX-License-Identifier: AGPL-3.0-or-later

"""AnthropicAdapter: real SDK calls, but never over the network in tests."""

import sys
from types import SimpleNamespace

import anthropic
import httpx2
import pytest

from app.ai.adapter import AdapterCallError, NotConfiguredError, NullAdapter
from app.ai.anthropic_adapter import AnthropicAdapter, select_adapter


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


def make_response(text="{}", stop_reason="end_turn", model="claude-opus-5",
                  input_tokens=10, output_tokens=20, cache_creation=0, cache_read=0,
                  stop_details=None):
    return SimpleNamespace(
        stop_reason=stop_reason,
        stop_details=stop_details,
        content=[SimpleNamespace(type="text", text=text)],
        usage=SimpleNamespace(input_tokens=input_tokens, output_tokens=output_tokens,
                              cache_creation_input_tokens=cache_creation,
                              cache_read_input_tokens=cache_read),
        model=model,
    )


def patch_client(monkeypatch, fake_client):
    monkeypatch.setattr(anthropic, "Anthropic", lambda **kwargs: fake_client)


def test_propose_sends_documented_call_shape_and_returns_result(monkeypatch, settings):
    settings.ai_adapter_api_key = "sk-test"  # pragma: allowlist secret
    settings.ai_adapter_model = "claude-opus-5"
    settings.ai_adapter_max_output_tokens = 16000
    fake_client = FakeClient(response=make_response('{"cards": []}', input_tokens=100, output_tokens=50))
    patch_client(monkeypatch, fake_client)

    result = AnthropicAdapter(settings).propose("Lernauftrag: ...")

    assert result.payload == '{"cards": []}'
    assert result.tokens_used == 150
    assert result.model == "claude-opus-5"
    call = fake_client.messages_stub.calls[0]
    assert call["model"] == "claude-opus-5"
    assert call["max_tokens"] == 16000
    assert "betas" not in call and "fallbacks" not in call
    assert call["messages"] == [{"role": "user", "content": "Lernauftrag: ..."}]
    assert "temperature" not in call
    assert "thinking" not in call
    assert "output_config" not in call


def test_propose_sums_cache_tokens_into_usage(monkeypatch, settings):
    settings.ai_adapter_api_key = "sk-test"  # pragma: allowlist secret
    settings.ai_adapter_model = "claude-opus-5"
    fake_client = FakeClient(response=make_response(
        input_tokens=10, output_tokens=20, cache_creation=5, cache_read=7))
    patch_client(monkeypatch, fake_client)

    result = AnthropicAdapter(settings).propose("hallo")

    assert result.tokens_used == 42


def test_fallback_iterations_count_all_attempts_without_double_counting(monkeypatch, settings):
    settings.ai_adapter_model = "claude-opus-5"
    response = make_response(input_tokens=20, output_tokens=10)
    response.usage.iterations = [
        SimpleNamespace(input_tokens=50, output_tokens=0, cache_creation_input_tokens=0, cache_read_input_tokens=0),
        SimpleNamespace(input_tokens=20, output_tokens=10, cache_creation_input_tokens=5, cache_read_input_tokens=3),
    ]
    fake_client = FakeClient(response=response)
    patch_client(monkeypatch, fake_client)
    assert AnthropicAdapter(settings).propose('fixture').tokens_used == 88


@pytest.mark.parametrize('stop_reason', ['refusal', 'max_tokens'])
def test_error_carries_billable_usage(monkeypatch, settings, stop_reason):
    settings.ai_adapter_model = "claude-opus-5"
    patch_client(monkeypatch, FakeClient(response=make_response(stop_reason=stop_reason)))
    with pytest.raises(AdapterCallError) as error:
        AnthropicAdapter(settings).propose('fixture')
    assert error.value.tokens_used == 30
    assert error.value.model == settings.ai_adapter_model


def test_propose_passes_effort_only_when_set(monkeypatch, settings):
    settings.ai_adapter_api_key = "sk-test"  # pragma: allowlist secret
    settings.ai_adapter_model = "claude-opus-5"
    settings.ai_adapter_effort = "high"
    fake_client = FakeClient(response=make_response())
    patch_client(monkeypatch, fake_client)

    AnthropicAdapter(settings).propose("hallo")

    assert fake_client.messages_stub.calls[0]["output_config"] == {"effort": "high"}


def test_propose_raises_on_refusal_without_leaking_prompt(monkeypatch, settings, caplog):
    settings.ai_adapter_api_key = "sk-test"  # pragma: allowlist secret
    settings.ai_adapter_model = "claude-opus-5"
    fake_client = FakeClient(response=make_response(
        stop_reason="refusal", stop_details=SimpleNamespace(category="disallowed_content")))
    patch_client(monkeypatch, fake_client)

    with pytest.raises(AdapterCallError):
        AnthropicAdapter(settings).propose("geheimer prompt inhalt")

    assert "geheimer prompt inhalt" not in caplog.text


def test_propose_raises_on_max_tokens_stop(monkeypatch, settings):
    settings.ai_adapter_api_key = "sk-test"  # pragma: allowlist secret
    settings.ai_adapter_model = "claude-opus-5"
    fake_client = FakeClient(response=make_response(stop_reason="max_tokens"))
    patch_client(monkeypatch, fake_client)

    with pytest.raises(AdapterCallError, match="abgeschnitten"):
        AnthropicAdapter(settings).propose("hallo")


def test_propose_maps_authentication_error(monkeypatch, settings):
    settings.ai_adapter_api_key = "sk-invalid"  # pragma: allowlist secret
    settings.ai_adapter_model = "claude-opus-5"
    request = httpx2.Request("POST", "https://api.anthropic.com/v1/messages")
    response = httpx2.Response(401, request=request)
    error = anthropic.AuthenticationError("invalid x-api-key", response=response, body=None)
    patch_client(monkeypatch, FakeClient(error=error))

    with pytest.raises(AdapterCallError, match="ungültig") as excinfo:
        AnthropicAdapter(settings).propose("hallo")
    assert excinfo.value.status_code == 502
    assert excinfo.value.tokens_used == 0


def test_propose_maps_rate_limit_error(monkeypatch, settings):
    settings.ai_adapter_api_key = "sk-test"  # pragma: allowlist secret
    settings.ai_adapter_model = "claude-opus-5"
    request = httpx2.Request("POST", "https://api.anthropic.com/v1/messages")
    response = httpx2.Response(429, request=request)
    error = anthropic.RateLimitError("rate limited", response=response, body=None)
    patch_client(monkeypatch, FakeClient(error=error))

    with pytest.raises(AdapterCallError, match="Rate-Limit") as excinfo:
        AnthropicAdapter(settings).propose("hallo")
    assert excinfo.value.status_code == 503
    assert excinfo.value.tokens_used == 0


def test_propose_maps_generic_api_status_error(monkeypatch, settings):
    settings.ai_adapter_api_key = "sk-test"  # pragma: allowlist secret
    settings.ai_adapter_model = "claude-opus-5"
    request = httpx2.Request("POST", "https://api.anthropic.com/v1/messages")
    response = httpx2.Response(500, request=request)
    error = anthropic.InternalServerError("server exploded", response=response, body=None)
    patch_client(monkeypatch, FakeClient(error=error))

    with pytest.raises(AdapterCallError) as excinfo:
        AnthropicAdapter(settings).propose("hallo")
    assert excinfo.value.status_code == 502
    assert excinfo.value.tokens_used is None


def test_propose_rejected_request_is_not_billed(monkeypatch, settings):
    settings.ai_adapter_api_key = "sk-test"  # pragma: allowlist secret
    settings.ai_adapter_model = "claude-opus-5"
    request = httpx2.Request("POST", "https://api.anthropic.com/v1/messages")
    error = anthropic.BadRequestError("bad model", response=httpx2.Response(400, request=request), body=None)
    patch_client(monkeypatch, FakeClient(error=error))

    with pytest.raises(AdapterCallError) as excinfo:
        AnthropicAdapter(settings).propose("hallo")
    assert excinfo.value.tokens_used == 0


def test_propose_maps_connection_error(monkeypatch, settings):
    settings.ai_adapter_api_key = "sk-test"  # pragma: allowlist secret
    settings.ai_adapter_model = "claude-opus-5"
    request = httpx2.Request("POST", "https://api.anthropic.com/v1/messages")
    error = anthropic.APIConnectionError(message="connection reset", request=request)
    patch_client(monkeypatch, FakeClient(error=error))

    with pytest.raises(AdapterCallError, match="Netzwerkfehler") as excinfo:
        AnthropicAdapter(settings).propose("hallo")
    assert excinfo.value.status_code == 503


def test_propose_without_optional_extra_installed_raises_not_configured(monkeypatch, settings):
    settings.ai_adapter_api_key = "sk-test"  # pragma: allowlist secret
    settings.ai_adapter_model = "claude-opus-5"
    monkeypatch.setitem(sys.modules, "anthropic", None)

    with pytest.raises(NotConfiguredError, match="uv sync --extra ai"):
        AnthropicAdapter(settings).propose("hallo")


def test_select_adapter_picks_anthropic_only_when_enabled_and_keyed(settings):
    assert isinstance(select_adapter(settings), NullAdapter)
    settings.ai_adapter_enabled = True
    assert isinstance(select_adapter(settings), NullAdapter)  # no key yet
    settings.ai_adapter_api_key = "sk-test"  # pragma: allowlist secret
    settings.ai_adapter_model = "claude-opus-5"
    assert isinstance(select_adapter(settings), AnthropicAdapter)

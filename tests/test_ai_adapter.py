# SPDX-License-Identifier: AGPL-3.0-or-later

"""The optional AI adapter is off by default and never calls a provider over budget."""


from fastapi.testclient import TestClient

from app.ai.adapter import (
    AdapterResult,
    BudgetExceededError,
    NotConfiguredError,
    NullAdapter,
    submit,
)
from app.main import create_app


class RecordingAdapter:
    def __init__(self, tokens_used: int = 10):
        self.calls = 0
        self.tokens_used = tokens_used

    def propose(self, prompt: str):
        self.calls += 1
        return AdapterResult(model="test-model", tokens_used=self.tokens_used, payload="{}")


def test_adapter_is_off_by_default(settings, factory):
    assert settings.ai_adapter_enabled is False
    with factory() as session:
        try:
            submit(session, settings, RecordingAdapter(), "test-model", "hallo", max_output_tokens=0)
            raise AssertionError("hätte ausgeschaltet ablehnen müssen")
        except BudgetExceededError as exc:
            assert "ausgeschaltet" in str(exc)


def test_budget_gate_refuses_before_calling_the_adapter(settings, factory):
    settings.ai_adapter_enabled = True
    settings.ai_adapter_monthly_budget_tokens = 5
    adapter = RecordingAdapter()
    with factory() as session:
        try:
            # ~100 estimated prompt tokens alone already exceeds the budget.
            submit(session, settings, adapter, "test-model", "x" * 400, max_output_tokens=0)
            raise AssertionError("hätte Budget ablehnen müssen")
        except BudgetExceededError as exc:
            assert "budget" in str(exc).lower()
    assert adapter.calls == 0


def test_budget_gate_reserves_worst_case_output_tokens(settings, factory):
    """A call must be refused pre-call if used + prompt + max output could ever exceed budget,
    even when the prompt alone would still fit -- the provider might use every output token."""
    settings.ai_adapter_enabled = True
    settings.ai_adapter_monthly_budget_tokens = 20
    adapter = RecordingAdapter()
    with factory() as session:
        try:
            # ~1 estimated prompt token; well within budget alone, but 1 + 25 > 20.
            submit(session, settings, adapter, "test-model", "hi", max_output_tokens=25)
            raise AssertionError("hätte Ausgabe-Obergrenze als Reservierung berücksichtigen müssen")
        except BudgetExceededError:
            pass
    assert adapter.calls == 0


def test_successful_call_records_usage_and_next_call_respects_it(settings, factory):
    settings.ai_adapter_enabled = True
    settings.ai_adapter_monthly_budget_tokens = 15
    adapter = RecordingAdapter(tokens_used=10)
    with factory() as session:
        result = submit(session, settings, adapter, "test-model", "kurz", max_output_tokens=0)
        assert result.tokens_used == 10
        assert adapter.calls == 1
        # 10 of 15 tokens used; a prompt whose own estimate already exceeds the remaining 5 is refused pre-call.
        try:
            submit(session, settings, adapter, "test-model", "x" * 24, max_output_tokens=0)
            raise AssertionError("hätte verbleibendes Budget ablehnen müssen")
        except BudgetExceededError:
            pass
    assert adapter.calls == 1


def test_null_adapter_sends_nothing_without_setup(settings, factory):
    settings.ai_adapter_enabled = True
    with factory() as session:
        try:
            submit(session, settings, NullAdapter(), "test-model", "hallo", max_output_tokens=0)
            raise AssertionError("NullAdapter hätte ablehnen müssen")
        except NotConfiguredError:
            pass


def test_adapter_status_endpoint_reports_default_off(settings, factory, coordinator):
    app = create_app(settings, connectors=[], start_scheduler=False, coordinator=coordinator)
    with TestClient(app) as client:
        status = client.get("/api/ai/adapter/status").json()
    assert status == {"enabled": False, "configured": False,
                      "monthly_budget_tokens": None, "tokens_used_this_month": 0, "tokens_reserved_this_month": 0}


def test_budget_is_shared_across_models(settings, factory):
    settings.ai_adapter_enabled = True
    settings.ai_adapter_monthly_budget_tokens = 15
    adapter = RecordingAdapter(tokens_used=10)
    with factory() as session:
        submit(session, settings, adapter, "model-a", "kurz", max_output_tokens=0)
        try:
            submit(session, settings, adapter, "model-b", "x" * 24, max_output_tokens=0)
            raise AssertionError("Modellwechsel darf das Monatsbudget nicht zurücksetzen")
        except BudgetExceededError:
            pass
    assert adapter.calls == 1

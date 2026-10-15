# SPDX-License-Identifier: AGPL-3.0-or-later
"""Fake provider, separate SQLite sessions, no paid requests."""
from concurrent.futures import ThreadPoolExecutor
from datetime import UTC, datetime
from threading import Event

import pytest
from sqlalchemy import select

from app.ai.adapter import (
    AdapterCallError,
    AdapterResult,
    BudgetExceededError,
    NotConfiguredError,
    NullAdapter,
    submit,
)
from app.ai.budget_repository import BudgetRepository, committed_tokens, reserved_tokens
from app.db.models import AiBudgetReservation


def test_parallel_calls_cannot_spend_the_same_remaining_budget(settings, factory):
    settings.ai_adapter_enabled = True
    settings.ai_adapter_monthly_budget_tokens = 1000
    entered, release = Event(), Event()

    class Provider:
        def propose(self, prompt):
            entered.set()
            assert release.wait(10)
            return AdapterResult('fixture', 601, '{}')

    def call():
        with factory() as session:
            return submit(session, settings, Provider(), 'fixture', 'x', 600)

    with ThreadPoolExecutor(max_workers=2) as pool:
        first = pool.submit(call)
        assert entered.wait(10)
        try:
            with pytest.raises(BudgetExceededError):
                pool.submit(call).result(timeout=10)
        finally:
            release.set()
        assert first.result(timeout=10).tokens_used == 601
    with factory() as session:
        assert committed_tokens(session, datetime.now(UTC).strftime('%Y-%m')) == 601
        assert reserved_tokens(session, datetime.now(UTC).strftime('%Y-%m')) == 0


@pytest.mark.parametrize('message', ['refusal', 'max_tokens'])
def test_unusable_but_billed_response_is_settled(settings, factory, message):
    settings.ai_adapter_enabled = True

    class Provider:
        def propose(self, prompt):
            raise AdapterCallError(message, tokens_used=61, model='fallback')

    with factory() as session, pytest.raises(AdapterCallError):
        submit(session, settings, Provider(), 'primary', 'x', 100)
    with factory() as session:
        assert committed_tokens(session, datetime.now(UTC).strftime('%Y-%m')) == 61
        assert reserved_tokens(session, datetime.now(UTC).strftime('%Y-%m')) == 0


def test_unknown_failure_survives_a_new_repository_and_remains_blocked(settings, factory):
    settings.ai_adapter_enabled = True
    settings.ai_adapter_monthly_budget_tokens = 1000

    class Provider:
        def propose(self, prompt):
            raise TimeoutError('fixture')

    with factory() as session, pytest.raises(TimeoutError):
        submit(session, settings, Provider(), 'fixture', 'x', 600)
    with factory() as session:
        claim = session.scalar(select(AiBudgetReservation))
        assert claim.state == 'uncertain'
        assert BudgetRepository(session.get_bind()).reserve(claim.month, 'other', 601, 1000, datetime.now(UTC)) is None


def test_crashed_pending_claim_does_not_expire_and_settlement_uses_original_month(settings, factory):
    january, february = datetime(2027, 1, 31, tzinfo=UTC), datetime(2027, 2, 1, tzinfo=UTC)
    with factory() as session:
        repository = BudgetRepository(session.get_bind())
        claim = repository.reserve('2027-01', 'fixture', 601, 1000, january)
        assert repository.reserve('2027-01', 'fixture', 601, 1000, february) is None
        assert repository.reserve('2027-02', 'fixture', 601, 1000, february)
        repository.finish(claim, 'fixture', 550)
        repository.finish(claim, 'fixture', 550)
    with factory() as session:
        assert committed_tokens(session, '2027-01') == 550
        assert committed_tokens(session, '2027-02') == 0


def test_unconfigured_adapter_releases_without_charge(settings, factory):
    settings.ai_adapter_enabled = True
    with factory() as session, pytest.raises(NotConfiguredError):
        submit(session, settings, NullAdapter(), 'fixture', 'x', 100)
    with factory() as session:
        assert session.scalar(select(AiBudgetReservation.state)) == 'released'

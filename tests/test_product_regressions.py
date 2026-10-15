# SPDX-License-Identifier: AGPL-3.0-or-later

"""Regression gates for cached queues and late background results."""

from types import SimpleNamespace

import pytest

from app.ai import proposals_service
from app.ai.adapter import AdapterResult
from app.collections import cards
from app.jobs.service import JobCancelled


def test_queue_cache_copies_results_and_invalidates_wal(settings, monkeypatch):
    path = cards.collection_path(settings)
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_bytes(b"fixture collection")
    calls = []

    def read(_settings):
        calls.append(True)
        return [{"id": len(calls), "course": "Fixture"}]

    monkeypatch.setattr(cards, "_read_cards", read)
    first = cards.due_cards(settings)
    first[0]["course"] = "Changed by caller"
    assert cards.due_cards(settings)[0]["course"] == "Fixture"
    assert len(calls) == 1
    path.with_name(path.name + "-wal").write_bytes(b"fictional review")
    assert cards.due_cards(settings)[0]["id"] == 2
    assert len(calls) == 2


def test_late_ai_result_cannot_create_proposal_files(settings, factory, monkeypatch):
    settings.ai_adapter_enabled = True
    settings.ai_adapter_api_key = "fixture-only"
    cancelled = False
    enqueued = []

    def response(*_args):
        nonlocal cancelled
        cancelled = True
        return AdapterResult("fixture", 1, "{}")

    def check():
        if cancelled:
            raise JobCancelled

    monkeypatch.setattr(proposals_service, "build_ai_package", lambda *_args: SimpleNamespace(content=b"fictional"))
    monkeypatch.setattr(proposals_service, "select_adapter", lambda *_args: None)
    monkeypatch.setattr(proposals_service, "submit", response)
    monkeypatch.setattr(proposals_service, "enqueue_cards", lambda *_args: enqueued.append(True))
    with pytest.raises(JobCancelled):
        proposals_service.propose(factory, settings, SimpleNamespace(course_id=1, mode="cards"), check)
    assert not enqueued

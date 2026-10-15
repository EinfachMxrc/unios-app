# SPDX-License-Identifier: AGPL-3.0-or-later
"""Synthetic PDFs, durable manual identity and real Anki source-card workflows."""

import hashlib
from concurrent.futures import ThreadPoolExecutor
from contextlib import contextmanager
from copy import deepcopy
from datetime import UTC, datetime
from threading import Barrier
from uuid import uuid4

import pymupdf
import pytest
from bs4 import BeautifulSoup
from fastapi import HTTPException
from fastapi.testclient import TestClient
from filelock import FileLock
from sqlalchemy import func, select
from sqlalchemy.exc import OperationalError

from app.anki.collection import open_collection, write_study_mode
from app.anki.manual_repository import ManualCardRepository, ManualCardTransaction
from app.anki.manual_schema import ManualCardInput
from app.anki.manual_service import ManualCardError, ManualCardService
from app.anki.transfer_repository import TransferRepository
from app.anki.transfer_service import TransferService
from app.db.models import (
    AiAccess,
    AnkiCard,
    AnkiCardQueue,
    Course,
    LearningTopic,
    MaterialAnnotation,
    Resource,
    ResourceVersion,
)
from app.main import create_app
from app.material.service import create, delete_annotation, reanchor, update

QUOTE = "Continuous functions preserve limits."
UPDATED_QUOTE = "Uniform continuity controls every point."


def _pdf(settings, relative, quote=QUOTE, pages=(12,)):
    path = settings.data_dir / relative
    path.parent.mkdir(parents=True, exist_ok=True)
    with pymupdf.open() as pdf:
        for number in range(1, 18):
            page = pdf.new_page()
            if number in pages:
                page.insert_text((72, 100), quote)
        pdf.save(path)
    return path, hashlib.sha256(path.read_bytes()).hexdigest()


def _seed(settings, factory, *, suffix="one", kind="highlight"):
    path, digest = _pdf(settings, f"uni/{suffix}.v1.pdf")
    with factory() as session:
        course = Course(source="fixture", source_id=suffix, name=f"Fiktives Fach {suffix}", short_name=f"Fach {suffix}")
        session.add(course)
        session.flush()
        resource = Resource(source="fixture", source_key=suffix, course_id=course.id,
                             kind="file", name=f"Skript {suffix}.pdf", url="https://example.invalid/synthetic")
        session.add(resource)
        session.flush()
        version = ResourceVersion(resource_id=resource.id, version=1, sha256=digest,
            relative_path=path.relative_to(settings.data_dir).as_posix(), size=path.stat().st_size,
            mime_type="application/pdf", downloaded_at=datetime.now(UTC))
        session.add(version)
        session.flush()
        annotation = create(session, settings.data_dir, version, kind, QUOTE, 12, "Eigene Frage?")
        return {"course_id": course.id, "resource_id": resource.id, "version_id": version.id,
                "sha256": digest, "annotation_id": annotation.id, "course_name": course.name}


def _payload(seed_source, **changes):
    return {"mutation_id": str(uuid4()), "front": "Was bewahrt Stetigkeit?", "back": QUOTE,
            "topic": "Stetigkeit", "source": {"version_id": seed_source["version_id"],
            "annotation_id": seed_source["annotation_id"], "expected_revision": 1, "page": 12}, **changes}


def _client(settings, coordinator):
    return TestClient(create_app(settings, connectors=[], start_scheduler=False, coordinator=coordinator))


def _service(settings, factory, coordinator):
    return ManualCardService(settings, ManualCardRepository(settings, factory, coordinator),
                              TransferService(settings, factory, coordinator))


def _add_version(settings, factory, source, *, quote=UPDATED_QUOTE, pages=(17,)):
    path, digest = _pdf(settings, "uni/one.v2.pdf", quote, pages)
    with factory() as session:
        version = ResourceVersion(resource_id=source["resource_id"], version=2, sha256=digest,
            relative_path=path.relative_to(settings.data_dir).as_posix(), size=path.stat().st_size,
            mime_type="application/pdf", downloaded_at=datetime.now(UTC))
        session.add(version)
        session.commit()
        return version.id


def test_manual_cards_do_not_consume_ai_budget_or_need_ai_permission(settings, factory, coordinator):
    source = _seed(settings, factory, kind="question")
    settings.max_anki_candidates_per_resource = 1
    with factory() as session:
        session.add_all([AiAccess(key="category:course_material", allowed=False),
                         AiAccess(key=f"course:{source['course_id']}", allowed=False)])
        session.commit()
    with _client(settings, coordinator) as client:
        for _ in range(16):
            response = client.post("/api/anki/manual-cards", json=_payload(source))
            assert response.status_code == 201, response.text
            data = response.json()
            assert data["status"] == "approved" and data["note_id"] is None
            assert data["transfer_error"] is None
            assert data["card"]["confidence"] is None
            assert data["card"]["source_question_id"] == source["annotation_id"]
            assert data["source"]["version_id"] == source["version_id"]
            assert data["source"]["sha256"] == source["sha256"]
        ai = {"schema_version": 1, "generated_by": "synthetic", "generated_at": datetime.now(UTC).isoformat(),
              "source": {"resource_id": source["resource_id"], "version": 1}, "cards": [{
                  "card_type": "basic", "front": "AI question", "back": "AI answer", "course": "unused",
                  "topic": "Stetigkeit", "confidence": "high"}]}
        assert client.post("/api/anki/queue/import", json=ai).status_code == 403
        with factory() as session:
            for permission in session.scalars(select(AiAccess)):
                permission.allowed = True
            session.commit()
        assert client.post("/api/anki/queue/import", json=ai).status_code == 201
        assert client.post("/api/anki/queue/import", json=ai).status_code == 422
        queue = client.get("/api/anki/queue").json()
        assert len(queue) == 17
        assert sum(item["origin"] == "manual" for item in queue) == 16
        assert queue[0]["card"]["confidence"] == "high"


@pytest.mark.parametrize("course_name,short_name", [
    ("Synthetischer Kurs " + "A" * 240, None),
    ("Synthetisches Fach", "Ä" * 200),
])
def test_long_course_tag_keeps_complete_source_and_deck_name(settings, factory, coordinator, course_name, short_name):
    source = _seed(settings, factory)
    with factory() as session:
        course = session.get(Course, source["course_id"])
        course.name = course_name
        course.short_name = short_name
        session.commit()
    with _client(settings, coordinator) as client:
        response = client.post("/api/anki/manual-cards", json=_payload(source))
        assert response.status_code == 201, response.text
        saved = response.json()
        assert len(saved["card"]["course"]) == 200
        assert saved["source"]["course_name"] == course_name
        assert saved["deck_name"] == f"Uni::{course_name}"
        assert client.get(f"/api/anki/manual-cards/{saved['queue_id']}").json() == saved
        queue = client.get("/api/anki/queue").json()[0]
        assert queue["course_name"] == course_name
        assert queue["deck_name"] == f"Uni::{course_name}"
    with factory() as session:
        course = session.get(Course, source["course_id"])
        assert (course.name, course.short_name) == (course_name, short_name)
        stored = session.get(AnkiCardQueue, saved["queue_id"])
        assert stored.source_snapshot["source"]["course_name"] == course_name


def test_frozen_v1_page12_survives_v2_page17_and_annotation_deletion(settings, factory, coordinator):
    source = _seed(settings, factory)
    payload = _payload(source)
    with _client(settings, coordinator) as client:
        created = client.post("/api/anki/manual-cards", json=payload).json()
        version2_id = _add_version(settings, factory, source)
        with factory() as session:
            annotation = session.get(MaterialAnnotation, source["annotation_id"])
            version2 = session.get(ResourceVersion, version2_id)
            assert annotation is not None and version2 is not None
            reanchor(session, settings.data_dir, annotation, version2, quote=UPDATED_QUOTE, page=17,
                     rects=[[0.1, 0.1, 0.5, 0.2]], expected_revision=1)
        replay = client.post("/api/anki/manual-cards", json=payload)
        assert replay.status_code == 201
        assert replay.json() == created
        assert created["source"]["page"] == 12
        assert created["source"]["quote"] == QUOTE
        assert created["source"]["url"] == f"/material/{source['version_id']}?page=12"
        # A new card from the historical viewer must use that viewer's quote,
        # while its concurrency token tracks the current annotation revision.
        historical = client.post("/api/anki/manual-cards", json=_payload(source, source={
            **payload["source"], "expected_revision": 2}))
        assert historical.status_code == 201, historical.text
        assert historical.json()["source"]["version_id"] == source["version_id"]
        assert historical.json()["source"]["quote"] == QUOTE
        assert historical.json()["source"]["annotation_revision"] == 2
        with factory() as session:
            annotation = session.get(MaterialAnnotation, source["annotation_id"])
            assert annotation is not None
            delete_annotation(session, settings.data_dir, annotation, expected_revision=2)
        assert client.post("/api/anki/manual-cards", json=payload).json() == created
        assert client.get(f"/api/anki/manual-cards/{created['queue_id']}").json() == created
        changed = client.post("/api/anki/manual-cards", json={**payload, "back": "Changed answer"})
        assert changed.status_code == 409
        assert changed.json()["code"] == "MANUAL_MUTATION_CONFLICT"
    with factory() as session:
        assert session.scalar(select(func.count()).select_from(AnkiCardQueue)) == 2


def test_native_transfer_is_targeted_literal_and_recoverable_after_ack_failure(
        settings, factory, coordinator, monkeypatch):
    source = _seed(settings, factory)
    with factory() as session:
        other = AnkiCardQueue(resource_id=source["resource_id"], status="approved", payload=
            '{"card_type":"basic","front":"Other","back":"Answer","course":"other",'
            '"topic":"Other","confidence":"high"}')
        session.add(other)
        session.commit()
        other_id = other.id
    write_study_mode(settings, "integrated")
    payload = _payload(source, front="<T> &\nSecond line", back='<script>alert("synthetic")</script>')
    original_ack = TransferRepository.acknowledge
    def fail_ack(*args, **kwargs):
        raise OperationalError("Synthetic acknowledgement", {}, RuntimeError("Synthetic storage unavailable"))
    monkeypatch.setattr(TransferRepository, "acknowledge", fail_ack)
    with _client(settings, coordinator) as client:
        response = client.post("/api/anki/manual-cards", json=payload)
        assert response.status_code == 201, response.text
        saved = response.json()
        assert saved["status"] == "approved" and saved["transfer_error"]
        with open_collection(settings) as collection:
            assert len(collection.find_notes("")) == 1
        monkeypatch.setattr(TransferRepository, "acknowledge", original_ack)
        retried = client.post(f"/api/anki/manual-cards/{saved['queue_id']}/transfer")
        assert retried.status_code == 200, retried.text
        pushed = retried.json()
        assert pushed["status"] == "pushed" and pushed["transfer_error"] is None
        assert client.post("/api/anki/manual-cards", json=payload).json() == pushed
        due = client.get("/api/anki/study/due").json()["cards"]
        assert len(due) == 1
        assert BeautifulSoup(due[0]["front_html"], "html.parser").get_text("\n") == payload["front"]
        assert "<script>" not in due[0]["back_html"]
        assert due[0]["source"] == saved["source"]
        assert client.post("/api/anki/study/reviews", json={
            "card_id": due[0]["id"], "rating": 3, "review_id": "manual-real-review"}).status_code == 200
    with open_collection(settings) as collection:
        assert len(collection.find_notes("")) == 1
        assert collection.get_config("fsrs") is True
        assert collection.db is not None
        assert collection.db.scalar("SELECT count(*) FROM revlog") == 1
    with factory() as session:
        assert session.get(AnkiCardQueue, other_id).status == "approved"
        assert session.scalar(select(func.count()).select_from(AnkiCard)) == 1


@pytest.mark.parametrize("kind", ["revision", "page", "foreign", "unknown", "other_group"])
def test_invalid_new_source_never_creates_a_queue_or_topic(settings, factory, coordinator, kind):
    source = _seed(settings, factory)
    payload = _payload(source)
    if kind == "revision":
        payload["source"]["expected_revision"] = 2
    elif kind == "page":
        payload["source"]["page"] = 13
    elif kind == "foreign":
        other = _seed(settings, factory, suffix="two")
        payload["source"]["annotation_id"] = other["annotation_id"]
    elif kind == "unknown":
        payload["source"]["version_id"] = 999999
    else:
        with factory() as session:
            resource = session.get(Resource, source["resource_id"])
            assert resource is not None
            resource.group_category = "other_group"
            session.commit()
    with _client(settings, coordinator) as client:
        response = client.post("/api/anki/manual-cards", json=payload)
        assert response.status_code == (404 if kind in {"unknown", "other_group"} else 409), response.text
        assert response.json()["code"] == ("MANUAL_SOURCE_CHANGED" if kind in {"revision", "page"}
                                            else "MANUAL_CARD_ERROR")
    with factory() as session:
        assert session.scalar(select(func.count()).select_from(AnkiCardQueue)) == 0
        assert session.scalar(select(func.count()).select_from(LearningTopic)) == 0


def test_ambiguous_new_version_is_not_a_manual_source(settings, factory, coordinator):
    source = _seed(settings, factory)
    duplicate_version = _add_version(settings, factory, source, quote=QUOTE, pages=(12, 17))
    payload = _payload(source)
    payload["source"]["version_id"] = duplicate_version
    with _client(settings, coordinator) as client:
        assert client.post("/api/anki/manual-cards", json=payload).status_code == 409


def test_revision_is_checked_after_resource_lock_and_refresh(settings, factory, coordinator, monkeypatch):
    source = _seed(settings, factory)
    original = ManualCardRepository.write_for_source
    @contextmanager
    def concurrent_update(self, resource_id):
        with factory() as session:
            annotation = session.get(MaterialAnnotation, source["annotation_id"])
            assert annotation is not None
            update(session, settings.data_dir, annotation, comment="Concurrent edit", resolved=False, expected_revision=1)
        with original(self, resource_id) as transaction:
            yield transaction
    monkeypatch.setattr(ManualCardRepository, "write_for_source", concurrent_update)
    with pytest.raises(ManualCardError) as error:
        _service(settings, factory, coordinator).create(ManualCardInput.model_validate(_payload(source)))
    assert error.value.status_code == 409
    assert error.value.code == "MANUAL_SOURCE_CHANGED"
    with factory() as session:
        assert session.scalar(select(func.count()).select_from(AnkiCardQueue)) == 0


def test_resource_lock_is_released_before_native_transfer(settings, factory, coordinator, monkeypatch):
    source = _seed(settings, factory)
    write_study_mode(settings, "integrated")
    original = TransferService.transfer
    called = []
    def checked_transfer(self, queue_id):
        lock_path = settings.data_dir / "annotations" / "locks" / f"{source['resource_id']}.lock"
        with FileLock(lock_path, timeout=0):
            called.append(queue_id)
        return original(self, queue_id)
    monkeypatch.setattr(TransferService, "transfer", checked_transfer)
    result = _service(settings, factory, coordinator).create(ManualCardInput.model_validate(_payload(source)))
    assert result.status == "pushed" and called == [result.queue_id]


def test_concurrent_identical_requests_share_one_durable_receipt(settings, factory, coordinator):
    source = _seed(settings, factory)
    payload = ManualCardInput.model_validate(_payload(source))
    service = _service(settings, factory, coordinator)
    barrier = Barrier(2)
    def save():
        barrier.wait(timeout=10)
        return service.create(payload)
    with ThreadPoolExecutor(max_workers=2) as executor:
        results = list(executor.map(lambda _: save(), range(2)))
    assert results[0].queue_id == results[1].queue_id
    with factory() as session:
        assert session.scalar(select(func.count()).select_from(AnkiCardQueue)) == 1


def test_database_unique_race_returns_the_committed_winner(settings, factory, coordinator, monkeypatch):
    source = _seed(settings, factory)
    with factory() as session:
        session.add(LearningTopic(course_id=source["course_id"], slug="stetigkeit", name="Stetigkeit"))
        session.commit()
    # Exercise the database fallback independently of the local resource mutex,
    # as required for writers using different locks or another database backend.
    @contextmanager
    def without_local_mutex(self, resource_id):
        with factory() as session:
            yield ManualCardTransaction(session, settings, coordinator)
    original_save = ManualCardTransaction.save
    barrier = Barrier(2)
    def simultaneous_insert(self, **kwargs):
        barrier.wait(timeout=10)
        return original_save(self, **kwargs)
    monkeypatch.setattr(ManualCardRepository, "write_for_source", without_local_mutex)
    monkeypatch.setattr(ManualCardTransaction, "save", simultaneous_insert)
    payload = ManualCardInput.model_validate(_payload(source))
    service = _service(settings, factory, coordinator)
    with ThreadPoolExecutor(max_workers=2) as executor:
        results = list(executor.map(lambda _: service.create(payload), range(2)))
    assert results[0].queue_id == results[1].queue_id
    with factory() as session:
        assert session.scalar(select(func.count()).select_from(AnkiCardQueue)) == 1


@pytest.mark.parametrize("changes", [{"origin": "ai"}, {"confidence": "high"}, {"card_type": "cloze"},
                                    {"front": " "}, {"front": "x" * 4001}, {"back": "x" * 8001},
                                    {"topic": "x" * 201}, {"mutation_id": "not-a-uuid"}])
def test_manual_input_rejects_origin_override_and_invalid_content(settings, factory, coordinator, changes):
    source = _seed(settings, factory)
    with _client(settings, coordinator) as client:
        assert client.post("/api/anki/manual-cards", json=_payload(source, **changes)).status_code == 422


def test_standby_cannot_create_or_retry_but_can_read_saved_status(settings, factory, coordinator):
    source = _seed(settings, factory)
    with _client(settings, coordinator) as client:
        payload = _payload(source)
        saved = client.post("/api/anki/manual-cards", json=payload).json()
        coordinator.close()
        assert client.post("/api/anki/manual-cards", json=payload).status_code == 423
        assert client.post(f"/api/anki/manual-cards/{saved['queue_id']}/transfer").status_code == 423
        assert client.get(f"/api/anki/manual-cards/{saved['queue_id']}").status_code == 200


def test_transfer_fencing_failure_is_not_softened(settings, factory, coordinator, monkeypatch):
    source = _seed(settings, factory)
    payload = ManualCardInput.model_validate(_payload(source))
    service = _service(settings, factory, coordinator)
    saved = service.create(payload)
    write_study_mode(settings, "integrated")
    def lost_writer(*args, **kwargs):
        raise HTTPException(423, "Synthetic lost writer")
    monkeypatch.setattr(TransferService, "transfer", lost_writer)
    with pytest.raises(HTTPException) as error:
        service.transfer(saved.queue_id)
    assert error.value.status_code == 423


def test_manual_status_survives_client_restart_and_unknown_ids_are_rejected(settings, factory, coordinator):
    source = _seed(settings, factory)
    payload = _payload(source)
    with _client(settings, coordinator) as client:
        saved = client.post("/api/anki/manual-cards", json=payload).json()
    with _client(settings, coordinator) as client:
        assert client.get(f"/api/anki/manual-cards/{saved['queue_id']}").json() == saved
        assert client.post("/api/anki/manual-cards", json=deepcopy(payload)).json() == saved
        assert client.get("/api/anki/manual-cards/999999").status_code == 404
        assert client.post("/api/anki/manual-cards/999999/transfer").status_code == 404

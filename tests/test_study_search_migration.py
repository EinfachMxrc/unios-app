# SPDX-License-Identifier: AGPL-3.0-or-later

"""FTS5 migration indexes annotations already present in an older local database."""

import json
from datetime import UTC, datetime
from pathlib import Path

import pytest
from alembic.config import Config
from sqlalchemy import text

from alembic import command
from app.db.models import (
    CourseScratchpad,
    MaterialAnnotation,
    Resource,
)
from app.db.session import make_engine, make_session_factory
from app.extract.search import search_annotations, search_course_notes
from app.material.events import rebuild_annotation_index
from app.material.service import current_event


def test_existing_study_text_is_indexed_on_upgrade(settings, coordinator):
    root = Path(__file__).resolve().parents[1]
    config = Config(str(root / "alembic.ini"))
    config.attributes["settings"] = settings
    config.attributes["host_coordinator"] = coordinator
    command.upgrade(config, "6f4c0aa2d2bf")  # pragma: allowlist secret
    engine = make_engine(settings, coordinator)
    factory = make_session_factory(engine)
    with factory() as session:
        # Seed the historical schema without columns added by later ORM models.
        course_id = session.execute(text("""
            INSERT INTO courses (source, source_id, name, download_other_groups)
            VALUES ('test', 'existing', 'Fiktives Fach', 1)
        """)).lastrowid
        resource = Resource(source="test", source_key="existing", course_id=course_id,
                            kind="file", name="Alt.pdf", url="")
        session.add(resource)
        session.flush()
        version_id = session.execute(text("""
            INSERT INTO resource_versions
                (resource_id, version, sha256, relative_path, size, mime_type, downloaded_at)
            VALUES (:resource_id, 1, :sha256, 'uni/Alt.pdf', 1, 'application/pdf', :now)
        """), {"resource_id": resource.id, "sha256": "c" * 64,
               "now": datetime.now(UTC)}).lastrowid
        session.execute(text("""
            INSERT INTO material_annotations
                (id, resource_id, source_version_id, kind, quote, comment,
                 context_before, context_after, source_page, source_rects_json,
                 resolved, revision, created_at, updated_at)
            VALUES (:id, :resource_id, :version_id, 'question', 'Bestandsfrage',
                    'Im Tutorium klären', 'Davor', 'Danach', 1, '[[0.1,0.1,0.2,0.2]]',
                    0, 1, :now, :now)
        """), {"id": "55555555-5555-4555-8555-555555555555", "resource_id": resource.id,
               "version_id": version_id, "now": datetime.now(UTC)})
        session.add(CourseScratchpad(course_id=course_id, body="Bestehender Kurstext"))
        session.commit()
        resource_id = resource.id
    engine.dispose()

    with pytest.raises(RuntimeError, match="Markierungen zuerst"):
        command.upgrade(config, "head")
    journal = settings.data_dir / "annotations"
    journal.mkdir(parents=True)
    (journal / f"{resource_id}.jsonl").write_text(json.dumps({
        "action": "create", "id": "55555555-5555-4555-8555-555555555555",
        "resource_id": resource_id, "source_version_id": version_id,
        "source": "test", "source_key": "existing", "source_version": 1,
        "kind": "question", "quote": "Bestandsfrage", "comment": "Im Tutorium klären",
        "context_before": "Davor", "context_after": "Danach", "source_page": 1,
        "source_rects": [[0.1, 0.1, 0.2, 0.2]], "resolved": False, "revision": 1,
        "created_at": datetime.now(UTC).isoformat(), "updated_at": datetime.now(UTC).isoformat(),
    }) + "\n", encoding="utf-8")
    engine = make_engine(settings, coordinator)
    factory = make_session_factory(engine)
    with factory() as session:
        session.execute(text("DELETE FROM material_annotations WHERE id = :id"),
                        {"id": "55555555-5555-4555-8555-555555555555"})
        session.commit()
    with pytest.raises(RuntimeError, match="Markierungsindex zuerst"):
        command.upgrade(config, "head")
    assert rebuild_annotation_index(factory, settings.data_dir)["created"] == 1
    engine.dispose()
    command.upgrade(config, "head")
    engine = make_engine(settings, coordinator)
    factory = make_session_factory(engine)
    with factory() as session:
        assert search_annotations(session, "Bestandsfrage")[0]["resource_name"] == "Alt.pdf"
        assert search_annotations(session, "Tutorium")[0]["page_number"] == 1
        assert search_course_notes(session, "Bestehender")[0]["course_name"] == "Fiktives Fach"
        columns = {row[1] for row in session.execute(text("PRAGMA table_info(material_annotations)"))}
        assert not {"context_before", "context_after", "source_rects_json"} & columns
        item = session.get(MaterialAnnotation, "55555555-5555-4555-8555-555555555555")
        assert item is not None
        state = current_event(session, settings.data_dir, item)
        assert state["context_before"] == "Davor"
        assert state["source_rects"] == [[0.1, 0.1, 0.2, 0.2]]
    engine.dispose()

# SPDX-License-Identifier: AGPL-3.0-or-later

"""A PDF knows which notes quote it, per page and across its versions."""

from fastapi.testclient import TestClient
from sqlalchemy import text

from app.main import create_app
from app.material.citations import cited_pages
from app.notes.store import create_note
from tests.test_material import add_version, prepare


def test_cited_pages_reads_only_source_links_of_the_given_versions():
    body = (
        "> Zitat\n\n[Skript · 3](/material/7?page=3)\n\n"
        "[Skript · 12](/material/9?page=12) und noch einmal [S. 3](/material/7?page=3)\n"
        "Fremd: [Anderes · 1](/material/70?page=1) · kaputt (/material/7?page=0) · /material/7?page=x\n"
    )
    assert cited_pages(body, {7, 9}) == [3, 12]
    assert cited_pages(body, {70}) == [1]
    assert cited_pages(body, {8}) == []
    assert cited_pages("", {7}) == []


def test_reader_lists_citing_notes_for_every_version_of_the_resource(settings, factory, coordinator):
    resource_id, first_version, _ = prepare(settings, factory, ["Seite eins", "Seite zwei", "Seite drei"])
    second_version = add_version(settings, factory, resource_id, 2, ["Neu eins", "Neu zwei"])
    with factory() as session:
        session.execute(text("CREATE VIRTUAL TABLE notes_fts USING fts5(note_id UNINDEXED, title, body)"))
        from app.db.models import Resource

        course_id = session.get(Resource, resource_id).course_id
        old = create_note(session, settings, course_id=course_id, resource_id=resource_id, title="Mitschrift alt",
                          body=f"> Satz\n\n[Skript.pdf · 3](/material/{first_version}?page=3)\n")
        new = create_note(session, settings, course_id=course_id, resource_id=None, title="Zusammenfassung",
                          body=f"Erst [S. 2](/material/{second_version}?page=2), dann [S. 1](/material/{second_version}?page=1).")
        create_note(session, settings, course_id=course_id, resource_id=None, title="Ohne Quelle",
                    body="Nur eigener Text über /material/ ohne Link.")
        old_id, new_id = old.id, new.id

    app = create_app(settings, connectors=[], start_scheduler=False, coordinator=coordinator)
    with TestClient(app) as client:
        response = client.get(f"/api/material/{second_version}/citations")
        assert response.status_code == 200
        citations = response.json()["citations"]
        by_id = {item["note_id"]: item for item in citations}
        assert set(by_id) == {old_id, new_id}
        assert by_id[new_id]["pages"] == [1, 2]
        assert by_id[new_id]["current_version"] is True
        # A quote of an older version stays visible, flagged so the reader can say so.
        assert by_id[old_id]["pages"] == [3]
        assert by_id[old_id]["current_version"] is False
        assert by_id[old_id]["title"] == "Mitschrift alt"
        assert by_id[old_id]["course_name"] == "Fiktive Informatik"
        assert client.get("/api/material/999999/citations").status_code == 404

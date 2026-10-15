# SPDX-License-Identifier: AGPL-3.0-or-later

"""A Moodle page or other non-PDF file opens as readable text inside UniOS instead of only downloading."""

from datetime import UTC, datetime

from fastapi.testclient import TestClient

from app.db.models import Course, Resource, ResourceText, ResourceVersion
from app.main import create_app


def seed(factory, pages: list[str], relative_path: str = "uni/Tagebuch/index.html", mime: str = "text/html") -> int:
    with factory() as session:
        course = Course(source="fixture", source_id="c-doc", name="Fiktive Informatik")
        session.add(course)
        session.flush()
        resource = Resource(source="fixture", source_key="r-doc", course_id=course.id, kind="file",
                            name="Tagebuch", url="https://moodle.example.invalid/page")
        session.add(resource)
        session.flush()
        version = ResourceVersion(resource_id=resource.id, version=1, sha256="b" * 64,
                                  relative_path=relative_path, size=120, mime_type=mime,
                                  downloaded_at=datetime.now(UTC))
        session.add(version)
        session.flush()
        for number, body in enumerate(pages, start=1):
            session.add(ResourceText(version_id=version.id, page_number=number, text=body, markdown=f"## {body}"))
        session.commit()
        return version.id


def test_a_moodle_page_opens_as_text_with_its_course_and_title(settings, factory, coordinator):
    version_id = seed(factory, ["Woche 1", "Woche 2"])
    app = create_app(settings, connectors=[], start_scheduler=False, coordinator=coordinator)
    with TestClient(app) as client:
        response = client.get(f"/api/documents/{version_id}")
        assert response.status_code == 200
        assert response.json() == {
            "version_id": version_id, "resource_name": "Tagebuch", "course_id": response.json()["course_id"],
            "course_name": "Fiktive Informatik", "filename": "index.html", "view": "page", "size": 120,
            "markdown": "## Woche 1\n\n## Woche 2",
        }
        assert client.get("/api/documents/999999").status_code == 404


def test_a_file_without_extracted_text_still_opens_and_says_so(settings, factory, coordinator):
    version_id = seed(factory, [])
    app = create_app(settings, connectors=[], start_scheduler=False, coordinator=coordinator)
    with TestClient(app) as client:
        assert client.get(f"/api/documents/{version_id}").json()["markdown"] == ""


def store(settings, relative_path: str, content: bytes) -> None:
    target = settings.data_dir / relative_path
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_bytes(content)


def test_code_and_media_open_in_the_viewer_with_safe_headers(settings, factory, coordinator):
    code_id = seed(factory, ["print('hallo')"], "uni/Prog/aufgabe1.py", "text/x-python")
    store(settings, "uni/Prog/aufgabe1.py", b"print('hallo')\n")
    app = create_app(settings, connectors=[], start_scheduler=False, coordinator=coordinator)
    with TestClient(app) as client:
        document = client.get(f"/api/documents/{code_id}").json()
        assert (document["view"], document["filename"], document["markdown"]) == ("code", "aufgabe1.py", "")
        served = client.get(f"/files/{code_id}/view")
        assert served.status_code == 200
        assert served.text == "print('hallo')\n"
        assert served.headers["content-type"].startswith("text/plain")
        assert served.headers["x-content-type-options"] == "nosniff"
        assert "sandbox" in served.headers["content-security-policy"]
        assert served.headers["content-disposition"] == "inline"
        assert client.get("/files/999999/view").status_code == 404


def test_a_page_or_unknown_file_is_not_served_to_the_viewer(settings, factory, coordinator):
    page_id = seed(factory, ["Woche 1"])
    store(settings, "uni/Tagebuch/index.html", b"<script>alert(1)</script>")
    app = create_app(settings, connectors=[], start_scheduler=False, coordinator=coordinator)
    with TestClient(app) as client:
        assert client.get(f"/files/{page_id}/view").status_code == 415


def test_oversized_text_is_left_to_the_download(settings, factory, coordinator):
    big_id = seed(factory, [], "uni/Daten/messwerte.csv", "text/csv")
    store(settings, "uni/Daten/messwerte.csv", b"a,b\n" * 600_000)
    app = create_app(settings, connectors=[], start_scheduler=False, coordinator=coordinator)
    with TestClient(app) as client:
        assert client.get(f"/api/documents/{big_id}").json()["view"] == "table"
        assert client.get(f"/files/{big_id}/view").status_code == 413

# SPDX-License-Identifier: AGPL-3.0-or-later

"""Scanned pages can be indexed locally without changing the original PDF."""

from fastapi.testclient import TestClient

from app.db.models import Course, Resource, ResourceText, ResourceVersion
from app.main import create_app


class FakePage:
    def get_textpage_ocr(self, **kwargs):
        assert kwargs["language"] == "deu+eng"
        return object()

    def get_text(self, _kind, **kwargs):
        assert kwargs["textpage"] is not None
        return "Erkannte Rekursion"


class FakePDF:
    def __enter__(self):
        return self

    def __exit__(self, *_args):
        return None

    def __len__(self):
        return 1

    def __getitem__(self, index):
        assert index == 0
        return FakePage()


def test_local_ocr_indexes_scanned_page_once(settings, factory, coordinator, monkeypatch, tmp_path):
    source = settings.data_dir / "uni" / "scan.pdf"
    source.parent.mkdir(parents=True)
    source.write_bytes(b"fake pdf")
    tessdata = tmp_path / "tessdata"
    tessdata.mkdir()
    (tessdata / "deu.traineddata").write_bytes(b"fixture")
    (tessdata / "eng.traineddata").write_bytes(b"fixture")
    monkeypatch.setattr("app.extract.ocr_service.pymupdf.get_tessdata", lambda: str(tessdata))
    calls = []
    monkeypatch.setattr("app.extract.ocr_service.pymupdf.open", lambda path: calls.append(path) or FakePDF())
    with factory() as session:
        course = Course(source="fixture", source_id="ocr", name="Programmieren")
        session.add(course)
        session.flush()
        resource = Resource(source="fixture", source_key="scan", course_id=course.id,
                            kind="file", name="Scan.pdf", url="")
        session.add(resource)
        session.flush()
        version = ResourceVersion(resource_id=resource.id, version=1, sha256="a" * 64,
                                  relative_path="uni/scan.pdf", size=8, mime_type="application/pdf")
        session.add(version)
        session.flush()
        text = ResourceText(version_id=version.id, page_number=1, text="",
                            markdown="## Seite 1\n\n\n", no_text_layer=True)
        session.add(text)
        session.commit()
        version_id, text_id = version.id, text.id

    with TestClient(create_app(settings, connectors=[], start_scheduler=False, coordinator=coordinator)) as client:
        assert client.get(f"/api/ocr/material/{version_id}").json()["pending_pages"] == 1
        first = client.post(f"/api/ocr/material/{version_id}")
        assert first.status_code == 200, first.text
        assert (first.json()["pending_pages"], first.json()["recognized_pages"]) == (0, 1)
        assert client.post(f"/api/ocr/material/{version_id}").status_code == 200
    assert len(calls) == 1
    assert source.read_bytes() == b"fake pdf"
    with factory() as session:
        item = session.get(ResourceText, text_id)
        assert (item.text, item.no_text_layer) == ("Erkannte Rekursion", True)
        assert item.ocr_attempted_at is not None

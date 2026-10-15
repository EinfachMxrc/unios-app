# SPDX-License-Identifier: AGPL-3.0-or-later

import hashlib
from pathlib import Path

import pymupdf
import pytest
from fastapi.testclient import TestClient

from app.db.models import ResourceVersion
from app.main import create_app
from app.material.errors import MaterialError
from app.material.preview import PreviewUnavailable, preview_pdf_path
from app.material.text_pdf import MAX_TEXT_BYTES, text_pdf
from tests.test_material import prepare


@pytest.mark.parametrize("encoding", ["utf-8-sig", "utf-16", "cp1252"])
def test_text_encoding_and_literal_markup(tmp_path: Path, encoding: str):
    source = tmp_path / "Hinweise.txt"
    source.write_bytes('Grüße für Übungen ≤ 3\n<script>kein HTML</script>\n\tEingerückt'.encode(encoding, errors="replace"))
    with pymupdf.open(stream=text_pdf(source), filetype="pdf") as pdf:
        text = pdf[0].get_text()
        assert "Grüße für Übungen" in text
        assert "<script>kein HTML</script>" in text
        assert "Eingerückt" in text
        if encoding != "cp1252":
            assert "≤ 3" in text


def test_text_pages_and_long_lines_keep_last_passage(tmp_path: Path):
    source = tmp_path / "LangerText.txt"
    source.write_text(("Zeile für Übungen\n" * 105) + "W" * 300 + " Ende", encoding="utf-8")
    with pymupdf.open(stream=text_pdf(source), filetype="pdf") as pdf:
        assert len(pdf) >= 3
        assert "Ende" in pdf[-1].get_text()
        for page in pdf:
            for word in page.get_text("words"):
                assert 47 <= word[0] < word[2] <= 548


@pytest.mark.parametrize("content", [b"", b"\n\n"])
def test_empty_text_has_readable_blank_page(tmp_path: Path, content: bytes):
    source = tmp_path / "Leer.txt"
    source.write_bytes(content)
    with pymupdf.open(stream=text_pdf(source), filetype="pdf") as pdf:
        assert len(pdf) == 1


@pytest.mark.parametrize("content", [b"binary\x00data", b"x" * (MAX_TEXT_BYTES + 1)], ids=["binary", "oversized"])
def test_rejects_binary_and_oversized_text(tmp_path: Path, content: bytes):
    source = tmp_path / "Unlesbar.txt"
    source.write_bytes(content)
    with pytest.raises(MaterialError):
        text_pdf(source)


def test_txt_reader_annotations_cache_and_original(settings, factory, coordinator, monkeypatch):
    resource_id, _, _ = prepare(settings, factory, ["Platzhalter"])
    original = b"Synthetic TXT source\nSecond passage"
    source = settings.data_dir / "uni" / "Hinweise.TXT"
    source.write_bytes(original)
    version = ResourceVersion(resource_id=resource_id, version=2,
                              sha256=hashlib.sha256(original).hexdigest(),
                              relative_path="uni/Hinweise.TXT", size=len(original), mime_type="text/plain")
    with pytest.raises(PreviewUnavailable):
        preview_pdf_path(settings.data_dir, version)
    with factory() as session:
        session.add(version)
        session.commit()
        version_id = version.id
    monkeypatch.setenv("LIBREOFFICE_BIN", "/missing/soffice")
    app = create_app(settings, connectors=[], start_scheduler=False, coordinator=coordinator)
    with TestClient(app) as client:
        first = client.get(f"/files/{version_id}/inline")
        assert first.status_code == 200 and first.headers["content-type"] == "application/pdf"
        assert client.get(f"/files/{version_id}/inline").content == first.content
        assert client.get(f"/api/material/{version_id}").status_code == 200
        response = client.post(f"/api/material/{version_id}/annotations", json={
            "kind": "question", "quote": "Synthetic TXT source", "page": 1, "comment": "Synthetic question",
        })
        assert response.status_code == 200, response.text
        assert client.get(f"/files/{version_id}").content == original
    assert source.read_bytes() == original
    assert preview_pdf_path(settings.data_dir, version).is_file()

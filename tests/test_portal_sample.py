# SPDX-License-Identifier: AGPL-3.0-or-later

"""Fake HTML shows the shared archive contains no source text or portal URLs."""

import json
from pathlib import Path
from tempfile import TemporaryDirectory
from zipfile import ZipFile

from app.portals.sample import (
    AliasMap,
    anonymize_html,
    load_alias_map,
    resolve_selectors,
    save_alias_map,
)
from clients.portal_sample.__main__ import export_sample


def test_anonymized_page_keeps_structure_without_personal_data():
    source = """<!doctype html><html><head><script>secretToken='abc'</script></head>
    <body><div class="profile max-mustermann" id="student-12345" data-user="Max Mustermann">
      Max Mustermann <a href="https://portal.example.invalid/start?Session=secret123">Prüfungen</a>
      <time datetime="2026-10-12T08:00:00+02:00">12. Oktober</time>
      <form><input name="password" value="private-value"></form>
      <!-- private comment -->
    </div></body></html>"""
    mapping = AliasMap("primuss")
    result = anonymize_html(source, mapping)
    for sensitive in ("Max Mustermann", "student-12345", "secretToken", "secret123",
                      "private-value", "password", "2026-10-12", "private comment", "profile"):
        assert sensitive not in result
    assert 'href="#redacted"' in result
    assert 'datetime="REDACTED"' in result
    assert 'class="anon-c1 anon-c2"' in result
    assert resolve_selectors({"exams": ".anon-c1#anon-i1", "registered_text": "Angemeldet"},
                             mapping.aliases) == {
                                 "exams": ".profile#student-12345", "registered_text": "Angemeldet"}


def test_exporter_writes_only_anonymized_pages_and_manifest(monkeypatch):
    saved = []
    monkeypatch.setattr("app.portals.sample_export.save_alias_map", saved.append)
    with TemporaryDirectory() as directory:
        folder = Path(directory)
        source = folder / "private.html"
        source.write_text('<div id="student-123">Geheime Note 1,0</div>', encoding="utf-8")
        target = folder / "shared.zip"
        identifier = export_sample("primuss", [source], target)
        assert saved[0].map_id == identifier
        with ZipFile(target) as archive:
            assert sorted(archive.namelist()) == ["manifest.json", "page-1.html"]
            manifest = json.loads(archive.read("manifest.json"))
            assert manifest["selector_alias_map"] == identifier
            assert b"Geheime Note" not in archive.read("page-1.html")
            assert b"student-123" not in archive.read("page-1.html")
            assert b"student-123" not in archive.read("manifest.json")


def test_alias_values_remain_in_mock_secure_store(monkeypatch):
    secure = {}
    monkeypatch.setattr("app.portals.sample.keyring_available", lambda: True)
    monkeypatch.setattr("app.portals.sample.keyring.set_password",
                        lambda _service, account, value: secure.__setitem__(account, value))
    monkeypatch.setattr("app.portals.sample.keyring.get_password",
                        lambda _service, account: secure.get(account))
    mapping = AliasMap("primuss")
    mapping.alias("c", "private-student-class")
    save_alias_map(mapping)
    assert load_alias_map("primuss", mapping.map_id) == {"anon-c1": "private-student-class"}
    assert load_alias_map("primuss", "invalid") is None


def test_large_alias_map_uses_small_credential_chunks(monkeypatch):
    secure: dict[str, str] = {}
    monkeypatch.setattr("app.portals.sample.keyring_available", lambda: True)

    def store(_service: str, account: str, value: str) -> None:
        if len(value) > 700:
            raise OSError(1783, "Credential exceeds test store limit")
        secure[account] = value

    monkeypatch.setattr("app.portals.sample.keyring.set_password", store)
    monkeypatch.setattr("app.portals.sample.keyring.get_password",
                        lambda _service, account: secure.get(account))
    mapping = AliasMap("mycampus")
    for index in range(120):
        mapping.alias("c", f"private-class-{index:04d}-" + f"{index * 7919:08x}" * 8)
    save_alias_map(mapping)
    assert len(secure) > 2
    assert all(len(value) <= 700 for value in secure.values())
    assert load_alias_map("mycampus", mapping.map_id) == mapping.aliases

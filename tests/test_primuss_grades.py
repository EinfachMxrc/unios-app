# SPDX-License-Identifier: AGPL-3.0-or-later

"""Fake-only grade import: stable identity, cautious values, idempotent history."""

from types import SimpleNamespace

import httpx
import pytest
from fastapi.testclient import TestClient
from sqlalchemy import select

from app.db.models import AcademicModule, AcademicModuleRevision
from app.main import create_app
from app.portals.primuss_grades import parse_grade_rows
from app.portals.read_client import PortalReadClient
from app.portals.session import validate_session

BASE = "https://portal.example.invalid/"
SELECTORS = {
    "grades_link": "a.grades", "grades": "tr.grade", "grade_key_attr": "id",
    "grade_title": ".title", "grade_ects": ".ects", "grade_value": ".value",
    "grade_status": ".status", "grade_status_passed": "bestanden",
    "grade_status_failed": "nicht bestanden", "grade_status_open": "offen",
    "grade_attempt": ".attempt",
}
GRADES = """<table><tr class="grade" id="course-1"><td class="title">Fiktive Mathematik</td>
<td class="ects">5</td><td class="value">1,7</td><td class="status">bestanden</td>
<td class="attempt">1</td></tr></table>"""


def test_grade_parser_skips_unknown_values_and_rejects_duplicate_keys():
    html = GRADES.replace("</table>", """<tr class="grade" id="course-2">
<td class="title">Fiktive Physik</td><td class="ects">5 CP</td>
<td class="value">2,0</td><td class="status">bestanden</td></tr></table>""")
    rows, warnings = parse_grade_rows(html, SELECTORS)
    assert len(rows) == 1 and len(warnings) == 1
    assert rows[0].source_key.startswith("module:")
    assert "course-1" not in rows[0].source_key
    assert rows[0].ects_hundredths == 500 and rows[0].grade_hundredths == 170
    duplicate = GRADES.replace("</table>", GRADES[7:GRADES.index("</table>")] + "</table>")
    with pytest.raises(ValueError, match="doppelte"):
        parse_grade_rows(duplicate, SELECTORS)


def test_grade_sync_reads_only_grade_page_and_keeps_manual_modules(
    settings, factory, coordinator, monkeypatch,
):
    selectors = dict(SELECTORS)
    monkeypatch.setattr("app.portals.primuss.load_institution",
                        lambda _slug: SimpleNamespace(primuss=SimpleNamespace(
                            base_url=BASE, selectors=selectors, selector_alias_map=None)))
    stored = validate_session("primuss", BASE, BASE + "start?Session=fictional-secret",
                              {"cookies": [{"name": "portal", "value": "fictional",
                                            "domain": "portal.example.invalid", "path": "/"}],
                               "origins": []})
    monkeypatch.setattr("app.portals.primuss.load_session", lambda _portal, _base: stored)
    seen: list[httpx.Request] = []
    grade_html = [GRADES]

    def reply(request: httpx.Request) -> httpx.Response:
        seen.append(request)
        body = '<a class="grades" href="/grades">Noten</a>' if request.url.path == "/start" else grade_html[0]
        return httpx.Response(200, headers={"content-type": "text/html"}, text=body)

    monkeypatch.setattr("app.portals.primuss.PortalReadClient",
                        lambda base, session: PortalReadClient(
                            base, session, client=httpx.Client(transport=httpx.MockTransport(reply))))
    with factory() as db:
        db.add(AcademicModule(source="manual", source_key="manual-1", title="Manuelles Modul",
                              ects_hundredths=300, grade_hundredths=None, weight_hundredths=None,
                              status="open", revision=1))
        db.commit()
    app = create_app(settings, connectors=[], start_scheduler=False, coordinator=coordinator)
    with TestClient(app) as client:
        assert client.get("/api/primuss/status").json()["grades_sync_available"] is True
        first = client.post("/api/primuss/grades/sync")
        assert first.status_code == 200, first.text
        assert first.json()["created"] == 1
        assert first.headers["cache-control"] == "private, no-store"
        assert client.get("/api/grades").json()["overall"]["earned_ects"] == "5.00"
        second = client.post("/api/primuss/grades/sync")
        assert second.json()["unchanged"] == 1
        grade_html[0] = GRADES.replace("1,7", "2,0")
        third = client.post("/api/primuss/grades/sync")
        assert third.json()["updated"] == 1
        grade_html[0] = GRADES.replace("bestanden", "Bearbeitung läuft")
        fourth = client.post("/api/primuss/grades/sync")
        assert fourth.status_code == 502
    assert [request.method for request in seen] == ["GET"] * 8
    assert all(request.url.host == "portal.example.invalid" for request in seen)
    with factory() as db:
        modules = db.scalars(select(AcademicModule).order_by(AcademicModule.id)).all()
        assert len(modules) == 2
        assert modules[0].source == "manual" and modules[0].title == "Manuelles Modul"
        assert modules[1].source == "primuss" and modules[1].grade_hundredths == 200
        revisions = db.scalars(select(AcademicModuleRevision).where(
            AcademicModuleRevision.module_id == modules[1].id)).all()
        assert [revision.revision for revision in revisions] == [1, 2]

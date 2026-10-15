# SPDX-License-Identifier: AGPL-3.0-or-later

"""Only fake PRIMUSS pages: preview never persists or writes to the portal."""

from types import SimpleNamespace

import httpx
from fastapi.testclient import TestClient
from icalendar import Calendar
from sqlalchemy import select

from app.calendar.feed import build_calendar
from app.db.models import AcademicModule, Deadline, Exam, ExamRegistration
from app.main import create_app
from app.portals.primuss import parse_preview
from app.portals.read_client import PortalReadClient
from app.portals.session import validate_session

BASE = "https://portal.example.invalid/"
ENTRY = BASE + "start?Session=fictional-secret"
SELECTORS = {
    "exams_link": "a.exams", "exams": "tr.exam", "exam_title": ".title",
    "exam_date": "time.exam-date", "registration_status": ".registration",
    "registration_deadline": "time.deadline", "registered_text": "Angemeldet",
    "unregistered_text": "Nicht angemeldet", "grades_link": "a.grades",
    "grades": "tr.grade", "grade_title": ".title", "grade_value": ".value",
    "grade_ects": ".ects", "grade_status": ".status",
}
EXAMS = """<table><tr class="exam" id="exam-1"><td class="title">Fiktive Analysis</td>
<td><time class="exam-date" datetime="2027-02-01T09:00:00+01:00">1.2.</time></td>
<td class="registration">Angemeldet</td>
<td><time class="deadline" datetime="2027-01-15T23:59:00+01:00">15.1.</time></td></tr>
<tr class="exam" id="exam-2"><td class="title">Fiktive Statistik</td>
<td class="registration">Bearbeitung läuft</td>
<td><time class="deadline" datetime="2027-01-16T23:59:00+01:00">16.1.</time></td></tr></table>"""
GRADES = """<table><tr class="grade"><td class="title">Fiktive Informatik</td>
<td class="value">1,7</td><td class="ects">5</td><td class="status">bestanden</td>
</tr></table>"""


def test_parser_leaves_unknown_registration_and_date_unclear():
    result = parse_preview(EXAMS, GRADES, SELECTORS)
    assert result.exams[0].registration == "registered"
    assert result.exams[0].registration_deadline is not None
    assert result.exams[1].registration == "unclear"
    assert result.exams[1].exam_at is None
    assert result.grades[0].value == "1,7"
    assert any("Termin unklar" in warning for warning in result.warnings)


def test_preview_requires_configuration_then_uses_only_get_and_saves_nothing(
    settings, factory, coordinator, monkeypatch,
):
    selectors = dict(SELECTORS)
    map_id = [None]
    selectors["exams"] = None
    monkeypatch.setattr("app.portals.primuss.load_institution",
                        lambda _slug: SimpleNamespace(primuss=SimpleNamespace(
                            base_url=BASE, selectors=selectors, selector_alias_map=map_id[0])))
    monkeypatch.setattr("app.portals.primuss.load_session", lambda _portal, _base: None)
    app = create_app(settings, connectors=[], start_scheduler=False, coordinator=coordinator)
    with TestClient(app) as client:
        response = client.post("/api/primuss/preview")
        assert response.status_code == 409
        assert response.headers["cache-control"] == "private, no-store"
        assert client.get("/api/primuss/status").json()["configured"] is False

        selectors["exams"] = SELECTORS["exams"]
        state = {"cookies": [{"name": "portal", "value": "fictional", "domain": "portal.example.invalid", "path": "/"}],
                 "origins": []}
        stored = validate_session("primuss", BASE, ENTRY, state)
        monkeypatch.setattr("app.portals.primuss.load_session", lambda _portal, _base: stored)
        seen: list[httpx.Request] = []
        exam_html = [EXAMS]

        def reply(request: httpx.Request) -> httpx.Response:
            seen.append(request)
            body = ({"/start": '<a class="exams" href="/exams">Prüfungen</a><a class="grades" href="/grades">Noten</a>',
                     "/exams": exam_html[0], "/grades": GRADES})[request.url.path]
            return httpx.Response(200, headers={"content-type": "text/html"}, text=body)

        def reader(base_url, session):
            return PortalReadClient(base_url, session, client=httpx.Client(transport=httpx.MockTransport(reply)))

        monkeypatch.setattr("app.portals.primuss.PortalReadClient", reader)
        png = b"\x89PNG\r\n\x1a\nfictional-picture"
        monkeypatch.setattr("app.portals.primuss.capture_portal_proof",
                            lambda _base, _address, _stored: (png, exam_html[0]))
        preview = client.post("/api/primuss/preview")
        assert preview.status_code == 200, preview.text
        assert preview.json()["saved"] is False
        proof_id = preview.json()["proof_id"]
        assert proof_id and "fictional-secret" not in proof_id
        proof = client.get(f"/api/primuss/proofs/{proof_id}")
        assert proof.status_code == 200 and proof.content == png
        assert proof.headers["cache-control"] == "private, no-store"
        assert client.get("/api/primuss/proofs/../not-a-proof").status_code != 200
        assert preview.json()["exams"][1]["registration"] == "unclear"
        assert [request.method for request in seen] == ["GET", "GET", "GET"]
        assert all(request.url.host == "portal.example.invalid" for request in seen)
        map_id[0] = "0123456789abcdef"
        selectors["exams_link"] = "a.anon-c1"
        monkeypatch.setattr("app.portals.primuss.load_alias_map",
                            lambda _portal, _identifier: {"anon-c1": "exams"})
        assert client.get("/api/primuss/status").json()["alias_map_available"] is True
        assert client.post("/api/primuss/preview").status_code == 200
        assert len(seen) == 6
        selectors["exam_key_attr"] = "id"
        assert client.get("/api/primuss/status").json()["sync_available"] is True
        refreshed = client.post("/api/primuss/recheck")
        assert refreshed.status_code == 200, refreshed.text
        assert refreshed.json()["saved"] is True
        saved = client.get("/api/primuss/exams").json()
        assert len(saved) == 2
        assert {row["registration"] for row in saved} == {"registered", "unclear"}
        assert client.post("/api/primuss/recheck").status_code == 200
        with factory() as db:
            assert "Prüfungsanmeldung: Fiktive Statistik" in [
                str(item.get("summary")) for item in Calendar.from_ical(build_calendar(db)).walk("VEVENT")]
        exam_html[0] = EXAMS.replace("Bearbeitung läuft", "Angemeldet")
        assert client.post("/api/primuss/recheck").status_code == 200
        monkeypatch.setattr("app.portals.primuss.capture_portal_proof",
                            lambda _base, _address, _stored: (
                                png, exam_html[0].replace("Angemeldet", "Nicht angemeldet")))
        mismatch = client.post("/api/primuss/recheck")
        assert mismatch.status_code == 502
        assert "stimmen nicht" in mismatch.json()["detail"]
    with factory() as db:
        assert len(db.scalars(select(Exam)).all()) == 2
        assert len(db.scalars(select(ExamRegistration)).all()) == 6
        deadlines = db.scalars(select(Deadline).where(Deadline.source == "primuss-registration")).all()
        assert len(deadlines) == 1 and deadlines[0].title == "Prüfungsanmeldung: Fiktive Statistik"
        assert deadlines[0].url is None
        assert deadlines[0].removed_upstream is True
        calendar = Calendar.from_ical(build_calendar(db))
        assert "Prüfungsanmeldung: Fiktive Statistik" not in [str(item.get("summary")) for item in calendar.walk("VEVENT")]
        assert db.scalars(select(AcademicModule)).all() == []

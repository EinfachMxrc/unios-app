# SPDX-License-Identifier: AGPL-3.0-or-later

import copy
import os
from datetime import UTC, datetime
from importlib.metadata import version

import httpx
import pytest
from fastapi.testclient import TestClient
from sqlalchemy import func, select, text

from app.connectors.base import RemoteResource
from app.connectors.moodle.client import MoodleClient, MoodleError
from app.db.models import (
    Announcement,
    Assignment,
    CalendarEvent,
    Change,
    ConnectorHealth,
    Deadline,
    Note,
    Resource,
    ResourceVersion,
)
from app.extract.search import search_announcements
from app.files import atomic
from app.main import create_app
from app.notes.store import read_note
from app.notify.service import Notifier
from app.sync.engine import SyncEngine
from tests.conftest import read_fixture
from tests.sample_files import sample_files


class FixtureMoodle:
    def __init__(self, settings):
        self.responses = {
            "core_webservice_get_site_info": read_fixture("site_info.json"),
            "core_enrol_get_users_courses": read_fixture("courses.json"),
            "mod_assign_get_assignments": read_fixture("assignments.json"),
            "mod_forum_get_forum_discussions": read_fixture("discussions.json"),
            "core_calendar_get_action_events_by_timesort": read_fixture("events.json"),
            "mod_url_get_urls_by_courses": read_fixture("urls.json"),
            "core_group_get_course_user_groups": {"groups": []},
            "core_course_get_updates_since": {"instances": [], "warnings": []},
        }
        self.contents = {
            101: read_fixture("contents_101.json"),
            202: read_fixture("contents_202.json"),
        }
        self.files = {
            "/webservice/pluginfile.php/10/04_Schleifen.pdf": b"%PDF-fixture-1",
            "/webservice/pluginfile.php/20/Blatt_01.pptx": b"PPTX-fixture-1",
        }
        self.download_count = 0
        self.download_responses: dict[str, httpx.Response] = {}
        self.calls = []
        self.site_info_called_at = None

        def request(function, parameters):
            self.calls.append((function, copy.deepcopy(parameters)))
            if function == "core_webservice_get_site_info":
                self.site_info_called_at = datetime.now(UTC)
            if function == "core_course_get_contents":
                return copy.deepcopy(self.contents[int(parameters["courseid"])])
            return copy.deepcopy(self.responses[function])

        def download(request):
            self.download_count += 1
            if request.url.path in self.download_responses:
                return self.download_responses[request.url.path]
            return httpx.Response(200, content=self.files[request.url.path], headers={"content-type": "application/octet-stream"})

        self.connector = MoodleClient(settings, client=httpx.Client(transport=httpx.MockTransport(download)), request=request)


def test_quizzes_are_imported_as_links_without_starting_attempts(settings, factory, coordinator):
    moodle = FixtureMoodle(settings)
    moodle.contents[101][0]["modules"].extend([
        {"id": 991, "instance": 71, "modname": "quiz", "name": "Invented practice test",
         "url": "https://moodle.example.invalid/mod/quiz/view.php?id=991&wstoken=invented-secret", "contents": []},
        {"id": 992, "modname": "quiz", "name": "Invented hidden test", "uservisible": False,
         "url": "https://moodle.example.invalid/mod/quiz/view.php?id=992", "contents": []},
        {"id": 993, "modname": "quiz", "name": "Invented unsafe test", "url": "javascript:alert(1)", "contents": []},
    ])
    engine = SyncEngine(factory, settings, [moodle.connector], Notifier(settings, coordinator), coordinator)
    engine.run()
    engine.run()
    with factory() as session:
        quizzes = session.scalars(select(Resource).where(Resource.source_key.like("%:quiz"))).all()
        assert len(quizzes) == 1
        quiz = quizzes[0]
        assert quiz.kind == "link" and quiz.name == "Invented practice test"
        assert quiz.url == "https://moodle.example.invalid/mod/quiz/view.php?id=991"
        assert session.scalar(select(func.count()).select_from(ResourceVersion).where(ResourceVersion.resource_id == quiz.id)) == 0
    assert not [function for function, _parameters in moodle.calls if "attempt" in function]


def test_sync_scaffolds_one_versioned_note_for_a_named_lecture(settings, factory, coordinator):
    with factory() as session:
        session.execute(text("CREATE VIRTUAL TABLE notes_fts USING fts5(note_id UNINDEXED, title, body)"))
        session.commit()
    moodle = FixtureMoodle(settings)
    moodle.contents[101][0]["modules"][0]["contents"][0]["filename"] = "VL_04_Schleifen.pdf"
    moodle.contents[101][0]["modules"][0]["name"] = "VL 04 Schleifen"
    engine = SyncEngine(factory, settings, [moodle.connector], Notifier(settings, coordinator), coordinator)
    assert engine.run().status == "success"
    with factory() as session:
        note = session.scalar(select(Note).where(Note.title == "VL 04 Schleifen"))
        assert note is not None and note.resource_id is not None
        _, _, body, _ = read_note(session, settings, note.id)
        assert "## Kernkonzepte" in body
    assert engine.run().status == "success"
    with factory() as session:
        assert session.scalar(select(func.count()).select_from(Note)) == 1


def test_forum_text_is_plain_and_searchable(settings, factory, coordinator):
    moodle = FixtureMoodle(settings)
    moodle.responses["mod_forum_get_forum_discussions"]["discussions"][0]["message"] = (
        "Der Taschenrechner ist in der Klausur erlaubt.<script>secret()</script>")
    engine = SyncEngine(factory, settings, [moodle.connector], Notifier(settings, coordinator), coordinator)
    assert engine.run().status == "success"
    with factory() as session:
        hits = search_announcements(session, "Wo sagt der Professor dass der Taschenrechner in der Klausur erlaubt ist?")
        assert hits and hits[0]["title"] == "Willkommen"
        assert "Taschenrechner" in hits[0]["excerpt"]
        assert "secret" not in hits[0]["excerpt"]


def test_pinned_moodle_dl_transport_still_constructs(settings):
    # The client uses moodle-dl internals; catch an incompatible dependency update in CI.
    assert version("moodle-dl") == "2.3.13"
    client = MoodleClient(settings)
    try:
        assert callable(client._request)
    finally:
        client.client.close()


def test_moodle_connector_exposes_auth_courses_changes_and_health(settings):
    moodle = FixtureMoodle(settings)
    auth = moodle.connector.check_auth()
    assert auth.account_id == "42"
    assert "core_course_get_contents" in auth.capabilities
    assert auth.warnings == ()
    assert {course.name for course in moodle.connector.list_courses()} == {"Programmieren 1", "Mathematik"}
    assert moodle.connector.health().status == "ok"
    snapshot = moodle.connector.fetch_changes()
    assert len(snapshot.courses) == 2
    assert any(course.resources for course in snapshot.courses)
    assert [parameters["limitnum"] for name, parameters in moodle.calls
            if name == "core_calendar_get_action_events_by_timesort"] == [50]

    moodle.responses["core_webservice_get_site_info"] = {
        "exception": "moodle_exception", "errorcode": "invalidtoken", "message": "Invalid token",
    }
    status = moodle.connector.health()
    assert status.status == "error"
    assert status.message == "Moodle-Token erneuern"


def test_moodle_calendar_fetches_more_than_one_page_without_duplicates(settings):
    moodle = FixtureMoodle(settings)
    original_request = moodle.connector._request
    calendar_calls = []

    def paged_request(function, parameters):
        if function != "core_calendar_get_action_events_by_timesort":
            return original_request(function, parameters)
        calendar_calls.append(parameters.copy())
        after = parameters.get("aftereventid", 0)
        items = [{"id": event_id, "name": f"Termin {event_id}", "timesort": 2_000_000_000 + event_id}
                 for event_id in range(after + 1, min(after + 51, 52))]
        return {"events": items, "lastid": items[-1]["id"] if items else None}

    moodle.connector._request = paged_request
    snapshot = moodle.connector.fetch_changes()

    assert len(snapshot.events) == 51
    assert len({event.key for event in snapshot.events}) == 51
    assert [call.get("aftereventid") for call in calendar_calls] == [None, 50]
    assert all(call["limitnum"] == 50 for call in calendar_calls)
    assert snapshot.warnings == []


def test_moodle_calendar_warns_when_a_page_cursor_repeats(settings):
    moodle = FixtureMoodle(settings)
    original_request = moodle.connector._request

    def repeated_request(function, parameters):
        if function == "core_calendar_get_action_events_by_timesort":
            return {"events": [{"id": event_id, "timesort": 2_000_000_000 + event_id}
                               for event_id in range(1, 51)], "lastid": 50}
        return original_request(function, parameters)

    moodle.connector._request = repeated_request
    snapshot = moodle.connector.fetch_changes()

    assert len(snapshot.events) == 50
    assert "Moodle-Kalender unvollständig: Seitencursor wiederholt" in snapshot.warnings


@pytest.mark.parametrize("mime_type", ["application/json; charset=utf-8", "application/octet-stream"])
def test_file_download_rejects_moodle_json_errors_without_storing_them(settings, factory, coordinator, mime_type):
    moodle = FixtureMoodle(settings)
    source = "/webservice/pluginfile.php/10/04_Schleifen.pdf"
    error = b'{"exception":"moodle_exception","errorcode":"invalidtoken","message":"Invalid token"}'
    moodle.download_responses[source] = httpx.Response(
        200, content=error, headers={"content-type": mime_type},
    )
    moodle.contents[101][0]["modules"][0]["contents"][0]["filesize"] = len(error)
    engine = SyncEngine(factory, settings, [moodle.connector], Notifier(settings, coordinator), coordinator)
    result = engine.run()
    assert result.status == "error"
    with factory() as session:
        assert session.scalar(select(func.count()).select_from(ResourceVersion)) == 0
        health = session.scalar(select(ConnectorHealth).where(ConnectorHealth.connector == "moodle"))
        assert health.status == "error"
        assert health.message == "Moodle-Token erneuern"


def test_legitimate_json_file_is_downloaded(settings):
    moodle = FixtureMoodle(settings)
    source = "/webservice/pluginfile.php/40/data.json"
    body = b'{"exception":"not an error"}'
    moodle.download_responses[source] = httpx.Response(
        200, content=body, headers={"content-type": "application/json"},
    )
    resource = RemoteResource("json-file", "data.json", f"https://moodle.example.invalid{source}", "file")
    assert moodle.connector.download(resource) == body


@pytest.mark.parametrize("module_type", ["page", "resource"])
def test_generated_moodle_page_zero_size_is_unknown_only_for_pages(settings, module_type):
    moodle = FixtureMoodle(settings)
    source = "/webservice/pluginfile.php/10/mod_page/content/index.html"
    body = b"<html><body>Fictional course introduction</body></html>"
    module = moodle.contents[101][0]["modules"][0]
    module["modname"] = module_type
    module["name"] = "Course introduction"
    module["contents"][0].update(
        filename="index.html", fileurl=f"https://moodle.example.invalid{source}", filesize=0,
    )
    moodle.download_responses[source] = httpx.Response(
        200, content=body, headers={"content-type": "text/html"},
    )
    snapshot = moodle.connector.fetch_changes()
    course = next(course for course in snapshot.courses if course.key == "101")
    resource = next(resource for resource in course.resources if resource.filename == "index.html")
    assert resource.name == "Course introduction"
    if module_type == "page":
        assert resource.size is None
        assert moodle.connector.download(resource) == body
    else:
        assert resource.size == 0
        with pytest.raises(MoodleError, match="Downloadgröße"):
            moodle.connector.download(resource)


def test_file_download_keeps_token_after_same_origin_redirect(settings):
    moodle = FixtureMoodle(settings)
    source = "/webservice/pluginfile.php/40/start.pdf"
    target = "/webservice/pluginfile.php/40/redirected.pdf"
    body = b"%PDF-redirected-fixture"
    seen = []

    def respond(request):
        seen.append(request)
        if request.url.path == source:
            return httpx.Response(302, headers={"location": target})
        assert request.url.path == target
        return httpx.Response(200, content=body)

    moodle.connector.client = httpx.Client(transport=httpx.MockTransport(respond), follow_redirects=False)
    resource = RemoteResource("redirect-file", "redirected.pdf",
                              f"https://moodle.example.invalid{source}", "file")
    assert moodle.connector.download(resource) == body
    assert [request.url.path for request in seen] == [source, target]
    assert all(request.url.params.get("token") == settings.moodle_token for request in seen)


def test_file_download_rejects_cross_origin_redirect_before_sending_token(settings):
    moodle = FixtureMoodle(settings)
    source = "/webservice/pluginfile.php/40/start.pdf"
    seen = []

    def redirect(request):
        seen.append(request.url)
        return httpx.Response(302, headers={"location": "https://files.example.invalid/redirected.pdf"})

    moodle.connector.client = httpx.Client(transport=httpx.MockTransport(redirect), follow_redirects=False)
    resource = RemoteResource("redirect-file", "redirected.pdf",
                              f"https://moodle.example.invalid{source}", "file")
    with pytest.raises(MoodleError, match="verlässt die Moodle-Domain"):
        moodle.connector.download(resource)
    assert len(seen) == 1
    assert seen[0].host == "moodle.example.invalid"


def test_sync_is_incremental_and_preserves_versions(settings, factory, coordinator):
    moodle = FixtureMoodle(settings)
    engine = SyncEngine(factory, settings, [moodle.connector], Notifier(settings, coordinator), coordinator)
    first = engine.run()
    assert first.status == "success"
    assert first.course_count == 2
    assert moodle.download_count == 2
    with factory() as session:
        assert session.scalar(select(func.count()).select_from(Resource)) == 3  # zwei Dateien, ein Link
        assert session.scalar(select(func.count()).select_from(ResourceVersion)) == 2
    second = engine.run()
    assert second.status == "success"
    assert moodle.download_count == 2
    with factory() as session:
        assert session.scalar(select(func.count()).select_from(ResourceVersion)) == 2

    moodle.contents[101][0]["modules"][0]["contents"][0]["timemodified"] += 1
    moodle.files["/webservice/pluginfile.php/10/04_Schleifen.pdf"] = b"%PDF-fixture-2"
    third = engine.run()
    assert third.status == "success"
    assert moodle.download_count == 3
    with factory() as session:
        item = session.scalar(select(Resource).where(Resource.name == "04_Schleifen.pdf"))
        versions = session.scalars(select(ResourceVersion).where(ResourceVersion.resource_id == item.id).order_by(ResourceVersion.version)).all()
        assert [version.version for version in versions] == [1, 2]
        assert versions[0].sha256 != versions[1].sha256
        assert all((settings.data_dir / version.relative_path).exists() for version in versions)

    moodle.contents[101][0]["modules"][0]["contents"] = []
    fourth = engine.run()
    assert fourth.status == "success"
    with factory() as session:
        item = session.scalar(select(Resource).where(Resource.name == "04_Schleifen.pdf"))
        assert item.removed_upstream is True
        assert all((settings.data_dir / version.relative_path).exists() for version in versions)


def test_moodle_downloads_every_sample_file_type_without_repeating(settings, factory, coordinator):
    moodle = FixtureMoodle(settings)
    samples = sample_files()
    modules = moodle.contents[101][0]["modules"]
    for offset, (filename, data) in enumerate(samples.items(), start=600):
        source = f"/webservice/pluginfile.php/60/{filename}"
        moodle.files[source] = data
        modules.append({
            "id": offset, "modname": "resource", "name": filename,
            "contents": [{"type": "file", "filename": filename,
                          "fileurl": f"https://moodle.example.invalid{source}",
                          "timemodified": 1727000000, "filesize": len(data)}],
        })

    engine = SyncEngine(factory, settings, [moodle.connector], Notifier(settings, coordinator), coordinator)
    assert engine.run().status == "success"
    assert moodle.download_count == len(samples) + 2
    with factory() as session:
        versions = session.execute(
            select(Resource.name, ResourceVersion).join(ResourceVersion, ResourceVersion.resource_id == Resource.id)
            .where(Resource.name.in_(samples))
        ).all()
        assert len(versions) == len(samples)
        for filename, version in versions:
            assert (settings.data_dir / version.relative_path).read_bytes() == samples[filename]
            assert version.size == len(samples[filename])
            assert (settings.data_dir / f"{version.relative_path}.unios.json").is_file()

    assert engine.run().status == "success"
    assert moodle.download_count == len(samples) + 2


def test_moodle_update_hint_rechecks_file_when_metadata_is_unchanged(settings, factory, coordinator):
    moodle = FixtureMoodle(settings)
    engine = SyncEngine(factory, settings, [moodle.connector], Notifier(settings, coordinator), coordinator)
    assert engine.run().status == "success"
    assert moodle.download_count == 2
    assert not [call for call in moodle.calls if call[0] == "core_course_get_updates_since"]
    with factory() as session:
        watermark = session.scalar(select(ConnectorHealth.last_success_at)
                                   .where(ConnectorHealth.connector == "moodle"))
    if watermark.tzinfo is None:
        watermark = watermark.replace(tzinfo=UTC)
    assert watermark <= moodle.site_info_called_at

    # Moodle can report a changed file area even when file size and timemodified stay equal.
    moodle.files["/webservice/pluginfile.php/10/04_Schleifen.pdf"] = b"%PDF-fixture-2"
    moodle.responses["core_course_get_updates_since"] = {
        "instances": [{"contextlevel": "module", "id": 501,
                       "updates": [{"name": "fileareas", "timeupdated": 1727000001}]}],
        "warnings": [],
    }
    assert engine.run().status == "success"
    update_calls = [parameters for name, parameters in moodle.calls if name == "core_course_get_updates_since"]
    assert {parameters["courseid"] for parameters in update_calls} == {101, 202}
    assert all(parameters["since"] == int(watermark.timestamp()) - 1 for parameters in update_calls)
    assert moodle.download_count == 3
    with factory() as session:
        file = session.scalar(select(Resource).where(Resource.name == "04_Schleifen.pdf"))
        versions = session.scalars(select(ResourceVersion).where(ResourceVersion.resource_id == file.id)
                                   .order_by(ResourceVersion.version)).all()
        assert [item.version for item in versions] == [1, 2]
        assert versions[0].sha256 != versions[1].sha256

    moodle.responses["core_course_get_updates_since"] = {"instances": [], "warnings": []}
    assert engine.run().status == "success"
    assert moodle.download_count == 3


def test_moodle_update_hint_is_optional(settings, factory, coordinator):
    moodle = FixtureMoodle(settings)
    site = moodle.responses["core_webservice_get_site_info"]
    site["functions"] = [item for item in site["functions"]
                         if item["name"] != "core_course_get_updates_since"]
    engine = SyncEngine(factory, settings, [moodle.connector], Notifier(settings, coordinator), coordinator)
    assert engine.run().status == "warning"
    assert engine.run().status == "warning"
    assert moodle.download_count == 2
    assert not [call for call in moodle.calls if call[0] == "core_course_get_updates_since"]


def test_change_check_targets_files_instead_of_unsupported_course_activities(settings, factory, coordinator):
    moodle = FixtureMoodle(settings)
    moodle.responses["core_webservice_get_site_info"]["functions"].append({"name": "core_course_check_updates"})
    moodle.responses["core_course_check_updates"] = {"instances": [], "warnings": []}
    moodle.responses["core_course_get_updates_since"] = {
        "instances": [], "warnings": [{"item": "module", "itemid": 502, "warningcode": "missingcallback"}],
    }
    moodle.contents[101][0]["modules"].append({
        "id": 999, "modname": "resource", "uservisible": False,
        "contents": [{"type": "file", "fileurl": "https://moodle.example.invalid/hidden.pdf"}],
    })
    engine = SyncEngine(factory, settings, [moodle.connector], Notifier(settings, coordinator), coordinator)
    assert engine.run().status == "success"
    assert engine.run().status == "success"
    checks = [parameters for name, parameters in moodle.calls if name == "core_course_check_updates"]
    assert {item["tocheck[0][id]"] for item in checks} == {501, 504}
    assert all(item["tocheck[0][contextlevel]"] == "module" and item["filter[0]"] == "fileareas"
               for item in checks)
    assert not [call for call in moodle.calls if call[0] == "core_course_get_updates_since"]
    assert moodle.download_count == 2

    moodle.files["/webservice/pluginfile.php/10/04_Schleifen.pdf"] = b"%PDF-fixture-2"
    moodle.responses["core_course_check_updates"]["instances"] = [
        {"contextlevel": "module", "id": 501, "updates": [{"name": "fileareas"}]},
    ]
    assert engine.run().status == "success"
    assert moodle.download_count == 3
    with factory() as session:
        resource = session.scalar(select(Resource).where(Resource.name == "04_Schleifen.pdf"))
        assert session.scalar(select(func.count()).select_from(ResourceVersion)
                              .where(ResourceVersion.resource_id == resource.id)) == 2


def test_selective_change_check_remains_warning_for_relevant_file_errors(settings, factory, coordinator):
    moodle = FixtureMoodle(settings)
    site = moodle.responses["core_webservice_get_site_info"]
    site["functions"] = [item for item in site["functions"] if item["name"] != "core_course_get_updates_since"]
    site["functions"].append({"name": "core_course_check_updates"})
    moodle.responses["core_course_check_updates"] = {
        "instances": [], "warnings": [{"item": "module", "itemid": 501, "warningcode": "missingcallback"}],
    }
    engine = SyncEngine(factory, settings, [moodle.connector], Notifier(settings, coordinator), coordinator)
    assert engine.run().status == "success"
    assert engine.run().status == "warning"
    assert moodle.download_count == 2


def test_large_selective_change_checks_cover_every_file_module_in_bounded_requests(settings):
    moodle = FixtureMoodle(settings)
    moodle.responses["core_webservice_get_site_info"]["functions"].append({"name": "core_course_check_updates"})
    moodle.responses["core_course_check_updates"] = {"instances": [], "warnings": []}
    moodle.connector.check_auth()
    modules = [{"id": index, "contents": [{"type": "file", "fileurl": f"https://moodle.example.invalid/{index}.pdf"}]}
               for index in range(1, 351)]
    assert moodle.connector._changed_file_modules(101, 1727000000, [{"modules": modules}]) == set()
    checks = [params for name, params in moodle.calls if name == "core_course_check_updates"]
    assert len(checks) > 1 and all(len(params) <= 302 for params in checks)
    assert {value for params in checks for key, value in params.items() if key.endswith("[id]")} == set(range(1, 351))


def test_interrupted_publication_never_exposes_partial_file_and_retry_succeeds(
    monkeypatch, settings, factory, coordinator,
):
    moodle = FixtureMoodle(settings)
    engine = SyncEngine(factory, settings, [moodle.connector], Notifier(settings, coordinator), coordinator)

    def fail_link(_source, _target):
        raise OSError("simulierter Abbruch")

    with monkeypatch.context() as patch:
        patch.setattr(atomic.os, "link", fail_link)
        failed = engine.run()
    assert failed.status == "warning"  # the files were skipped, the courses were still imported
    assert not [path for path in (settings.data_dir / "uni").rglob("*") if path.is_file()]
    with factory() as session:
        assert session.scalar(select(func.count()).select_from(ResourceVersion)) == 0

    retried = engine.run()
    assert retried.status == "success"
    with factory() as session:
        versions = session.scalars(select(ResourceVersion)).all()
        assert len(versions) == 2
        assert all((settings.data_dir / version.relative_path).read_bytes() for version in versions)
    assert not list((settings.data_dir / "uni").rglob("*.tmp"))


def test_interrupted_sidecar_publication_keeps_complete_file_for_retry(
    monkeypatch, settings, factory, coordinator,
):
    moodle = FixtureMoodle(settings)
    engine = SyncEngine(factory, settings, [moodle.connector], Notifier(settings, coordinator), coordinator)
    real_link = os.link
    calls = 0

    def fail_second_link(source, target):
        nonlocal calls
        calls += 1
        if calls == 2:
            raise OSError("simulierter Sidecar-Abbruch")
        return real_link(source, target)

    with monkeypatch.context() as patch:
        patch.setattr(atomic.os, "link", fail_second_link)
        failed = engine.run()
    assert failed.status == "warning"
    documents = [path for path in (settings.data_dir / "uni").rglob("*.pdf") if path.is_file()]
    assert len(documents) == 1  # the interrupted file is complete, only its sidecar is missing
    assert documents[0].read_bytes() == b"%PDF-fixture-1"
    assert not list((settings.data_dir / "uni").rglob("*.tmp"))

    retried = engine.run()
    assert retried.status == "success"
    with factory() as session:
        assert session.scalar(select(func.count()).select_from(ResourceVersion)) == 2
    assert len(list((settings.data_dir / "uni").rglob("*.unios.json"))) == 2


def test_bad_connector_is_visible_and_does_not_block_good_one(settings, factory, coordinator):
    class Broken:
        name = "broken"
        def fetch_changes(self, since=None):
            raise RuntimeError("Parser kaputt")

    moodle = FixtureMoodle(settings)
    result = SyncEngine(factory, settings, [Broken(), moodle.connector], Notifier(settings, coordinator), coordinator).run()
    assert result.status == "error"
    assert result.course_count == 2
    with factory() as session:
        warning = session.scalar(select(ConnectorHealth).where(ConnectorHealth.connector == "broken"))
        assert warning.status == "error"
    app = create_app(settings, connectors=[Broken()], start_scheduler=False, coordinator=coordinator)
    with TestClient(app) as client:
        page = client.get("/api/system")
        assert page.status_code == 200
        assert "Parser kaputt" in page.text


def test_zero_courses_is_a_warning_and_does_not_mark_files_removed(settings, factory, coordinator):
    moodle = FixtureMoodle(settings)
    engine = SyncEngine(factory, settings, [moodle.connector], Notifier(settings, coordinator), coordinator)
    engine.run()
    moodle.responses["core_enrol_get_users_courses"] = []
    result = engine.run()
    assert result.status == "warning"
    with factory() as session:
        assert session.scalar(select(func.count()).select_from(Resource).where(Resource.removed_upstream.is_(True))) == 0


def test_zero_resources_is_a_warning_and_keeps_existing_files(settings, factory, coordinator):
    moodle = FixtureMoodle(settings)
    engine = SyncEngine(factory, settings, [moodle.connector], Notifier(settings, coordinator), coordinator)
    engine.run()
    for contents in moodle.contents.values():
        for section in contents:
            section["modules"] = []
    result = engine.run()
    assert result.status == "warning"
    with factory() as session:
        assert session.scalar(select(func.count()).select_from(Resource).where(Resource.removed_upstream.is_(True))) == 0


def test_removed_assignment_no_longer_raises_deadline(settings, factory, coordinator):
    moodle = FixtureMoodle(settings)
    engine = SyncEngine(factory, settings, [moodle.connector], Notifier(settings, coordinator), coordinator)
    engine.run()
    moodle.responses["mod_assign_get_assignments"]["courses"][0]["assignments"] = []
    engine.run()
    with factory() as session:
        assignment = session.scalar(select(Assignment))
        assert assignment.removed_upstream is True
        assert session.scalar(select(Deadline)).removed_upstream is True
        removed = session.scalar(select(Change).where(Change.kind == "removed_upstream", Change.assignment_id == assignment.id))
        assert removed is not None
    app = create_app(settings, connectors=[moodle.connector], start_scheduler=False, coordinator=coordinator)
    with TestClient(app) as client:
        course = client.get("/api/courses/1").json()
        assert course["assignments"][0]["removed_upstream"] is True
        activity = client.get("/api/activity").json()
        assert any(item["assignment_id"] == assignment.id and item["kind"] == "removed_upstream"
                   for item in activity["changes"])

    moodle.responses["mod_assign_get_assignments"]["courses"][0]["assignments"] = [
        read_fixture("assignments.json")["courses"][0]["assignments"][0]
    ]
    engine.run()
    with factory() as session:
        restored = session.scalar(select(Change).where(Change.kind == "restored", Change.assignment_id == assignment.id))
        assert restored is not None
        assert session.get(Assignment, assignment.id).removed_upstream is False


def test_api_shows_synced_courses_and_files_without_legacy_html(settings, factory, coordinator):
    moodle = FixtureMoodle(settings)
    SyncEngine(factory, settings, [moodle.connector], Notifier(settings, coordinator), coordinator).run()
    app = create_app(settings, connectors=[moodle.connector], start_scheduler=False, coordinator=coordinator)
    with TestClient(app) as client:
        for path in ("/api/overview", "/api/courses", "/api/courses/1", "/api/deadlines", "/api/activity", "/api/system"):
            response = client.get(path)
            assert response.status_code == 200, path
        assert "Programmieren 1" in client.get("/api/courses").text
        assert "04_Schleifen.pdf" in client.get("/api/courses/1").text
        for path in ("/", "/courses", "/courses/1", "/deadlines", "/activity", "/system", "/static/style.css"):
            assert client.get(path).status_code == 404, path
        file_response = client.get("/files/1")
        assert file_response.status_code == 200
        assert file_response.content == b"%PDF-fixture-1"
        assert client.post("/api/sync", headers={"Origin": "https://foreign.example"}).status_code == 403


def test_moodle_links_are_cleaned_before_storage_and_unsafe_urls_are_hidden(settings, factory, coordinator):
    moodle = FixtureMoodle(settings)
    moodle.responses["mod_assign_get_assignments"]["courses"][0]["assignments"][0]["url"] = (
        "https://moodle.example.invalid/mod/assign/view.php?id=701&token=fixture-secret&sesskey=abc"
    )
    moodle.responses["mod_forum_get_forum_discussions"]["discussions"][0]["url"] = "javascript:alert(1)"
    moodle.responses["core_calendar_get_action_events_by_timesort"]["events"][0]["url"] = (
        "https://moodle.example.invalid/calendar/view.php?id=901&wstoken=fixture-secret#private"
    )
    assert SyncEngine(factory, settings, [moodle.connector], Notifier(settings, coordinator), coordinator).run().status == "success"
    with factory() as session:
        assignment = session.scalar(select(Assignment))
        announcement = session.scalar(select(Announcement))
        event = session.scalar(select(CalendarEvent))
        deadline = session.scalar(select(Deadline))
        assert assignment.url == "https://moodle.example.invalid/mod/assign/view.php?id=701"
        assert deadline.url == assignment.url
        assert announcement.url is None
        assert event.url == "https://moodle.example.invalid/calendar/view.php?id=901"

        # Old database rows still pass through the same guard when rendered.
        assignment.url = "javascript:alert(1)"
        deadline.url = "https://moodle.example.invalid/mod/assign/view.php?id=701&token=old-secret"
        event.url = "https://moodle.example.invalid/calendar/view.php?id=901&wstoken=old-secret"
        link = session.scalar(select(Resource).where(Resource.kind == "link"))
        link.url = "javascript:alert(1)"
        session.commit()

    app = create_app(settings, connectors=[moodle.connector], start_scheduler=False, coordinator=coordinator)
    with TestClient(app) as client:
        detail = client.get("/api/courses/1")
        assert detail.status_code == 200
        assert detail.json()["assignments"][0]["url"] is None
        assert next(item for item in detail.json()["resources"] if item["kind"] == "link")["url"] == ""
        assert client.get("/api/deadlines").json()["events"][0]["url"] == (
            "https://moodle.example.invalid/calendar/view.php?id=901"
        )
        calendar = client.get("/calendar.ics").text
        assert "old-secret" not in calendar
        assert "javascript:" not in detail.text


def test_dashboard_write_origin_is_limited_to_local_preview(settings, coordinator):
    app = create_app(settings, connectors=[], start_scheduler=False, coordinator=coordinator)
    with TestClient(app, client=("127.0.0.1", 50000)) as client:
        assert client.post("/api/sync", headers={"Origin": "http://127.0.0.1:5173"}).status_code != 403
        assert client.post("/api/sync", headers={"Origin": "http://127.0.0.1:4173"}).status_code != 403
        assert client.post("/api/sync", headers={"Origin": "http://127.0.0.1:5173", "Sec-Fetch-Site": "cross-site"}).status_code == 403
        assert client.post("/api/sync", headers={"Origin": "https://foreign.example"}).status_code == 403
    with TestClient(app, client=("192.0.2.1", 50000)) as remote_client:
        assert remote_client.post("/api/sync", headers={"Origin": "http://127.0.0.1:5173"}).status_code == 403


def test_material_title_keeps_filename_and_renames_without_new_version(settings, factory, coordinator):
    moodle = FixtureMoodle(settings)
    module = moodle.contents[101][0]["modules"][0]
    module["name"] = "Prüfungsordnung &amp; Studienablauf"
    snapshot = moodle.connector.fetch_changes()
    remote = snapshot.courses[0].resources[0]
    assert remote.name == "Prüfungsordnung & Studienablauf"
    assert remote.filename == "04_Schleifen.pdf"
    engine = SyncEngine(factory, settings, [moodle.connector], Notifier(settings, coordinator), coordinator)
    assert engine.run().status == "success"
    downloads = moodle.download_count
    with factory() as session:
        resource = session.scalar(select(Resource).where(Resource.name == remote.name))
        assert resource is not None
        resource_id = resource.id
        stored = session.scalar(select(ResourceVersion).where(ResourceVersion.resource_id == resource_id))
        assert stored is not None and stored.relative_path.endswith(".pdf")
        assert "04_Schleifen" in stored.relative_path
        path = stored.relative_path
    module["name"] = "Prüfungsordnung für Informatik"
    assert engine.run().status == "success"
    assert moodle.download_count == downloads
    with factory() as session:
        resource = session.get(Resource, resource_id)
        assert resource.name == module["name"]
        versions = session.scalars(select(ResourceVersion).where(ResourceVersion.resource_id == resource_id)).all()
        assert len(versions) == 1 and versions[0].relative_path == path
    with TestClient(create_app(settings, [moodle.connector])) as client:
        item = next(item for item in client.get(f"/api/courses/{resource.course_id}").json()["resources"] if item["id"] == resource_id)
        assert item["name"] == module["name"]
        assert item["filename"] == "04_Schleifen.pdf"


def test_moodle_folder_preserves_individual_file_names(settings):
    moodle = FixtureMoodle(settings)
    module = moodle.contents[101][0]["modules"][0]
    module["modname"] = "folder"
    module["name"] = "Vorlesungsunterlagen"
    assert moodle.connector.fetch_changes().courses[0].resources[0].name == "04_Schleifen.pdf"


@pytest.mark.parametrize("cmid", [701, "701"])
def test_standard_assignment_response_keeps_due_date_and_builds_activity_link(settings, cmid):
    moodle = FixtureMoodle(settings)
    item = moodle.responses["mod_assign_get_assignments"]["courses"][0]["assignments"][0]
    item.pop("url", None)
    item["cmid"] = cmid
    snapshot = moodle.connector.fetch_changes()
    task = snapshot.courses[0].assignments[0]
    assert task.due_timestamp == item["duedate"]
    assert task.url == "https://moodle.example.invalid/mod/assign/view.php?id=701"


@pytest.mark.parametrize("cmid", [0, -1, True, "../../", "1&token=secret", "١"])
def test_assignment_link_never_uses_invalid_module_ids(settings, cmid):
    moodle = FixtureMoodle(settings)
    assert moodle.connector._assignment_url({"cmid": cmid, "url": "https://evil.example.invalid/"}) is None


def test_partial_assignment_response_preserves_previously_saved_deadlines(settings, factory, coordinator):
    moodle = FixtureMoodle(settings)
    engine = SyncEngine(factory, settings, [moodle.connector], Notifier(settings, coordinator), coordinator)
    assert engine.run().status == "success"
    moodle.responses["mod_assign_get_assignments"] = {"courses": [], "warnings": [{"item": "course", "itemid": 101}]}
    snapshot = moodle.connector.fetch_changes()
    assert snapshot.assignments_complete is False
    assert any("vorhandene Abgabetermine" in warning for warning in snapshot.warnings)
    engine.run()
    with factory() as session:
        assert session.scalar(select(Assignment)).removed_upstream is False
        assert session.scalar(select(Deadline)).removed_upstream is False


def test_sync_refreshes_assignment_deadline_without_changing_confirmed_override(settings, factory, coordinator):
    moodle = FixtureMoodle(settings)
    engine = SyncEngine(factory, settings, [moodle.connector], Notifier(settings, coordinator), coordinator)
    assert engine.run().status == "success"
    item = moodle.responses["mod_assign_get_assignments"]["courses"][0]["assignments"][0]
    item["duedate"] += 86400
    assert engine.run().status == "success"
    with factory() as session:
        assignment = session.scalar(select(Assignment))
        deadline = session.scalar(select(Deadline))
        assert assignment.due_at == deadline.due_at
        assert assignment.due_at.replace(tzinfo=UTC).timestamp() == item["duedate"]
        assignment.due_override = True
        confirmed = assignment.due_at
        session.commit()
    item["duedate"] += 86400
    assert engine.run().status == "success"
    with factory() as session:
        assert session.scalar(select(Assignment)).due_at == confirmed
        assert session.scalar(select(Deadline)).due_at == confirmed

# SPDX-License-Identifier: AGPL-3.0-or-later

import json
import logging
import time
from io import BytesIO
from urllib.parse import parse_qsl, urlencode, urljoin, urlparse, urlunparse

import httpx
from bs4 import BeautifulSoup
from moodle_dl.config import ConfigHelper
from moodle_dl.moodle.request_helper import RequestHelper, RequestRejectedError
from moodle_dl.types import MoodleDlOpts, MoodleURL

from app.config import Settings
from app.connectors.base import (
    ConnectorAuth,
    ConnectorStatus,
    RemoteAnnouncement,
    RemoteAssignment,
    RemoteCourse,
    RemoteEvent,
    RemoteResource,
    RemoteSection,
    Snapshot,
)
from app.connectors.moodle.diagnostics import (
    assignment_warning_details,
    expected_assignment_restrictions,
    positive_id,
)
from app.files.sidecars import safe_external_url, without_sensitive_query

log = logging.getLogger(__name__)
MAX_DOWNLOAD_BYTES = 512 * 1024 * 1024


class MoodleError(RuntimeError):
    pass


class MoodleTokenError(MoodleError):
    pass


class MoodleClient:
    name = "moodle"

    def __init__(self, settings: Settings, client: httpx.Client | None = None, request=None):
        if not settings.moodle_base_url or not settings.moodle_token:
            raise MoodleTokenError("Moodle-Adresse oder Token fehlt")
        self.settings = settings
        self.client = client or httpx.Client(timeout=30, follow_redirects=False)
        self._request = request or self._make_moodle_dl_request()
        self.functions: set[str] = set()
        self._warnings: list[str] = []
        self._last_request = 0.0

    def _make_moodle_dl_request(self):
        # moodle-dl übernimmt API-Transport und Moodle-Fehlerauswertung.
        # Die Optionen sind bewusst auf sequentielle, sichere Anfragen gesetzt.
        opts = MoodleDlOpts(
            init=False, config=False, new_token=False,
            change_notification_mail=False, change_notification_telegram=False,
            change_notification_discord=False, change_notification_ntfy=False,
            change_notification_xmpp=False, manage_database=False,
            delete_old_files=False, log_responses=False, add_all_visible_courses=False,
            sso=False, username=None, password=None, token=None,
            path=str(self.settings.data_dir), max_parallel_api_calls=1,
            max_parallel_downloads=1, max_parallel_yt_dlp=1,
            download_chunk_size=65536, ignore_ytdl_errors=True,
            without_downloading_files=False, max_path_length_workaround=False,
            allow_insecure_ssl=False, use_all_ciphers=False, skip_cert_verify=False,
            verbose=False, quiet=True, log_to_file=False, log_file_path="",
        )
        parsed = urlparse(self.settings.moodle_base_url)
        moodle_url = MoodleURL(False, parsed.netloc, parsed.path.rstrip("/") + "/")
        helper = RequestHelper(ConfigHelper(opts), opts, moodle_url, self.settings.moodle_token)
        return helper.post

    def _pace(self) -> None:
        elapsed = time.monotonic() - self._last_request
        delay = self.settings.request_delay_seconds - elapsed
        if delay > 0:
            time.sleep(delay)
        self._last_request = time.monotonic()

    def _same_origin(self, url: str) -> bool:
        target = urlparse(url)
        base = urlparse(self.settings.moodle_base_url)
        return target.scheme == "https" and target.hostname == base.hostname and (target.port or 443) == (base.port or 443)

    def _assignment_url(self, item: dict, module_url: str | None = None) -> str | None:
        # The standard mod_assign response has cmid, but no required URL field.
        explicit = safe_external_url(item.get("url"))
        if explicit and self._same_origin(explicit):
            return explicit
        module_id = str(item.get("cmid", ""))
        if module_id.isascii() and module_id.isdigit() and int(module_id) > 0:
            return urljoin(self.settings.moodle_base_url.rstrip("/") + "/",
                           f"mod/assign/view.php?id={int(module_id)}")
        clean = safe_external_url(module_url)
        return clean if clean and self._same_origin(clean) else None

    def call(self, function: str, **parameters):
        self._pace()
        try:
            payload = self._request(function, parameters)
        except RequestRejectedError as exc:
            if "token" in str(exc).lower():
                raise MoodleTokenError("Moodle-Token erneuern") from exc
            raise MoodleError(f"Moodle-Funktion {function} fehlgeschlagen") from exc
        except (ConnectionError, ValueError) as exc:
            raise MoodleError(f"Moodle-API nicht erreichbar: {type(exc).__name__}") from exc
        if isinstance(payload, dict) and "exception" in payload:
            code = str(payload.get("errorcode", ""))
            if code in {"invalidtoken", "accessexception"} or "token" in str(payload.get("message", "")).lower():
                raise MoodleTokenError("Moodle-Token erneuern")
            raise MoodleError(f"Moodle meldet {code or payload['exception']}")
        return payload

    def upload_draft(self, name: str, content: bytes, item_id: int = 0) -> int:
        """Upload one file to Moodle's draft area without placing the token in a URL."""
        self._pace()
        endpoint = urljoin(self.settings.moodle_base_url.rstrip("/") + "/", "webservice/upload.php")
        try:
            response = self.client.post(
                endpoint,
                data={"token": self.settings.moodle_token, "itemid": str(item_id)},
                files={"file_1": (name, content, "application/octet-stream")},
            )
            if response.status_code != 200:
                raise MoodleError("Moodle-Dateiupload fehlgeschlagen")
            result = response.json()
        except (httpx.HTTPError, ValueError) as exc:
            raise MoodleError("Moodle-Dateiupload fehlgeschlagen") from exc
        if (not isinstance(result, list) or len(result) != 1 or not isinstance(result[0], dict)
                or result[0].get("filename") != name or not isinstance(result[0].get("itemid"), int)
                or result[0]["itemid"] < 1 or (item_id and result[0]["itemid"] != item_id)):
            raise MoodleError("Moodle-Dateiupload konnte nicht bestätigt werden")
        return result[0]["itemid"]

    def _optional(self, function: str, **parameters):
        if function not in self.functions:
            return None
        try:
            return self.call(function, **parameters)
        except MoodleTokenError:
            raise
        except MoodleError as exc:
            log.warning("Optionale Moodle-Funktion %s fehlgeschlagen: %s", function, exc)
            self._warnings.append(f"Optionale Moodle-Funktion fehlgeschlagen: {function}")
            return None

    def check_auth(self) -> ConnectorAuth:
        site = self.call("core_webservice_get_site_info")
        if not isinstance(site, dict) or "userid" not in site:
            raise MoodleError("Moodle-Site-Info ohne Nutzer-ID")
        self.functions = {item.get("name", "") for item in site.get("functions", []) if isinstance(item, dict)}
        required = {"core_enrol_get_users_courses", "core_course_get_contents"}
        missing = required - self.functions
        if missing:
            raise MoodleError("Erforderliche Moodle-Funktionen fehlen: " + ", ".join(sorted(missing)))
        warnings = tuple(f"Optionale Moodle-Funktion fehlt: {name}" for name in (
            "mod_assign_get_assignments", "mod_forum_get_forum_discussions",
            "core_calendar_get_action_events_by_timesort",
            "mod_url_get_urls_by_courses",
            "core_group_get_course_user_groups",
        ) if name not in self.functions)
        if not self.functions & {"core_course_check_updates", "core_course_get_updates_since"}:
            warnings += ("Optionale Moodle-Funktion fehlt: core_course_get_updates_since",)
        return ConnectorAuth(str(site["userid"]), frozenset(self.functions), warnings)

    def _list_courses(self, account_id: str) -> list[RemoteCourse]:
        course_data = self.call("core_enrol_get_users_courses", userid=account_id)
        if not isinstance(course_data, list) or any(
            not isinstance(item, dict) or "id" not in item or "fullname" not in item for item in course_data
        ):
            raise MoodleError("Ungültige Kursliste von Moodle")
        return [RemoteCourse(str(item["id"]), str(item["fullname"]), item.get("shortname")) for item in course_data]

    def list_courses(self) -> list[RemoteCourse]:
        auth = self.check_auth()
        return self._list_courses(auth.account_id)

    def health(self) -> ConnectorStatus:
        try:
            auth = self.check_auth()
            return ConnectorStatus("warning" if auth.warnings else "ok", "; ".join(auth.warnings) or None)
        except MoodleTokenError:
            return ConnectorStatus("error", "Moodle-Token erneuern")
        except MoodleError as exc:
            return ConnectorStatus("error", str(exc))

    def _changed_file_modules(self, course_id: int, since: int | None, contents: list) -> set[str]:
        if since is None:
            return set()
        # Only file areas need this extra signal. Links, tasks and announcements
        # are fetched in full each time. Checking every Moodle activity also
        # asks plugins with no files for callbacks they do not implement.
        file_modules = sorted({int(module["id"])
                               for section in contents if section.get("uservisible") is not False
                               for module in section.get("modules", [])
                               if module.get("uservisible") is not False and any(
                                   item.get("type") == "file" and item.get("fileurl")
                                   for item in module.get("contents", []))})
        if not file_modules:
            return set()
        if "core_course_check_updates" in self.functions:
            changed: set[str] = set()
            # Keep each POST small enough for Moodle/PHP form-input limits.
            for offset in range(0, len(file_modules), 100):
                parameters = {"courseid": course_id, "filter[0]": "fileareas"}
                for index, module_id in enumerate(file_modules[offset:offset + 100]):
                    parameters.update({f"tocheck[{index}][contextlevel]": "module",
                                       f"tocheck[{index}][id]": module_id,
                                       f"tocheck[{index}][since]": since})
                changes = self._optional("core_course_check_updates", **parameters)
                changed.update(self._read_file_updates(course_id, changes))
            return changed
        else:
            # Older/custom mobile services may expose only the whole-course API.
            changes = self._optional("core_course_get_updates_since", courseid=course_id, since=since)
            return self._read_file_updates(course_id, changes)

    def _read_file_updates(self, course_id: int, changes) -> set[str]:
        if changes is None:
            return set()
        if not isinstance(changes, dict) or not isinstance(changes.get("instances"), list):
            self._warnings.append(f"Ungültige Moodle-Änderungsabfrage in Kurs {course_id}")
            return set()
        changed: set[str] = set()
        for instance in changes["instances"]:
            if not isinstance(instance, dict) or instance.get("contextlevel") != "module":
                continue
            updates = instance.get("updates")
            if isinstance(updates, list) and any(
                isinstance(update, dict) and update.get("name") == "fileareas" for update in updates
            ):
                changed.add(str(instance.get("id")))
        if changes.get("warnings"):
            # A warning on a requested file area is still relevant. Do not hide it.
            warning = f"Moodle-Änderungsabfrage mit Warnung in Kurs {course_id}"
            if warning not in self._warnings:
                self._warnings.append(warning)
        return changed

    def fetch_changes(self, since: int | None = None) -> Snapshot:
        self._warnings = []
        auth = self.check_auth()
        warnings = list(auth.warnings)
        courses = self._list_courses(auth.account_id)
        url_data = self._optional("mod_url_get_urls_by_courses", **{f"courseids[{i}]": course.key for i, course in enumerate(courses)}) if courses else None
        external_urls = {}
        if isinstance(url_data, dict) and isinstance(url_data.get("urls"), list):
            for item in url_data.get("urls", []):
                external_urls[(str(item.get("course")), str(item.get("id")))] = item.get("externalurl")
        elif courses and "mod_url_get_urls_by_courses" in self.functions and url_data is not None:
            self._warnings.append("Ungültige Moodle-Linkliste")
        assignment_urls: dict[tuple[str, str], str | None] = {}
        assignment_module_courses: dict[str, str] = {}
        visible_assignment_modules: dict[str, set[str]] = {course.key: set() for course in courses}
        assignment_visibility_known = True
        for course in courses:
            course_id = int(course.key)
            groups = self._optional("core_group_get_course_user_groups", courseid=course_id, userid=auth.account_id)
            if isinstance(groups, dict) and isinstance(groups.get("groups"), list):
                course.own_group_names = [str(group["name"]) for group in groups["groups"]
                                          if isinstance(group, dict) and group.get("name")]
            elif groups is not None:
                self._warnings.append(f"Ungültige Moodle-Gruppenliste in Kurs {course_id}")
            contents = self.call("core_course_get_contents", courseid=course_id)
            if not isinstance(contents, list):
                raise MoodleError(f"Ungültige Kursabschnitte für Kurs {course_id}")
            changed_file_modules = self._changed_file_modules(course_id, since, contents)
            for position, section in enumerate(contents):
                # Moodle may include a hidden activity in contents but deny its
                # assignment details. Retain only its numeric ID for diagnosis.
                for module in section.get("modules", []):
                    module_id = positive_id(module.get("id"))
                    if module.get("modname") == "assign" and module_id:
                        assignment_module_courses[module_id] = course.key
                    if (module.get("modname") == "assign" and section.get("uservisible") is not False
                            and module.get("uservisible") is not False):
                        if module_id:
                            visible_assignment_modules[course.key].add(module_id)
                        else:
                            assignment_visibility_known = False
                if section.get("uservisible") is False:
                    continue
                section_key = str(section["id"])
                course.sections.append(RemoteSection(section_key, str(section.get("name") or "Sonstiges"), position))
                for module in section.get("modules", []):
                    if module.get("uservisible") is False:
                        continue
                    module_id = str(module.get("id", ""))
                    module_title = BeautifulSoup(str(module.get("name") or ""), "html.parser").get_text(" ", strip=True)
                    if module.get("modname") == "assign" and module.get("instance"):
                        assignment_urls[(course.key, str(module["instance"]))] = safe_external_url(module.get("url"))
                    if module.get("modname") == "quiz":
                        quiz_url = safe_external_url(without_sensitive_query(str(module.get("url") or "")))
                        if quiz_url:
                            course.resources.append(RemoteResource(
                                f"{course_id}:{module_id}:quiz", module_title or "Moodle-Test",
                                quiz_url, "link", section_key,
                            ))
                        else:
                            self._warnings.append(f"Unsicherer Moodle-Testlink in Kurs {course_id} wurde ausgelassen")
                    for content in module.get("contents", []):
                        if content.get("type") != "file" or not content.get("fileurl"):
                            continue
                        file_url = str(content["fileurl"])
                        clean_url = without_sensitive_query(file_url)
                        key = f"{course_id}:{module_id}:{clean_url}"
                        filename = str(content.get("filename") or module_title or "Datei")
                        # Moodle's page_export_contents deliberately reports
                        # filesize=0 for the dynamically rendered index.html.
                        # This is unknown size, not an empty stored file.
                        generated_page = (module.get("modname") == "page"
                                          and filename.lower() in {"index.html", "index.htm"}
                                          and "/mod_page/content/" in urlparse(clean_url).path
                                          and content.get("filesize") in (0, "0"))
                        course.resources.append(RemoteResource(
                            key, module_title if (module.get("modname") == "resource" or generated_page) and module_title else filename, clean_url,
                            "file", section_key,
                            int(content["timemodified"]) if content.get("timemodified") is not None else None,
                            int(content["filesize"]) if content.get("filesize") is not None and not generated_page else None,
                            module_id in changed_file_modules,
                            filename=filename,
                        ))
                    if module.get("modname") == "url" and (module.get("url") or external_urls.get((str(course_id), str(module.get("instance"))))):
                        link_url = safe_external_url(str(
                            external_urls.get((str(course_id), str(module.get("instance")))) or module["url"]
                        ), allow_http=True)
                        if link_url:
                            course.resources.append(RemoteResource(
                                f"{course_id}:{module_id}:link", str(module.get("name") or "Link"),
                                link_url, "link", section_key,
                            ))
                        else:
                            self._warnings.append(f"Unsicherer Link in Kurs {course_id} wurde ausgelassen")
                    if module.get("modname") == "forum" and module.get("instance"):
                        discussions = self._optional("mod_forum_get_forum_discussions", forumid=module["instance"])
                        if isinstance(discussions, dict) and isinstance(discussions.get("discussions"), list):
                            for discussion in discussions.get("discussions", []):
                                discussion_id = str(discussion["id"])
                                raw_message = discussion.get("message")
                                markup = BeautifulSoup(raw_message[:20_000], "html.parser") if isinstance(raw_message, str) else None
                                if markup is not None:
                                    for tag in markup(["script", "style"]):
                                        tag.decompose()
                                course.announcements.append(RemoteAnnouncement(
                                    f"{course_id}:{discussion_id}", str(discussion.get("name") or "Ankündigung"),
                                    discussion.get("timemodified"), safe_external_url(discussion.get("url")),
                                    markup.get_text(" ", strip=True)[:10_000] if markup is not None else "",
                                ))
                        elif discussions is not None:
                            self._warnings.append(f"Ungültige Ankündigungsliste in Kurs {course_id}")
        assignments = self._optional("mod_assign_get_assignments", **{"courseids[0]": courses[0].key}) if len(courses) == 1 else None
        if len(courses) > 1 and "mod_assign_get_assignments" in self.functions:
            assignments = self._optional("mod_assign_get_assignments", **{f"courseids[{i}]": course.key for i, course in enumerate(courses)})
        if isinstance(assignments, dict) and isinstance(assignments.get("courses"), list):
            by_id = {course.key: course for course in courses}
            for group in assignments.get("courses", []):
                assignment_course = by_id.get(str(group.get("id")))
                if assignment_course:
                    for item in group.get("assignments", []):
                        assignment_course.assignments.append(RemoteAssignment(
                            f"{assignment_course.key}:{item['id']}", str(item.get("name") or "Aufgabe"),
                            item.get("duedate") or None,
                            self._assignment_url(item, assignment_urls.get((assignment_course.key, str(item['id'])))),
                            BeautifulSoup(str(item.get("intro") or ""), "html.parser").get_text(" ", strip=True)[:30_000],
                            item.get("allowsubmissionsfromdate") or None,
                        ))
        elif assignments is not None:
            self._warnings.append("Ungültige Moodle-Aufgabenliste")
        events = self._calendar_events()
        assignments_complete = (isinstance(assignments, dict) and isinstance(assignments.get("courses"), list)
                                and not assignments.get("warnings"))
        notices: list[str] = []
        if isinstance(assignments, dict) and assignments.get("warnings"):
            expected_restrictions = assignment_visibility_known and expected_assignment_restrictions(
                assignments, {course.key for course in courses}, visible_assignment_modules,
            )
            messages = notices if expected_restrictions else self._warnings
            messages.append(
                "Moodle hat für dein Konto nicht zugängliche Aktivitäten ausgelassen; "
                "vorhandene Abgabetermine bleiben erhalten" if expected_restrictions else
                "Moodle konnte nicht alle Aufgaben prüfen; vorhandene Abgabetermine bleiben erhalten"
            )
            messages.extend(assignment_warning_details(
                assignments["warnings"], {course.key for course in courses}, assignment_module_courses,
                len(assignments["courses"]) if isinstance(assignments.get("courses"), list) else 0,
            ))
        # Build the warning list after completeness checks as well.
        warnings = warnings + self._warnings
        return Snapshot(courses, events, warnings, assignments_complete, notices=notices)

    def _calendar_events(self) -> list[RemoteEvent]:
        events: list[RemoteEvent] = []
        if "core_calendar_get_action_events_by_timesort" not in self.functions:
            return events
        timesort_from = int(time.time())
        after_event_id: int | None = None
        seen_cursors: set[int] = set()
        seen_events: set[str] = set()
        for _ in range(100):
            parameters = {"timesortfrom": timesort_from, "limitnum": 50}
            if after_event_id is not None:
                parameters["aftereventid"] = after_event_id
            page = self._optional("core_calendar_get_action_events_by_timesort", **parameters)
            if page is None:
                break
            if not isinstance(page, dict) or not isinstance(page.get("events"), list):
                self._warnings.append("Ungültige Moodle-Terminliste")
                break
            items = page["events"]
            for item in items:
                if not isinstance(item, dict) or "id" not in item:
                    self._warnings.append("Ungültiger Moodle-Termin ausgelassen")
                    continue
                event_id = str(item["id"])
                if event_id in seen_events:
                    continue
                start = item.get("timesort") or item.get("timestart")
                if not start:
                    continue
                try:
                    start_timestamp = int(start)
                except (TypeError, ValueError):
                    self._warnings.append("Ungültiger Moodle-Termin ausgelassen")
                    continue
                events.append(RemoteEvent(event_id, str(item.get("name") or "Termin"), start_timestamp,
                                          item.get("timeend"), safe_external_url(item.get("url")),
                                          str(item["courseid"]) if item.get("courseid") else None))
                seen_events.add(event_id)
            if len(items) < 50:
                break
            try:
                cursor = int(page["lastid"])
            except (KeyError, TypeError, ValueError):
                self._warnings.append("Moodle-Kalender unvollständig: Seitencursor fehlt")
                break
            if cursor in seen_cursors:
                self._warnings.append("Moodle-Kalender unvollständig: Seitencursor wiederholt")
                break
            seen_cursors.add(cursor)
            after_event_id = cursor
        else:
            self._warnings.append("Moodle-Kalender unvollständig: zu viele Seiten")
        return events

    def download(self, resource: RemoteResource) -> bytes:
        if resource.kind != "file" or not self._same_origin(resource.url):
            raise MoodleError("Datei-URL liegt nicht auf der konfigurierten Moodle-Domain")
        url = self._download_url_with_token(resource.url)
        for _ in range(5):
            self._pace()
            try:
                with self.client.stream('GET', url, headers={'Accept-Encoding': 'identity'}) as response:
                    if response.status_code in {301, 302, 303, 307, 308}:
                        location = response.headers.get("location")
                        if not location:
                            raise MoodleError("Datei-Weiterleitung ohne Ziel")
                        url = urljoin(url, location)
                        if not self._same_origin(url):
                            raise MoodleError("Datei-Weiterleitung verlässt die Moodle-Domain")
                        url = self._download_url_with_token(url)
                        continue
                    response.raise_for_status()
                    if response.headers.get('content-encoding', '').lower() not in {'', 'identity'}:
                        raise MoodleError('Datei-Download ist unerwartet komprimiert')
                    try:
                        declared = int(response.headers.get('content-length', '0'))
                    except ValueError:
                        declared = 0
                    if declared > MAX_DOWNLOAD_BYTES:
                        raise MoodleError('Datei überschreitet das Downloadlimit')
                    with BytesIO() as buffer:
                        for chunk in response.iter_bytes(chunk_size=64 * 1024):
                            if buffer.tell() + len(chunk) > MAX_DOWNLOAD_BYTES:
                                raise MoodleError('Datei überschreitet das Downloadlimit')
                            buffer.write(chunk)
                        content = buffer.getvalue()
            except httpx.HTTPError as exc:
                raise MoodleError(f"Download fehlgeschlagen: {type(exc).__name__}") from exc
            content_type = response.headers.get("content-type", "").split(";", 1)[0].strip().lower()
            if len(content) <= 32768 and content.lstrip().startswith(b"{"):
                try:
                    payload = json.loads(content)
                except ValueError:
                    payload = None
                if isinstance(payload, dict) and "exception" in payload and "errorcode" in payload:
                    code = str(payload.get("errorcode", ""))
                    if code in {"invalidtoken", "accessexception"} or "token" in str(payload.get("message", "")).lower():
                        raise MoodleTokenError("Moodle-Token erneuern")
                    raise MoodleError("Moodle-Dateizugriff fehlgeschlagen")
            if content_type == "text/html" and not (resource.filename or resource.name).lower().endswith((".html", ".htm")):
                raise MoodleTokenError("Moodle-Token erneuern oder Dateizugriff prüfen")
            if resource.size is not None and int(resource.size) >= 0 and len(content) != int(resource.size):
                raise MoodleError("Downloadgröße stimmt nicht mit Moodle-Metadaten überein")
            return content
        raise MoodleError("Zu viele Datei-Weiterleitungen")

    def _download_url_with_token(self, url: str) -> str:
        parts = urlparse(url)
        query = parse_qsl(parts.query, keep_blank_values=True)
        if not any(key.lower() == "token" for key, _ in query):
            query.append(("token", self.settings.moodle_token))
        return urlunparse(parts._replace(query=urlencode(query)))

# SPDX-License-Identifier: AGPL-3.0-or-later
"""Explicit Moodle self enrolment using the site's advertised web services."""
from urllib.parse import urlencode, urljoin

from bs4 import BeautifulSoup

from app.connectors.moodle.client import MoodleClient, MoodleError


class EnrolmentService:
    def __init__(self, connectors, coordinator):
        self.connectors = connectors
        self.coordinator = coordinator

    def client(self) -> MoodleClient:
        client = next((item for item in self.connectors if isinstance(item, MoodleClient)), None)
        if client is None:
            raise MoodleError("Bitte zuerst Moodle verbinden.")
        client.check_auth()
        return client

    @staticmethod
    def course_url(client: MoodleClient, course_id: int) -> str:
        return urljoin(client.settings.moodle_base_url.rstrip("/") + "/", "enrol/index.php") + "?" + urlencode({"id": course_id})

    def search(self, text: str, page: int) -> dict:
        client = self.client()
        fallback = urljoin(client.settings.moodle_base_url.rstrip("/") + "/", "course/search.php") + "?" + urlencode({"search": text})
        if "core_course_search_courses" not in client.functions:
            return {"available": False, "courses": [], "total": 0, "page": page, "search_url": fallback}
        payload = client.call("core_course_search_courses", criterianame="search", criteriavalue=text,
                              page=page, perpage=20, limittoenrolled=0)
        if not isinstance(payload, dict) or not isinstance(payload.get("courses"), list):
            raise MoodleError("Moodle lieferte keine gültige Kurssuche.")
        own = {course.key for course in client.list_courses()}
        rows = []
        for item in payload["courses"]:
            if not isinstance(item, dict) or not isinstance(item.get("id"), int) or not item.get("fullname"):
                raise MoodleError("Moodle lieferte einen ungültigen Kurstreffer.")
            summary = BeautifulSoup(str(item.get("summary", "")), "html.parser")
            for element in summary.select("script,style"):
                element.decompose()
            rows.append({"id": item["id"], "name": str(item["fullname"]),
                         "description": summary.get_text("\n", strip=True)[:20_000],
                         "category": str(item.get("categoryname", "")), "enrolled": str(item["id"]) in own,
                         "url": self.course_url(client, item["id"])})
        return {"available": True, "courses": rows, "total": int(payload.get("total", len(rows))),
                "page": page, "search_url": fallback}

    def methods(self, course_id: int) -> dict:
        client = self.client()
        available = {"core_enrol_get_course_enrolment_methods", "enrol_self_get_instance_info", "enrol_self_enrol_user"}.issubset(client.functions)
        methods = []
        if available:
            payload = client.call("core_enrol_get_course_enrolment_methods", courseid=course_id)
            if not isinstance(payload, list):
                raise MoodleError("Einschreibearten konnten nicht gelesen werden.")
            for item in payload:
                if not isinstance(item, dict) or item.get("type") != "self" or not isinstance(item.get("id"), int):
                    continue
                detail = client.call("enrol_self_get_instance_info", instanceid=item["id"])
                if not isinstance(detail, dict) or detail.get("courseid") != course_id:
                    raise MoodleError("Einschreibeart passt nicht zum gewählten Kurs.")
                enabled = detail.get("status") in (True, 1, "1", "true")
                methods.append({"id": item["id"], "name": str(detail.get("name") or "Selbsteinschreibung"),
                                "available": enabled, "key_required": bool(detail.get("enrolpassword"))})
        return {"available": available, "methods": methods, "url": self.course_url(client, course_id)}

    def enrol(self, course_id: int, instance_id: int, key: str) -> None:
        self.coordinator.assert_writer()
        client = self.client()
        if any(course.key == str(course_id) for course in client.list_courses()):
            return
        offered = self.methods(course_id)
        method = next((item for item in offered["methods"] if item["id"] == instance_id), None)
        if not method or not method["available"]:
            raise MoodleError("Diese Einschreibeart ist nicht verfügbar. Bitte Moodle öffnen.")
        if method["key_required"] and not key:
            raise MoodleError("Für diesen Kurs wird ein Einschreibeschlüssel benötigt.")
        self.coordinator.assert_writer()
        result = client.call("enrol_self_enrol_user", courseid=course_id, instanceid=instance_id, password=key)
        if not isinstance(result, dict) or result.get("status") is not True:
            raise MoodleError("Einschreibung nicht bestätigt. Prüfe Schlüssel und Einschreibezeitraum auf Moodle.")

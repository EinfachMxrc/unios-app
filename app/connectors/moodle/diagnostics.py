# SPDX-License-Identifier: AGPL-3.0-or-later
"""Bounded assignment diagnostics for the private system view, never raw Moodle text."""

MAX_WARNING_DETAILS = 20


def positive_id(value: object) -> str | None:
    if isinstance(value, bool) or not isinstance(value, (int, str)):
        return None
    text = str(value)
    if not text.isascii() or not text.isdigit() or len(text) > 19:
        return None
    number = int(text)
    return str(number) if 0 < number <= 2**63 - 1 else None


def expected_assignment_restrictions(
    response: object, course_ids: set[str], visible_modules: dict[str, set[str]],
) -> bool:
    """Recognize access-denied activities only after all visible work is present.

    Moodle enumerates every assignment in a course, including activities the
    current user cannot access. An absent visible assignment, course warning,
    unknown code or malformed response must still demand attention.
    """
    if not isinstance(response, dict):
        return False
    courses, warnings = response.get("courses"), response.get("warnings")
    if not isinstance(courses, list) or not isinstance(warnings, list) or not warnings:
        return False
    returned: dict[str, set[str]] = {}
    for course in courses:
        if not isinstance(course, dict):
            return False
        course_id = positive_id(course.get("id"))
        if course_id is None or course_id in returned or not isinstance(course.get("assignments"), list):
            return False
        modules: set[str] = set()
        for assignment in course["assignments"]:
            if not isinstance(assignment, dict):
                return False
            module_id = positive_id(assignment.get("cmid"))
            if module_id is None or module_id in modules:
                return False
            modules.add(module_id)
        returned[course_id] = modules
    if set(returned) != course_ids or set(visible_modules) != course_ids:
        return False
    if any(not modules <= returned[course_id] for course_id, modules in visible_modules.items()):
        return False
    visible = {module for modules in visible_modules.values() for module in modules}
    delivered = {module for modules in returned.values() for module in modules}
    for warning in warnings:
        if not isinstance(warning, dict) or warning.get("item") != "module":
            return False
        code = warning.get("warningcode")
        module_id = positive_id(warning.get("itemid"))
        if type(code) not in (str, int) or str(code) != "1" or module_id is None:
            return False
        if module_id in visible or module_id in delivered:
            return False
    return True


def assignment_warning_details(
    warnings: object, course_ids: set[str], module_courses: dict[str, str], returned_courses: int,
) -> list[str]:
    """Only IDs, known codes and fixed explanations enter the private health record.

    Moodle's get_assignments contract distinguishes course codes 1/2 and module
    code 1. A missing module in course contents cannot identify its course. Do
    not infer a hidden activity, expired login or absent enrolment from code 1.
    """
    prefix = "Moodle-Aufgabendiagnose"
    if not isinstance(warnings, list):
        return [f"{prefix}: Warnungsformat unbekannt; keine Rohdaten übernommen"]
    details = [(
        f"{prefix}: angefragte Kurse: {len(course_ids)}, gelieferte Kurse: {returned_courses}, "
        f"Warnungen: {len(warnings)}"
    )]
    for warning in warnings[:MAX_WARNING_DETAILS]:
        if not isinstance(warning, dict):
            details.append(f"{prefix}: ungültiger Warnungseintrag; Grund unbekannt")
            continue
        item_id = positive_id(warning.get("itemid"))
        raw_code = warning.get("warningcode")
        code = str(raw_code) if type(raw_code) in (int, str) and str(raw_code) in {"1", "2"} else "unbekannt"
        item = warning.get("item")
        if item == "course":
            target = f"Kurs-ID {item_id}" if item_id in course_ids else "Kurs nicht zuordenbar"
            reason = {
                "1": "Kein Zugriff auf den Kurskontext",
                "2": "Keine aktive Einschreibung oder erforderliche Kursberechtigung",
            }.get(code, "Unbekannter Moodle-Warnungsgrund")
        elif item == "module":
            course_id = module_courses.get(item_id or "")
            target = f"Kurs-ID {course_id}, " if course_id in course_ids else "Kurs nicht zuordenbar, "
            target += f"Aktivitäts-ID {item_id}" if item_id else "Aktivität nicht zuordenbar"
            reason = "Kein Zugriff auf den Aktivitätskontext" if code == "1" else "Unbekannter Moodle-Warnungsgrund"
        else:
            target = "Betroffener Eintrag nicht zuordenbar"
            reason = "Unbekannter Moodle-Warnungsgrund"
        details.append(f"{prefix}: {target}, Code {code}: {reason}")
    remaining = len(warnings) - MAX_WARNING_DETAILS
    if remaining > 0:
        details.append(f"{prefix}: weitere Warnungen: {remaining}; Detailausgabe auf {MAX_WARNING_DETAILS} begrenzt")
    return details

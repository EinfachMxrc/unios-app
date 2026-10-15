# SPDX-License-Identifier: AGPL-3.0-or-later

"""Conservative Moodle section grouping hints; the user can override every hint."""

import re

GROUP_HEADING = re.compile(r"\b(?:gruppe|group|tutorium|tutorial|seminargruppe)\b", re.IGNORECASE)


def suggest_group_status(section_name: str, own_group_names: list[str]) -> str | None:
    if not GROUP_HEADING.search(section_name):
        return None
    heading = section_name.casefold()
    own_names = [name.casefold().strip() for name in own_group_names if name.strip()]
    if not own_names:
        return "unassigned"
    if any(re.search(r"(?<!\w)" + re.escape(name) + r"(?!\w)", heading) for name in own_names):
        return "own_group"
    return "other_group"

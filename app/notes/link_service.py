# SPDX-License-Identifier: AGPL-3.0-or-later

"""Resolve exact global note titles without guessing between duplicate titles."""

from collections.abc import Iterable
from dataclasses import dataclass
from typing import Literal

from app.notes.link_repository import NoteLinkRepository, NoteLinkTarget

MAX_LINK_TITLES = 32


def title_key(title: str) -> str:
    return title.strip().casefold()


def index_titles(rows: Iterable[tuple[str, str]]) -> dict[str, list[str]]:
    index: dict[str, list[str]] = {}
    for identifier, title in rows:
        index.setdefault(title_key(title), []).append(identifier)
    return index


@dataclass(frozen=True)
class NoteLinkResolution:
    title: str
    status: Literal["resolved", "ambiguous", "missing"]
    target: NoteLinkTarget | None


class NoteLinkService:
    def __init__(self, repository: NoteLinkRepository):
        self.repository = repository

    def resolve(self, titles: list[str]) -> list[NoteLinkResolution]:
        if not 1 <= len(titles) <= MAX_LINK_TITLES or any(
            not title_key(title) or len(title) > 200 or "\n" in title or "\r" in title for title in titles
        ):
            raise ValueError("Ein bis 32 einzeilige Notiztitel mit höchstens 200 Zeichen angeben")
        targets = self.repository.targets()
        by_id = {target.id: target for target in targets}
        index = index_titles((target.id, target.title) for target in targets)
        result = []
        for title in titles:
            matches = index.get(title_key(title), [])
            status: Literal["resolved", "ambiguous", "missing"] = (
                "resolved" if len(matches) == 1 else "ambiguous" if matches else "missing"
            )
            result.append(NoteLinkResolution(title, status, by_id[matches[0]] if status == "resolved" else None))
        return result

# SPDX-License-Identifier: AGPL-3.0-or-later
"""Personal timetable slots; preserve imported events and show changed slots for review."""

from hashlib import sha256

from app.calendar.selection_repository import TimetableSelectionRepository
from app.config import Settings
from app.integrations.storage import ConnectionError
from app.timeutil import as_utc


def slot(event: dict, settings: Settings) -> dict:
    return weekly_slot(event, settings.timezone)


def weekly_slot(event: dict, timezone) -> dict:
    begins = as_utc(event['starts_at']).astimezone(timezone)
    title = event['title'].split(' · ', 1)[0].strip()
    start_time = begins.strftime('%H:%M')
    weekday = begins.weekday()
    identity = f'{title.casefold()}\n{weekday}\n{start_time}'
    return {'id': sha256(identity.encode()).hexdigest(), 'title': title,
            'weekday': weekday, 'start_time': start_time}


class TimetableSelection:
    def __init__(self, settings: Settings):
        self.settings = settings
        self.repository = TimetableSelectionRepository(settings.local_dir)
        self.source = 'timetable-' + sha256(settings.institution_slug.encode()).hexdigest()[:16]

    def hidden(self) -> set[str]:
        state = self.repository.read()
        if state.get('institution') != self.settings.institution_slug:
            return set()
        values = state.get('hidden', [])
        if not isinstance(values, list) or len(values) > 1000 or any(
            not isinstance(key, str) or len(key) != 64 or any(char not in '0123456789abcdef' for char in key)
            for key in values
        ):
            raise ConnectionError('Zeitslot-Auswahl ist beschädigt; bitte Sicherung prüfen')
        return set(values)

    def visible(self, event: dict, hidden: set[str]) -> bool:
        return slot(event, self.settings)['id'] not in hidden

    def save(self, hidden: set[str]) -> None:
        if len(hidden) > 1000:
            raise ConnectionError('Zu viele ausgeblendete Zeitslots; alte Auswahl zuerst aufheben')
        self.repository.save({'version': 1, 'institution': self.settings.institution_slug,
                              'hidden': sorted(hidden)})

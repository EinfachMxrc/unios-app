# SPDX-License-Identifier: AGPL-3.0-or-later
"""Personal appointments, revision-safe timetable adjustments and undo."""

import json
from datetime import UTC, datetime, timedelta
from hashlib import sha256
from uuid import uuid4
from zoneinfo import ZoneInfo

from app.calendar.edit_repository import (
    ADJUSTMENT,
    DELETED,
    PERSONAL,
    CalendarEditRepository,
    adjustment_key,
)
from app.calendar.series import rule_adjustment, series_revision, series_slot
from app.db.models import CalendarEvent
from app.timeutil import as_utc

BERLIN = ZoneInfo('Europe/Berlin')


class CalendarEditError(ValueError):
    def __init__(self, status: int, message: str):
        self.status = status
        super().__init__(message)


def snapshot(event: CalendarEvent | None) -> dict | None:
    if event is None:
        return None
    return {field: getattr(event, field) for field in ('id', 'source', 'source_key', 'title', 'course_id', 'url')} | {
        'starts_at': as_utc(event.starts_at).astimezone(UTC).isoformat(),
        'ends_at': as_utc(event.ends_at).astimezone(UTC).isoformat() if event.ends_at else None,
    }


def revision(original: CalendarEvent, adjustment: CalendarEvent | None) -> str:
    return sha256(json.dumps([snapshot(original), snapshot(adjustment)], sort_keys=True).encode()).hexdigest()


def view(original: CalendarEvent, adjustment: CalendarEvent | None = None) -> dict:
    event = adjustment or original
    return {'id': original.id, 'title': event.title, 'starts_at': as_utc(event.starts_at),
            'ends_at': as_utc(event.ends_at) if event.ends_at else None,
            'personal': original.source == PERSONAL, 'adjusted': adjustment is not None,
            'revision': revision(original, adjustment),
            'original_starts_at': as_utc(original.starts_at) if adjustment else None,
            'original_ends_at': as_utc(original.ends_at) if adjustment and original.ends_at else None}


class CalendarEdits:
    def __init__(self, factory, coordinator, source: str, timezone=BERLIN):
        self.repository = CalendarEditRepository(factory)
        self.coordinator = coordinator
        self.source = source
        self.timezone = timezone

    def events(self, start: datetime, end: datetime, selection) -> list[dict]:
        with self.repository.factory() as session:
            rows = self.repository.rows(session)
            adjustments = {row.source_key: row for row in rows if row.source == ADJUSTMENT}
            rules = self.repository.rules(session)
            hidden = selection.hidden()
            series = {}
            groups: dict[str, list[CalendarEvent]] = {}
            keys = {}
            for row in rows:
                if row.source == self.source:
                    keys[row.id] = series_slot(row, self.timezone)
                    groups.setdefault(keys[row.id], []).append(row)
            result = []
            for row in rows:
                if row.source not in {self.source, PERSONAL}:
                    continue
                if row.source == self.source and not selection.visible(
                    {'title': row.title, 'starts_at': row.starts_at}, hidden,
                ):
                    continue
                item = self._view(session, row, adjustments.get(adjustment_key(row)), rules)
                if row.source == self.source:
                    key = keys[row.id]
                    if key not in series:
                        series[key] = series_revision(groups[key], adjustments, rules, key, self.source, self.timezone)
                    item['series_revision'] = series[key]
                    item['series_count'] = len(groups[key])
                # Include continuations from the previous day and moves into this week.
                if item['starts_at'] < end and (item['ends_at'] or item['starts_at'] + timedelta(minutes=30)) > start:
                    result.append(item)
            return sorted(result, key=lambda item: (item['starts_at'], item['id']))

    def _view(self, session, original, adjustment=None, rules=None):
        rules = self.repository.rules(session) if rules is None else rules
        try:
            inherited = rule_adjustment(original, rules, self.timezone) if adjustment is None else None
        except ValueError:
            inherited = None  # Keep the actual university time when a new recurrence falls in a DST gap.
        result = view(original, adjustment or inherited)
        result['series_adjusted'] = inherited is not None
        return result

    def _series_state(self, session, original):
        rows = self.repository.rows(session)
        rules = self.repository.rules(session)
        adjustments = {row.source_key: row for row in rows if row.source == ADJUSTMENT}
        key = series_slot(original, self.timezone)
        digest = series_revision(rows, adjustments, rules, key, self.source, self.timezone)
        return rows, rules, key, digest

    def _current(self, session, identifier: int, expected: str | None = None):
        original = self.repository.get(session, identifier)
        if original is None or original.source not in {self.source, PERSONAL, DELETED}:
            raise CalendarEditError(404, 'Termin nicht mehr vorhanden; bitte aktualisieren')
        adjustment = self.repository.adjustment(session, adjustment_key(original)) if original.source == self.source else None
        if expected is not None and self._view(session, original, adjustment)['revision'] != expected:
            raise CalendarEditError(409, 'Termin wurde inzwischen geändert. Bitte neu öffnen und erneut anpassen.')
        return original, adjustment

    @staticmethod
    def _values(title: str, starts_at: datetime, ends_at: datetime | None) -> dict:
        title = title.strip()
        if not title or len(title) > 500 or starts_at.tzinfo is None or (ends_at and ends_at.tzinfo is None):
            raise CalendarEditError(422, 'Bitte Titel und Uhrzeit mit Zeitzone angeben')
        start = starts_at.astimezone(UTC)
        end = ends_at.astimezone(UTC) if ends_at else None
        if end and not timedelta(0) < end - start <= timedelta(days=31):
            raise CalendarEditError(422, 'Das Ende muss nach dem Beginn liegen; höchstens 31 Tage.')
        return {'title': title, 'starts_at': start, 'ends_at': end}

    def create(self, title: str, starts_at: datetime, ends_at: datetime) -> dict:
        values = self._values(title, starts_at, ends_at)
        self.coordinator.assert_writer()
        with self.repository.transaction() as session:
            original = self.repository.add(session, {'source': PERSONAL, 'source_key': uuid4().hex,
                                                      'course_id': None, 'url': None, **values})
            result = view(original)
            action = self.repository.history(session, original.id,
                                             {'prior': None, 'after': result['revision'], 'operation': 'create'})
            self.repository.commit(session, self.coordinator)
            return {'event': result, 'undo_id': action}

    def update(self, identifier: int, expected: str, title: str, starts_at: datetime, ends_at: datetime | None,
               scope: str = 'single', expected_series: str | None = None) -> dict:
        values = self._values(title, starts_at, ends_at)
        if scope != 'single':
            return self._update_series(identifier, expected, values, scope, expected_series)
        self.coordinator.assert_writer()
        with self.repository.transaction() as session:
            original, adjustment = self._current(session, identifier, expected)
            if original.source == DELETED:
                raise CalendarEditError(404, 'Termin wurde entfernt')
            if original.source == PERSONAL and ends_at is None:
                raise CalendarEditError(422, 'Bitte eine Endzeit angeben')
            target = original if original.source == PERSONAL else adjustment
            prior = snapshot(target)
            if target is None:
                target = self.repository.add(session, {'source': ADJUSTMENT, 'source_key': adjustment_key(original),
                                                       'course_id': original.course_id, 'url': None, **values})
            else:
                for field, value in values.items():
                    setattr(target, field, value)
            result = self._view(session, original, target if original.source != PERSONAL else None)
            self.repository.invalidate(session, original.id)
            action = self.repository.history(session, identifier,
                                             {'prior': prior, 'after': result['revision'], 'operation': 'update'})
            self.repository.commit(session, self.coordinator)
            return {'event': result, 'undo_id': action}

    def remove(self, identifier: int, expected: str, *, reset: bool = False) -> dict:
        self.coordinator.assert_writer()
        with self.repository.transaction() as session:
            original, adjustment = self._current(session, identifier, expected)
            if reset and adjustment:
                prior = snapshot(adjustment)
                self.repository.remove(session, adjustment)
                adjustment = None
            elif not reset and original.source == PERSONAL:
                prior = snapshot(original)
                original.source = DELETED  # Keep identity and content; never reuse a removed appointment ID.
            else:
                raise CalendarEditError(422, 'Nur eigene Termine entfernen oder persönliche Anpassungen zurücksetzen')
            result = self._view(session, original, adjustment)
            self.repository.invalidate(session, original.id)
            action = self.repository.history(session, identifier,
                                             {'prior': prior, 'after': result['revision'], 'operation': 'reset' if reset else 'delete'})
            self.repository.commit(session, self.coordinator)
            return {'event': None if original.source == DELETED else result, 'undo_id': action}

    def undo(self, identifier: str) -> dict:
        self.coordinator.assert_writer()
        with self.repository.transaction() as session:
            action = self.repository.action(session, identifier)
            if action is None or action.kind != 'calendar':
                raise CalendarEditError(404, 'Kalenderänderung nicht gefunden')
            if action.undone_at:
                raise CalendarEditError(409, 'Diese Änderung wurde bereits zurückgenommen')
            if action.before['operation'] == 'series':
                return self._undo_series(session, action)
            original, adjustment = self._current(session, int(action.entity_id), action.before['after'])
            prior = action.before['prior']
            if prior is None:
                if action.before['operation'] == 'create':
                    original.source = DELETED
                elif adjustment:
                    self.repository.remove(session, adjustment)
                    adjustment = None
            else:
                values = {**prior, 'starts_at': datetime.fromisoformat(prior['starts_at']),
                          'ends_at': datetime.fromisoformat(prior['ends_at']) if prior['ends_at'] else None}
                if prior['source'] == PERSONAL:
                    target = original
                else:
                    values.pop('id')  # Internal overlay identities may have been reused after a reset.
                    target = adjustment or self.repository.add(session, values)
                    adjustment = target
                for field, value in values.items():
                    setattr(target, field, value)
            action.undone_at = datetime.now(UTC)
            result = None if original.source == DELETED else self._view(session, original, adjustment)
            self.repository.invalidate(session, original.id)
            self.repository.commit(session, self.coordinator)
            return {'event': result, 'undo_id': None}


    def _update_series(self, identifier, expected, values, scope, expected_series):
        if scope not in {'future', 'series'}:
            raise CalendarEditError(422, 'Unbekannter Änderungsumfang')
        self.coordinator.assert_writer()
        with self.repository.transaction() as session:
            original, adjustment = self._current(session, identifier, expected)
            if original.source != self.source:
                raise CalendarEditError(422, 'Dieser Termin gehört zu keiner Stundenplanserie')
            rows, rules, key, digest = self._series_state(session, original)
            if not expected_series or expected_series != digest:
                raise CalendarEditError(409, 'Die Serie wurde inzwischen geändert. Bitte neu öffnen.')
            anchor = as_utc(original.starts_at).astimezone(self.timezone).date()
            begins = values['starts_at'].astimezone(self.timezone)
            finishes = values['ends_at'].astimezone(self.timezone) if values['ends_at'] else None
            current = self._view(session, original, adjustment, rules)
            rule = self.repository.add_rule(session, {'source': self.source, 'slot_id': key,
                'from_day': anchor if scope == 'future' else None, 'active': True, 'payload': {
                    'title': values['title'] if values['title'] != current['title'] else None,
                    'start': begins.time().isoformat(), 'start_day': (begins.date() - anchor).days,
                    'end': finishes.time().isoformat() if finishes else None,
                    'end_day': (finishes.date() - anchor).days if finishes else 0}})
            affected = [row for row in rows if row.source == self.source and series_slot(row, self.timezone) == key
                        and (scope == 'series' or as_utc(row.starts_at).astimezone(self.timezone).date() >= anchor)]
            for row in affected:
                try:
                    projected = rule_adjustment(row, [*rules, rule], self.timezone)
                    self._values(projected.title, projected.starts_at, projected.ends_at)
                except ValueError as exc:
                    raise CalendarEditError(422, str(exc)) from None
                self.repository.invalidate(session, row.id)
            after = self._series_state(session, original)[3]
            action = self.repository.history(session, identifier, {'operation': 'series', 'rule_id': rule.id, 'after': after})
            self.repository.commit(session, self.coordinator)
            return {'event': self._view(session, original, adjustment), 'undo_id': action, 'affected': len(affected)}

    def _undo_series(self, session, action):
        original, adjustment = self._current(session, int(action.entity_id))
        rows, _rules, key, digest = self._series_state(session, original)
        rule = self.repository.get_rule(session, action.before['rule_id'])
        if rule is None or not rule.active or digest != action.before['after']:
            raise CalendarEditError(409, 'Die Serie wurde inzwischen geändert. Rückgängig ist nicht mehr sicher möglich.')
        rule.active = False
        session.flush()
        action.undone_at = datetime.now(UTC)
        for row in rows:
            if row.source == self.source and series_slot(row, self.timezone) == key:
                self.repository.invalidate(session, row.id)
        result = self._view(session, original, adjustment)
        self.repository.commit(session, self.coordinator)
        return {'event': result, 'undo_id': None}

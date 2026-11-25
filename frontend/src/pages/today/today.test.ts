// SPDX-License-Identifier: AGPL-3.0-or-later

import { describe, expect, test } from 'vitest'
import { agendaRange } from './DayAgenda'
import { nextSession } from './briefing'
import { decksToStudy } from './TodayDecks'

const event = (id: number, starts_at: string, ends_at: string) => ({ id, title: `Termin ${id}`, starts_at, ends_at })

describe('nextSession', () => {
  const events = [
    event(2, '2026-11-25T13:00:00Z', '2026-11-25T14:00:00Z'),
    event(1, '2026-11-25T09:00:00Z', '2026-11-25T10:00:00Z'),
  ]

  test('prefers the running appointment', () => {
    expect(nextSession(events, new Date('2026-11-25T09:30:00Z'))).toMatchObject({ kind: 'running', event: { id: 1 } })
  })

  test('counts down when the next one is close and names it otherwise', () => {
    expect(nextSession(events, new Date('2026-11-25T12:24:00Z'))).toMatchObject({ kind: 'soon', minutes: 36 })
    expect(nextSession(events, new Date('2026-11-25T10:00:00Z'))).toMatchObject({ kind: 'later', event: { id: 2 } })
  })

  test('is empty once the day is over', () => {
    expect(nextSession(events, new Date('2026-11-25T18:00:00Z'))).toBeNull()
  })
})

describe('agendaRange', () => {
  test('covers appointments and the current time with at least six hours', () => {
    expect(agendaRange([{ start: 600, end: 690 }], 555)).toEqual({ start: 9, end: 15 })
    expect(agendaRange([{ start: 495, end: 585 }], 1200)).toEqual({ start: 8, end: 21 })
    expect(agendaRange([{ start: 1380, end: 1440 }], 1390)).toEqual({ start: 18, end: 24 })
  })
})

describe('decksToStudy', () => {
  const deck = (deck_id: number, name: string, review: number) => ({
    deck_id,
    name,
    cards: review,
    scope_cards: review,
    counts: { new: 0, learning: 0, review },
  })

  test('offers only the most specific decks with waiting cards, fullest first', () => {
    const decks = [deck(1, 'Uni', 9), deck(2, 'Uni::Mathe', 3), deck(3, 'Uni::Info', 6), deck(4, 'Uni::Leer', 0)]
    expect(decksToStudy(decks).map((item) => item.deck_id)).toEqual([3, 2])
  })
})

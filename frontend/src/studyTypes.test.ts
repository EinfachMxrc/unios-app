// SPDX-License-Identifier: AGPL-3.0-or-later

import { describe, expect, it } from 'vitest'
import { freezeStudySession, studyCardInput, studyDuePath, validStudySession } from './studyTypes'
import { syntheticStudyCard, syntheticStudyDue } from './studyTestFixtures'

describe('study deck snapshots', () => {
  it('uses the complete encoded deck name as a separate URL while preserving the legacy global URL', () => {
    expect(studyDuePath()).toBe('/api/anki/study/due')
    expect(studyDuePath('Uni::Ä & ?#/子')).toBe('/api/anki/study/due?deck=Uni%3A%3A%C3%84%20%26%20%3F%23%2F%E5%AD%90')
  })

  it('retains scheduler order, child decks and immutable parent metadata', () => {
    const due = syntheticStudyDue(
      'Uni::Parent',
      [syntheticStudyCard(7, 'Uni::Parent::B'), syntheticStudyCard(3, 'Uni::Parent::A')],
      { counts: { new: 102, learning: 8, review: 9 }, has_more: true },
    )
    const snapshot = freezeStudySession('Uni::Parent', due)!
    expect(snapshot.cards.map((card) => card.id)).toEqual([7, 3])
    expect(snapshot.scope?.deck_id).toBe(42)
    due.cards.reverse()
    due.counts.new = 0
    due.scope!.deck_id = 99
    due.cards[0].front_html = '<p>Changed later</p>'
    expect(snapshot.cards.map((card) => card.id)).toEqual([7, 3])
    expect(snapshot.cards[1].front_html).toContain('Question 3')
    expect(snapshot.counts.new).toBe(102)
    expect(snapshot.scope?.deck_id).toBe(42)
    expect(snapshot.has_more).toBe(true)
  })

  it('rejects wrong-scope and global responses for a requested deck', () => {
    const due = syntheticStudyDue('Uni::A')
    expect(freezeStudySession('Uni::B', due)).toBeNull()
    expect(freezeStudySession('Uni::A', { ...due, scope: null })).toBeNull()
    expect(freezeStudySession('', { ...due, scope: null })?.cards).toHaveLength(1)
  })

  it('rejects pre-scope session state instead of treating a filtered global window as a full deck', () => {
    expect(validStudySession(null)).toBe(true)
    expect(validStudySession({ deck: 'Uni::A', cards: [] })).toBe(false)
    const snapshot = freezeStudySession('Uni::A', syntheticStudyDue('Uni::A'))!
    expect(validStudySession(snapshot)).toBe(true)
    expect(validStudySession({ ...snapshot, scope: { ...snapshot.scope, deck_name: 'Uni::B' } })).toBe(false)
    expect(validStudySession({ ...snapshot, counts: { new: -1, learning: 0, review: 0 } })).toBe(false)
  })

  it('adapts nullable engine dates and validates every FSRS state without a number assertion', () => {
    const card = syntheticStudyCard(1)
    for (const state of [0, 1, 2, 3])
      expect(studyCardInput({ ...card.fsrs, state })).toMatchObject({ state, last_review: null })
    expect(studyCardInput({ ...card.fsrs, last_review: '2026-10-06T12:00:00Z' }).last_review).toBe(
      '2026-10-06T12:00:00Z',
    )
    expect(() => studyCardInput({ ...card.fsrs, state: 4 })).toThrow(RangeError)
  })
})

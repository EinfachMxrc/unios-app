// SPDX-License-Identifier: AGPL-3.0-or-later

import { State, type CardInput } from 'ts-fsrs'
import type { components } from '@/generated/api'

export type StudyCard = components['schemas']['StudyCard']
export type StudyCounts = components['schemas']['StudyCounts']
export type StudyDueResponse = components['schemas']['StudyDueResponse']
export type StudyStats = components['schemas']['StudyStatsResponse']
export type StudyStatus = components['schemas']['StudyStatusResponse']
export type StudySessionSnapshot = StudyDueResponse & { deck: string }

/** Validate the engine enum instead of asserting arbitrary API numbers into ts-fsrs. */
export function studyCardInput(input: StudyCard['fsrs']): CardInput {
  const state = input.state
  if (state !== State.New && state !== State.Learning && state !== State.Review && state !== State.Relearning)
    throw new RangeError('Unsupported study scheduler state')
  return { ...input, state }
}

export const studyCountTotal = (counts: StudyCounts) => counts.new + counts.learning + counts.review

export function studyDuePath(deck = ''): string {
  return `/api/anki/study/due${deck ? `?deck=${encodeURIComponent(deck)}` : ''}`
}

/** Preserve the scheduler's order and parent scope, including cards in subdecks. */
export function matchesStudyScope(deck: string, due: StudyDueResponse): boolean {
  return deck ? due.scope?.deck_name === deck : due.scope === null
}

export function freezeStudySession(deck: string, due: StudyDueResponse): StudySessionSnapshot | null {
  if (!matchesStudyScope(deck, due)) return null
  return {
    ...due,
    deck,
    scope: due.scope && { ...due.scope },
    counts: { ...due.counts },
    cards: due.cards.map(card => ({ ...card, fsrs: { ...card.fsrs }, tags: [...card.tags] })),
  }
}

export function validStudySession(value: unknown): value is StudySessionSnapshot | null {
  if (value === null) return true
  if (!value || typeof value !== 'object') return false
  const session = value as Partial<StudySessionSnapshot>
  return typeof session.deck === 'string' && typeof session.generated_at === 'string' &&
    typeof session.has_more === 'boolean' && !!session.counts &&
    [session.counts.new, session.counts.learning, session.counts.review].every(count => Number.isSafeInteger(count) && count >= 0) &&
    (session.deck === '' ? session.scope === null : !!session.scope &&
      Number.isSafeInteger(session.scope.deck_id) && session.scope.deck_id > 0 &&
      session.scope.deck_name === session.deck && session.scope.includes_subdecks === true) &&
    Array.isArray(session.cards) && session.cards.every(card => Number.isSafeInteger(card.id) && card.id > 0 &&
      typeof card.front_html === 'string' && typeof card.back_html === 'string' && typeof card.deck === 'string')
}

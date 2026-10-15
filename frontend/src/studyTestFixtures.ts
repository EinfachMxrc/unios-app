// SPDX-License-Identifier: AGPL-3.0-or-later

import { createEmptyCard } from 'ts-fsrs'
import type { StudyCard, StudyDueResponse } from './studyTypes'

export const syntheticStudyCard = (id: number, deck = 'Uni::Synthetic'): StudyCard => {
  const state = createEmptyCard(new Date('2026-10-07T12:00:00Z'))
  return {
    id, note_id: id, due: 0, queue: 0, front: `Question ${id}`, back: `Answer ${id}`,
    front_html: `<p>Question ${id}</p>`, back_html: `<p>Answer ${id}</p>`, deck, tags: [],
    fsrs: { ...state, due: state.due.toISOString(), last_review: null },
  }
}

export const syntheticStudyDue = (deck: string, cards = [syntheticStudyCard(1, deck)],
  fields: Partial<StudyDueResponse> = {}): StudyDueResponse => ({
  cards, generated_at: '2026-10-07T12:00:00Z',
  scope: { deck_id: 42, deck_name: deck, includes_subdecks: true },
  counts: { new: cards.length, learning: 0, review: 0 }, has_more: false, ...fields,
})

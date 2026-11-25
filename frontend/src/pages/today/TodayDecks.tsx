// SPDX-License-Identifier: AGPL-3.0-or-later

import { Link } from 'react-router-dom'
import { Layers, Play } from 'lucide-react'
import { useApi } from '@/api'
import { useT } from '@/i18n/useT'
import type { components } from '@/generated/api'
import { TodaySection } from './TodaySection'

type Stats = components['schemas']['StudyStatsResponse']
type Deck = components['schemas']['StudyDeck']
const SHOWN = 4

const due = (deck: Deck) => deck.counts.new + deck.counts.learning + deck.counts.review

/**
 * Anki counts a parent deck's cards again in its sub-decks, so only the most
 * specific deck with something to do is offered.
 */
export function decksToStudy(decks: readonly Deck[]) {
  const waiting = decks.filter((deck) => due(deck) > 0)
  return waiting
    .filter((deck) => !waiting.some((other) => other.name.startsWith(`${deck.name}::`)))
    .sort((a, b) => due(b) - due(a))
}

/** Card piles that want attention today, one click from the session. */
export function TodayDecks() {
  const { t } = useT('today')
  const { data } = useApi<Stats>('/api/anki/study/stats')
  const decks = decksToStudy(data?.decks ?? [])
  if (!decks.length) return null
  return (
    <TodaySection id="decks" icon={Layers} title={t('decksTitle')} to="/study" linkLabel={t('allDecks')}>
      <ul className="today-decks">
        {decks.slice(0, SHOWN).map((deck) => {
          const name = deck.name.replace(/^Uni::/, '').replaceAll('::', ' › ')
          return (
            <li key={deck.deck_id}>
              <div>
                <strong title={name}>{name}</strong>
                <span>
                  <b data-kind="new">{t('deckNew', { count: deck.counts.new })}</b>
                  <b data-kind="learning">{t('deckLearning', { count: deck.counts.learning })}</b>
                  <b data-kind="review">{t('deckReview', { count: deck.counts.review })}</b>
                </span>
              </div>
              <Link
                to={`/study/session/${encodeURIComponent(deck.name)}`}
                aria-label={t('deckStart', { name, count: due(deck) })}
              >
                <Play size={13} aria-hidden="true" /> {due(deck)}
              </Link>
            </li>
          )
        })}
      </ul>
    </TodaySection>
  )
}

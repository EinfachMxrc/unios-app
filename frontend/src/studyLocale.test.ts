// SPDX-License-Identifier: AGPL-3.0-or-later

import i18nextFactory from 'i18next'
import { expect, it } from 'vitest'
import de from '@/i18n/locales/de/study'
import en from '@/i18n/locales/en/study'

it.each([
  {
    language: 'de',
    oneProgress: '0 von 1 Karte bearbeitet',
    manyProgress: '1 von 2 Karten bearbeitet',
    oneDeck: '1 heute geplant · 1 Karte mit Unterstapeln',
    manyDeck: '2 heute geplant · 2 Karten mit Unterstapeln',
    oneCard: '1 Karte',
    manyCards: '2 Karten',
    zeroCards: '0 Karten',
  },
  {
    language: 'en',
    oneProgress: '0 of 1 card done',
    manyProgress: '1 of 2 cards done',
    oneDeck: '1 planned today · 1 card with subdecks',
    manyDeck: '2 planned today · 2 cards with subdecks',
    oneCard: '1 card',
    manyCards: '2 cards',
    zeroCards: '0 cards',
  },
])('uses the total inventory for $language singular/plural study captions', async (expected) => {
  const instance = i18nextFactory.createInstance()
  await instance.init({
    lng: expected.language,
    fallbackLng: false,
    defaultNS: 'study',
    resources: { de: { study: de }, en: { study: en } },
  })
  expect(instance.t('sessionProgressText', { completed: 0, total: 1, count: 1 })).toBe(expected.oneProgress)
  expect(instance.t('sessionProgressText', { completed: 1, total: 2, count: 2 })).toBe(expected.manyProgress)
  expect(instance.t('deckDueSummary', { due: 1, total: 1, count: 1 })).toBe(expected.oneDeck)
  expect(instance.t('deckDueSummary', { due: 2, total: 2, count: 2 })).toBe(expected.manyDeck)
  expect(instance.t('deckCardCount', { count: 1 })).toBe(expected.oneCard)
  expect(instance.t('deckCardCount', { count: 2 })).toBe(expected.manyCards)
  expect(instance.t('deckCardCount', { count: 0 })).toBe(expected.zeroCards)
})

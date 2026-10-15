// SPDX-License-Identifier: AGPL-3.0-or-later

import { afterEach, describe, expect, it } from 'vitest'
import i18n, { i18nReady } from './index'

describe('i18n bootstrap', () => {
  it('initializes synchronously with German as the active language', async () => {
    await i18nReady
    expect(i18n.language).toBe('de')
    expect(i18n.t('nav:today')).toBe('Heute')
  })

  it('renders bundled German text immediately, without awaiting i18nReady', () => {
    // main.tsx and App.test.tsx both rely on this: `resources.de` is passed
    // synchronously to `i18n.init()`, so `t()` must already work the instant
    // the module has been imported, not just after the init promise settles.
    expect(i18n.t('common:noData')).toBe('Noch keine Daten')
  })
})

describe('fallback to German', () => {
  it('falls back to the German resource for a language with no translations at all', () => {
    // 'fr' is not a supported language and has no bundled or loadable
    // resources, so i18next must fall back to `fallbackLng: 'de'`.
    expect(i18n.t('common:noData', { lng: 'fr' })).toBe('Noch keine Daten')
  })
})

describe('pluralization', () => {
  afterEach(async () => {
    await i18n.changeLanguage('de')
  })

  it('picks the singular German form for count 1 and the plural form otherwise', () => {
    // The study-day counter has no inflected noun; task labels still exercise plural selection.
    expect(i18n.t('today:upcomingTasks', { count: 1 })).toBe('anstehende Aufgabe')
    expect(i18n.t('today:upcomingTasks', { count: 2 })).toBe('anstehende Aufgaben')
    expect(i18n.t('today:upcomingTasks', { count: 0 })).toBe('anstehende Aufgaben')
  })

  it('picks the correct English plural form after switching language', async () => {
    await i18n.changeLanguage('en')
    expect(i18n.t('today:upcomingTasks', { count: 1 })).toBe('upcoming task')
    expect(i18n.t('today:upcomingTasks', { count: 5 })).toBe('upcoming tasks')
  })
})

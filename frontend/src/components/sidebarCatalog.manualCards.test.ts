// SPDX-License-Identifier: AGPL-3.0-or-later

import { expect, it } from 'vitest'
import { activeArea, areaForPath, areaRoutes, sidebarCatalog } from './sidebarCatalog'
import type { Preferences } from '@/preferences'

it('keeps own-card navigation in learning with AI disabled and preserves the optional proposal gate', () => {
  const preferences: Preferences = {
    modules: {
      courses: true,
      deadlines: true,
      notifications: true,
      search: true,
      ai: false,
      projects: false,
      grades: false,
      mail: false,
      addons: true,
    },
    density: 'comfortable',
    advanced: false,
    language: 'de',
  }
  const catalog = sidebarCatalog(
    preferences,
    (key) => key,
    (key) => key,
    (key) => key,
  )
  const ownRoute = areaRoutes.find((route) => route.path === '/study/cards')!
  const proposalRoute = areaRoutes.find((route) => route.path === '/anki')!
  expect(ownRoute.page).toBe('studyCards')
  expect(preferences.modules[ownRoute.module!]).toBe(true)
  expect(preferences.modules[proposalRoute.module!]).toBe(false)
  expect(catalog.some((area) => area.id === areaForPath('/study/cards')?.id)).toBe(true)
  expect(catalog.some((area) => area.id === 'anki')).toBe(false)
  expect(activeArea('/study/cards', ['today', 'learning', 'notes'])).toBe('learning')
})

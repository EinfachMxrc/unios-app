// SPDX-License-Identifier: AGPL-3.0-or-later
// @vitest-environment jsdom

import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { SearchResponse } from '@/types'
import { CommandPalette } from './CommandPalette'
import { paletteSearchFixture } from './commandPalette.testFixtures'
import de from '@/i18n/locales/de/commandPalette'
import en from '@/i18n/locales/en/commandPalette'

const api = vi.hoisted(() => ({
  request: vi.fn(),
  navigate: vi.fn(),
  language: 'de' as 'de' | 'en',
  searchEnabled: true,
}))
vi.mock('@/api', () => ({
  request: api.request,
  activeIntlLocale: () => 'de-DE',
  useApi: () => ({ data: { courses: [] } }),
}))
vi.mock('react-router-dom', () => ({ useNavigate: () => api.navigate }))
vi.mock('@/preferences', () => ({
  getLanguage: () => 'de',
  usePreferences: () => ({ modules: { search: api.searchEnabled, courses: false } }),
}))
vi.mock('@/hostAvailability', () => ({ useHostOnline: () => true }))
vi.mock('@/hooks/host', async () => ({ HostContext: (await import('react')).createContext(null) }))
vi.mock('@/lib/workspaceState', async () => {
  const { useState } = await import('react')
  return {
    useWorkspaceState: function useWorkspaceState(_key: string, initial: boolean) {
      return useState(initial)
    },
  }
})
vi.mock('@/lib/recentObjects', () => ({ useRecentObjects: () => [], clearRecentObjects: vi.fn() }))
vi.mock('@/components/sidebarCatalog', () => ({ sidebarCatalog: () => [], areaForPath: () => null }))
vi.mock('@/hooks/useMoodleRefresh', () => ({
  useMoodleRefresh: () => ({ busy: false, result: null, refresh: vi.fn() }),
}))
vi.mock('@/components/JotCapture', () => ({ JotCapture: () => null }))
vi.mock('@/components/RegistryActions', () => ({ RegistryActions: () => null }))
vi.mock('@/i18n/useT', async () => {
  const { default: german } = await import('@/i18n/locales/de/commandPalette')
  const { default: english } = await import('@/i18n/locales/en/commandPalette')
  return {
    useT: () => ({
      t: (key: string, values: Record<string, unknown> = {}) => {
        const strings = api.language === 'en' ? english : german
        return (strings[key as keyof typeof strings] ?? key).replace(/{{(\w+)}}/g, (_match, name: string) =>
          String(values[name] ?? ''),
        )
      },
    }),
  }
})

async function openPalette() {
  render(<CommandPalette />)
  expect(
    screen.getByRole('button', { name: /^Suche in Kursen und Dateien (Strg|⌘) K Befehlspalette öffnen$/ }),
  ).toBeTruthy()
  fireEvent.keyDown(window, { key: 'k', metaKey: true })
  await act(async () => vi.advanceTimersByTime(0))
  return screen.getByRole('textbox', { name: 'Befehl suchen' })
}

describe('command palette interactions', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    api.request.mockReset()
    api.navigate.mockReset()
    api.language = 'de'
    api.searchEnabled = true
    api.request.mockImplementation((path: string) =>
      Promise.resolve(path === '/api/system' ? { moodle_configured: false } : paletteSearchFixture(50)),
    )
  })
  afterEach(() => {
    cleanup()
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  it.each(
    (['de', 'en'] as const).flatMap((language) =>
      ['Win32', 'MacIntel'].flatMap((platform) =>
        [true, false].map((searchEnabled) => ({ language, platform, searchEnabled })),
      ),
    ),
  )(
    'includes visible localized label and shortcut in the accessible name ($language, $platform, search=$searchEnabled)',
    async ({ language, platform, searchEnabled }) => {
      api.language = language
      api.searchEnabled = searchEnabled
      vi.spyOn(navigator, 'platform', 'get').mockReturnValue(platform)
      const strings = language === 'de' ? de : en
      const label = searchEnabled ? strings.triggerText : strings.navigationText
      const shortcut = platform === 'MacIntel' ? strings.shortcutHintMac : strings.shortcutHintOther
      render(<CommandPalette />)
      const trigger = screen.getByRole('button', { name: `${label} ${shortcut} ${strings.openButtonLabel}` })
      expect(trigger.hasAttribute('aria-label')).toBe(false)
      expect(trigger.querySelector('span')?.textContent).toBe(label)
      expect(trigger.querySelector('kbd')?.textContent).toBe(shortcut)
      expect(trigger.querySelector('.sr-only')?.textContent).toBe(strings.openButtonLabel)
      // The mobile icon retains its name when the visible desktop text is hidden.
      trigger.querySelector<HTMLElement>('span:not(.sr-only)')!.style.display = 'none'
      trigger.querySelector('kbd')!.style.display = 'none'
      expect(screen.getByRole('button', { name: strings.openButtonLabel })).toBe(trigger)
      fireEvent.click(trigger)
      await act(async () => vi.advanceTimersByTime(0))
      expect(screen.getByRole('dialog', { name: strings.title })).toBeTruthy()
    },
  )

  it('opens with Cmd+K, waits 250 ms, shows all types and lets arrows reach the note', async () => {
    const input = await openPalette()
    fireEvent.change(input, { target: { value: 'synthetic' } })
    await act(async () => vi.advanceTimersByTime(249))
    expect(api.request.mock.calls.filter(([path]) => path.startsWith('/api/search?'))).toHaveLength(0)
    expect(document.querySelectorAll('.command-results .command-hit')).toHaveLength(0)
    await act(async () => vi.advanceTimersByTime(1))
    const buttons = [...document.querySelectorAll<HTMLButtonElement>('.command-results .command-hit')]
    expect(buttons).toHaveLength(7)
    expect(buttons.map((button) => button.querySelector('strong')?.textContent)).toEqual([
      'synthetic-document-0',
      'synthetic-annotation-0',
      'synthetic-announcement-0',
      'synthetic-course-note-0',
      'synthetic-note-0',
      'synthetic-jot-0',
      'synthetic-clip-0',
    ])
    expect(buttons[5].textContent).toContain('Ohne Kurs · Schnellnotiz')
    expect(buttons[6].textContent).toContain('Ohne Kurs · Eingang')
    fireEvent.keyDown(input, { key: 'ArrowDown' })
    expect(document.activeElement).toBe(buttons[0])
    for (let index = 0; index < 4; index += 1) fireEvent.keyDown(document.activeElement!, { key: 'ArrowDown' })
    expect(document.activeElement).toBe(buttons[4])
    fireEvent.keyDown(buttons[4], { key: 'ArrowUp' })
    expect(document.activeElement).toBe(buttons[3])
    fireEvent.keyDown(buttons[3], { key: 'ArrowDown' })
    fireEvent.click(buttons[4])
    expect(api.navigate).toHaveBeenCalledWith('/notes?id=synthetic-note-0')
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('keeps external forum opening and Enter-to-full-search destinations', async () => {
    const openWindow = vi.spyOn(window, 'open').mockReturnValue(null)
    const input = await openPalette()
    fireEvent.change(input, { target: { value: 'synthetic' } })
    await act(async () => vi.advanceTimersByTime(250))
    fireEvent.click(screen.getByRole('button', { name: /synthetic-announcement-0/ }))
    expect(openWindow).toHaveBeenCalledWith('https://example.org/forum/0', '_blank', 'noopener,noreferrer')
    expect(api.navigate).not.toHaveBeenCalled()
    fireEvent.keyDown(window, { key: 'k', ctrlKey: true })
    await act(async () => vi.advanceTimersByTime(0))
    const reopened = screen.getByRole('textbox', { name: 'Befehl suchen' })
    fireEvent.change(reopened, { target: { value: 'alpha & beta' } })
    fireEvent.keyDown(reopened, { key: 'Enter' })
    expect(api.navigate).toHaveBeenCalledWith('/search?q=alpha%20%26%20beta')
  })

  it('clears visible hits when shortened and ignores a late response that does not honor abort', async () => {
    let resolve!: (response: SearchResponse) => void
    const response = new Promise<SearchResponse>((accept) => {
      resolve = accept
    })
    api.request.mockImplementation((path: string) =>
      path === '/api/system' ? Promise.resolve({ moodle_configured: false }) : response,
    )
    const input = await openPalette()
    fireEvent.change(input, { target: { value: 'old' } })
    await act(async () => vi.advanceTimersByTime(250))
    fireEvent.change(input, { target: { value: 'o' } })
    await act(async () => resolve(paletteSearchFixture(50, 'old')))
    expect(screen.queryByText('old-document-0')).toBeNull()
    expect(screen.queryByText('old-note-0')).toBeNull()
    expect(screen.queryByText(/werden gesucht/)).toBeNull()
    fireEvent.change(input, { target: { value: 'latest' } })
    expect(document.querySelectorAll('.command-results .command-hit')).toHaveLength(0)
  })
})

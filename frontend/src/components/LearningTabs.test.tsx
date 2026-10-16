// SPDX-License-Identifier: AGPL-3.0-or-later
// @vitest-environment jsdom

import { cleanup, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeAll, expect, it, vi } from 'vitest'
import messages from '@/i18n/locales/de/learning'
import { LearningTabs } from './LearningTabs'

vi.mock('@/i18n/useT', () => ({
  useT: () => ({ t: (key: string) => (messages as Record<string, string>)[key] ?? key }),
}))

beforeAll(() => {
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe() {}
      disconnect() {}
      unobserve() {}
    },
  )
})
afterEach(cleanup)

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <LearningTabs />
    </MemoryRouter>,
  )
}

it('links the four learning areas', () => {
  renderAt('/learning')
  const hrefs = screen.getAllByRole('link').map((link) => link.getAttribute('href'))
  expect(hrefs).toEqual(['/learning', '/study', '/assessment', '/coding'])
})

it('marks only the current area as active', () => {
  renderAt('/study')
  const active = screen.getAllByRole('link').filter((link) => link.classList.contains('active'))
  expect(active.map((link) => link.textContent)).toEqual([messages.tabFlashcards])
})

it('does not keep the overview active on a sub-area (exact match for the first tab)', () => {
  renderAt('/coding')
  expect(screen.getByText(messages.tabOverview).classList.contains('active')).toBe(false)
})

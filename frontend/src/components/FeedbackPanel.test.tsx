// SPDX-License-Identifier: AGPL-3.0-or-later
// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, expect, it, vi } from 'vitest'
import messages from '@/i18n/locales/de/feedback'
import { FeedbackPanel } from './FeedbackPanel'

vi.mock('@/api', () => ({ request: vi.fn() }))
vi.mock('@/i18n/useT', () => ({
  useT: () => ({
    t: (key: string, values: Record<string, unknown> = {}) =>
      ((messages as Record<string, string>)[key] ?? key).replace(/\{\{(\w+)\}\}/g, (_, name: string) =>
        String(values[name]),
      ),
  }),
}))

afterEach(cleanup)

function issueLink() {
  const href = screen.getByRole('link', { name: 'Bericht auf GitHub öffnen' }).getAttribute('href')
  return new URL(href!)
}

it('opens the prefilled bug form of the public repository for a problem', () => {
  render(
    <MemoryRouter initialEntries={['/settings?feedback=problem&from=%2Fcourses%2F4']}>
      <FeedbackPanel />
    </MemoryRouter>,
  )
  fireEvent.change(screen.getByLabelText('Was wolltest du tun?'), { target: { value: 'PDF öffnen' } })
  fireEvent.change(screen.getByLabelText('Deine Beschreibung'), { target: { value: 'Die Seite bleibt leer.' } })
  const url = issueLink()
  expect(url.origin + url.pathname).toBe('https://github.com/EinfachMxrc/unios-app/issues/new')
  expect(url.searchParams.get('template')).toBe('bug.yml')
  expect(url.searchParams.get('steps')).toContain('/courses/4')
  expect(url.searchParams.get('steps')).toContain('PDF öffnen')
  expect(url.searchParams.get('expected')).toBe('Die Seite bleibt leer.')
})

it('uses the idea form when an improvement is suggested', () => {
  render(
    <MemoryRouter initialEntries={['/settings']}>
      <FeedbackPanel />
    </MemoryRouter>,
  )
  fireEvent.change(screen.getByLabelText('Deine Beschreibung'), { target: { value: 'Dunkles PDF' } })
  const url = issueLink()
  expect(url.searchParams.get('template')).toBe('idea.yml')
  expect(url.searchParams.get('idea')).toBe('Dunkles PDF')
})

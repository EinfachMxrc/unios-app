// SPDX-License-Identifier: AGPL-3.0-or-later
// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { MemoryRouter, useLocation } from 'react-router-dom'
import { InAppLinks } from './InAppLinks'

vi.mock('@/lib/desktop', () => ({ isDesktopApp: () => true }))
afterEach(cleanup)
function Location() {
  return (
    <output data-testid="location">
      {useLocation().pathname}
      {useLocation().search}
    </output>
  )
}
function mount() {
  render(
    <MemoryRouter initialEntries={['/notes']}>
      <InAppLinks />
      <Location />
      <div
        className="studio-document"
        contentEditable
        suppressContentEditableWarning
        onClick={(event) => event.preventDefault()}
      >
        <a href="/notes?id=fictional" target="_blank">
          Zur Kursübersicht
        </a>
      </div>
    </MemoryRouter>,
  )
}

describe('note navigation and native new-window requests', () => {
  it('routes an editing link before the editor consumes its click', () => {
    mount()
    fireEvent.click(screen.getByRole('link', { name: 'Zur Kursübersicht' }))
    expect(screen.getByTestId('location').textContent).toBe('/notes?id=fictional')
  })
  it('routes modifier clicks in the desktop editor without a new window', () => {
    mount()
    fireEvent.click(screen.getByRole('link'), { metaKey: true })
    expect(screen.getByTestId('location').textContent).toBe('/notes?id=fictional')
  })
  it('accepts only real screens on the current origin from the native fallback', () => {
    mount()
    for (const detail of [
      'https://example.org/notes',
      'javascript:alert(1)',
      '/api/notes',
      '/files/41',
      { url: '/courses' },
    ]) {
      fireEvent(window, new CustomEvent('unios-open-link', { detail }))
      expect(screen.getByTestId('location').textContent).toBe('/notes')
    }
    fireEvent(
      window,
      new CustomEvent('unios-open-link', { detail: `${window.location.origin}/courses/1?tab=materials` }),
    )
    expect(screen.getByTestId('location').textContent).toBe('/courses/1?tab=materials')
  })
  it('removes the native listener when the app unmounts', () => {
    const remove = vi.spyOn(window, 'removeEventListener')
    mount()
    cleanup()
    expect(remove).toHaveBeenCalledWith('unios-open-link', expect.any(Function))
    remove.mockRestore()
  })
})

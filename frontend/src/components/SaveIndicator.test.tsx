// SPDX-License-Identifier: AGPL-3.0-or-later
// @vitest-environment jsdom

import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, expect, it } from 'vitest'
import { SaveIndicator } from './SaveIndicator'

afterEach(cleanup)

it('announces ordinary states politely and shows the message', () => {
  render(<SaveIndicator phase="saved" message="Gespeichert" />)
  const status = screen.getByRole('status')
  expect(status.textContent).toBe('Gespeichert')
  expect(status.className).toContain('save-saved')
})

it('treats an error as an alert, not as a status', () => {
  render(<SaveIndicator phase="error" message="Speichern fehlgeschlagen" />)
  expect(screen.getByRole('alert').textContent).toBe('Speichern fehlgeschlagen')
  expect(screen.queryByRole('status')).toBeNull()
})

it('only spins while saving and keeps the decorative icon hidden from screen readers', () => {
  const { container, rerender } = render(<SaveIndicator phase="saving" message="Speichert …" />)
  expect(container.querySelector('svg')?.getAttribute('aria-hidden')).toBe('true')
  expect(container.querySelector('svg')?.getAttribute('class')).toContain('action-feedback-spinner')
  rerender(<SaveIndicator phase="local" message="Nur lokal gespeichert" />)
  expect(container.querySelector('svg')?.getAttribute('class') ?? '').not.toContain('action-feedback-spinner')
})

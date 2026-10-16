// SPDX-License-Identifier: AGPL-3.0-or-later
// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { NoteTemplates } from './NoteTemplates'
vi.mock('@/i18n/useT', () => ({ useT: () => ({ t: (key: string) => key }) }))
afterEach(cleanup)

it('offers no replacement actions when an existing draft has content', () => {
  render(<NoteTemplates title="My title" body="My newer draft" disabled={false} onChoose={vi.fn()} />)
  expect(screen.queryByRole('button')).toBeNull()
})

it('retains an existing title when a scaffold is explicitly selected', () => {
  const choose = vi.fn()
  render(<NoteTemplates title="My title" body="" disabled={false} onChoose={choose} />)
  fireEvent.click(screen.getByRole('button', { name: 'pages.lectureTemplate' }))
  expect(choose).toHaveBeenCalledWith('My title', expect.any(String))
})

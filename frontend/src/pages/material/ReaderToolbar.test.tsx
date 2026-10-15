// SPDX-License-Identifier: AGPL-3.0-or-later
// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { ReaderToolbar } from './ReaderToolbar'
import type { useReaderSearch } from './useReaderSearch'

vi.mock('@/i18n/useT', () => ({ useT: () => ({ t: (key: string) => key }) }))

afterEach(cleanup)

const search = { input: '', setInput: vi.fn(), search: vi.fn(), clear: vi.fn(), searchedTerm: '' } as unknown as ReturnType<typeof useReaderSearch>

function renderToolbar(onZoomTo = vi.fn()) {
  render(<ReaderToolbar page={1} pages={4} ready goToPage={vi.fn()} pageOverview={false} onToggleOverview={vi.fn()}
    notesExpanded={false} onOpenNotes={vi.fn()} search={search} pageWidth={760} fitWidth={false}
    onZoom={vi.fn()} onZoomTo={onZoomTo} onFitWidth={vi.fn()} originalColors={false} onToggleColors={vi.fn()} />)
  return { onZoomTo, field: screen.getByRole('textbox', { name: 'zoomLevelAria' }) as HTMLInputElement }
}

it('shows the zoom level and applies a typed one on Enter', () => {
  const { onZoomTo, field } = renderToolbar()
  expect(field.value).toBe('100')
  fireEvent.focus(field)
  fireEvent.change(field, { target: { value: '150' } })
  fireEvent.keyDown(field, { key: 'Enter' })
  fireEvent.blur(field)
  expect(onZoomTo).toHaveBeenCalledWith(1140)
})

it('keeps the zoom when the typed value is discarded with Escape or empty', () => {
  const { onZoomTo, field } = renderToolbar()
  fireEvent.focus(field)
  fireEvent.change(field, { target: { value: '300' } })
  fireEvent.keyDown(field, { key: 'Escape' })
  fireEvent.blur(field)
  fireEvent.focus(field)
  fireEvent.change(field, { target: { value: '' } })
  fireEvent.blur(field)
  expect(onZoomTo).not.toHaveBeenCalled()
  expect(field.value).toBe('100')
})

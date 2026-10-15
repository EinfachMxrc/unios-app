// SPDX-License-Identifier: AGPL-3.0-or-later
// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { ApiError } from '@/api'
import { FileViewer } from './FileViewer'
import { languageFor } from './CodeView'

const content = vi.hoisted(() => ({ value: { isPending: false, error: null as unknown, data: '' as unknown } }))
vi.mock('./useFileContent', () => ({ useFileContent: () => content.value }))
vi.mock('@/i18n/useT', () => ({
  useT: () => ({
    t: (key: string, values: Record<string, unknown> = {}) =>
      `${key}${Object.keys(values).length ? JSON.stringify(values) : ''}`,
  }),
}))

beforeEach(() => {
  content.value = { isPending: false, error: null, data: '' }
})
afterEach(cleanup)

it('shows code with line numbers and its language, and highlights keywords', () => {
  content.value.data = 'def quadrat(x):\n    return x * x\n'
  const { container } = render(<FileViewer versionId={4} kind="code" filename="aufgabe1.py" />)
  expect(screen.getByText('aufgabe1.py · python')).toBeTruthy()
  expect(container.querySelector('.code-view-lines')?.textContent).toBe('1\n2\n')
  expect(container.querySelector('.hljs-keyword')?.textContent).toBe('def')
  fireEvent.click(screen.getByRole('button', { name: /viewerWrap/ }))
  expect(container.querySelector('.code-view-lines')).toBeNull()
})

it('turns a semicolon CSV into a table with a header row', () => {
  content.value.data = 'Modul;Note\nAnalysis;1,3\n'
  render(<FileViewer versionId={5} kind="table" filename="noten.csv" />)
  expect(screen.getAllByRole('columnheader').map((cell) => cell.textContent)).toEqual(['', 'Modul', 'Note'])
  expect(screen.getByRole('cell', { name: '1,3' })).toBeTruthy()
})

it('says when a file is too large to show', () => {
  content.value = { isPending: false, error: new ApiError('zu groß', 413), data: undefined }
  render(
    <MemoryRouter>
      <FileViewer versionId={6} kind="code" filename="dump.sql" />
    </MemoryRouter>,
  )
  expect(screen.getByText('viewerTooLarge')).toBeTruthy()
})

it('plays media and shows images from the viewer route', () => {
  const { container, rerender } = render(<FileViewer versionId={7} kind="video" filename="vortrag.mp4" />)
  expect(container.querySelector('video')?.getAttribute('src')).toBe('/files/7/view')
  rerender(<FileViewer versionId={8} kind="image" filename="tafel.png" />)
  expect(screen.getByRole('img', { name: 'tafel.png' }).getAttribute('src')).toBe('/files/8/view')
})

it('falls back to plain text for languages the highlighter does not know', () => {
  expect(languageFor('Main.java')).toBe('java')
  expect(languageFor('Makefile')).toBe('makefile')
  expect(languageFor('schaltung.vhd')).toBe('plaintext')
})

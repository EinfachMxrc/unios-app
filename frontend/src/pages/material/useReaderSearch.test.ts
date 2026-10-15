// SPDX-License-Identifier: AGPL-3.0-or-later
// @vitest-environment jsdom

import { act, cleanup, renderHook } from '@testing-library/react'
import type { FormEvent } from 'react'
import type { PDFDocumentProxy } from 'pdfjs-dist'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { clearWorkspace } from '@/lib/workspaceState'
import { useReaderSearch } from './useReaderSearch'

function documentWith(pages: string[], gate?: Promise<void>) {
  return {
    numPages: pages.length,
    getPage: vi.fn(async (number: number) => {
      if (gate) await gate
      return { getTextContent: async () => ({ items: [{ str: pages[number - 1] }] }) }
    }),
  } as unknown as PDFDocumentProxy
}
const submit = { preventDefault: () => undefined } as FormEvent<HTMLFormElement>

beforeEach(clearWorkspace)
afterEach(() => {
  cleanup()
  clearWorkspace()
})

function setup(pdf: PDFDocumentProxy, page = 1) {
  const goToPage = vi.fn()
  const hook = renderHook((props) => useReaderSearch(props), {
    initialProps: { versionId: 7, pdfDocument: pdf, page, goToPage },
  })
  return { goToPage, ...hook }
}

it('finds matching pages, jumps to the first and steps through the hits', async () => {
  const { result, goToPage, rerender } = setup(documentWith(['Rekursion', 'nichts', 'Basisfall der Rekursion']))
  act(() => result.current.setInput('rekursion'))
  await act(() => result.current.search(submit))
  expect(result.current.status).toBe('done')
  expect(result.current.results).toEqual([
    { page: 1, count: 1 },
    { page: 3, count: 1 },
  ])
  expect(goToPage).toHaveBeenLastCalledWith(1)
  rerender({
    versionId: 7,
    pdfDocument: documentWith(['Rekursion', 'nichts', 'Basisfall der Rekursion']),
    page: 1,
    goToPage,
  })
  act(() => result.current.move(1))
  expect(goToPage).toHaveBeenLastCalledWith(3)
})

it('ignores terms shorter than two characters', async () => {
  const pdf = documentWith(['a'])
  const { result } = setup(pdf)
  act(() => result.current.setInput('a'))
  await act(() => result.current.search(submit))
  expect(pdf.getPage).not.toHaveBeenCalled()
  expect(result.current.status).toBe('idle')
})

it('lets a clear win over a search that is still running', async () => {
  let release = () => undefined as void
  const gate = new Promise<void>((resolve) => {
    release = resolve
  })
  const { result, goToPage } = setup(documentWith(['Rekursion'], gate))
  act(() => result.current.setInput('rekursion'))
  let running: Promise<void> = Promise.resolve()
  act(() => {
    running = result.current.search(submit)
  })
  expect(result.current.status).toBe('searching')
  act(() => result.current.clear())
  release()
  await act(() => running)
  expect(result.current.status).toBe('idle')
  expect(result.current.results).toEqual([])
  expect(goToPage).not.toHaveBeenCalled()
})

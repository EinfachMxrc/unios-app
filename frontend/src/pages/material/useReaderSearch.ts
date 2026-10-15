// SPDX-License-Identifier: AGPL-3.0-or-later

import { useEffect, useLayoutEffect, useRef, useState, type FormEvent } from 'react'
import type { PDFDocumentProxy } from 'pdfjs-dist'
import { useWorkspaceState } from '@/lib/workspaceState'
import { countMatches, extractPageText, nextSearchResult, type PdfSearchResult } from './pdfSearch'

export type ReaderSearchStatus = 'idle' | 'searching' | 'done' | 'error'

const emptyResults: PdfSearchResult[] = []

/**
 * Full-text search inside the open PDF. Input, term and hits survive a trip away
 * from the reader; a newer search or leaving the page cancels a running one.
 */
export function useReaderSearch({
  versionId,
  pdfDocument,
  page,
  goToPage,
}: {
  versionId: number
  pdfDocument: PDFDocumentProxy | null
  page: number
  goToPage: (page: number) => void
}) {
  const [input, setInput] = useWorkspaceState(`pdf:${versionId}:searchInput`, '')
  const [searchedTerm, setSearchedTerm] = useWorkspaceState(`pdf:${versionId}:searchedTerm`, '')
  const [results, setResults] = useWorkspaceState(`pdf:${versionId}:results`, emptyResults)
  const [status, setStatus] = useState<ReaderSearchStatus>(searchedTerm ? 'done' : 'idle')
  const [progress, setProgress] = useState(0)
  const sequence = useRef(0)
  const jump = useRef(goToPage)
  useLayoutEffect(() => {
    jump.current = goToPage
  })
  useEffect(
    () => () => {
      sequence.current += 1
    },
    [],
  )

  function clear() {
    sequence.current += 1
    setInput('')
    setSearchedTerm('')
    setResults([])
    setStatus('idle')
    setProgress(0)
  }

  async function search(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const term = input.trim().toLocaleLowerCase('de-DE')
    if (!pdfDocument || term.length < 2) return
    const run = ++sequence.current
    setSearchedTerm('')
    setResults([])
    setStatus('searching')
    setProgress(0)
    try {
      const found: PdfSearchResult[] = []
      for (let pageNumber = 1; pageNumber <= pdfDocument.numPages; pageNumber += 1) {
        const pdfPage = await pdfDocument.getPage(pageNumber)
        const content = await pdfPage.getTextContent()
        if (run !== sequence.current) return
        setProgress(pageNumber)
        const count = countMatches(extractPageText(content.items), term)
        if (count) found.push({ page: pageNumber, count })
      }
      if (run !== sequence.current) return
      setResults(found)
      setSearchedTerm(input.trim())
      setStatus('done')
      if (found.length) jump.current(found[0].page)
    } catch (cause) {
      if (run === sequence.current) {
        setStatus('error')
        console.error('PDF-Suche fehlgeschlagen', cause)
      }
    }
  }

  function move(direction: -1 | 1) {
    const next = nextSearchResult(results, page, direction)
    if (next) jump.current(next.page)
  }

  return { input, setInput, searchedTerm, results, status, progress, clear, search, move }
}

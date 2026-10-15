// SPDX-License-Identifier: AGPL-3.0-or-later

import { useEffect, useRef, useState } from 'react'
import type { Selection } from './ReaderParts'
import { parseClip } from './PdfClipTool'
import { findPassage, pageRects, parseMark, type PassageRects } from './passageLink'

/** How long to wait for a page's text to render before settling for the page itself. */
const TEXT_WAIT_MS = 6000
const TEXT_POLL_MS = 150
/** The passage lands a little above the middle, where the eye starts reading. */
const READING_HEIGHT = 0.3

export type CitedPassage = Selection & { cited: true }

type Citation = { page: number; rects: PassageRects | null; quote: string | null }

/** What a reader link points at: a page, and maybe an exact passage or a quote to look for. */
export function readCitation(search: string): Citation | null {
  const params = new URLSearchParams(search)
  const page = Number(params.get('page'))
  if (!Number.isSafeInteger(page) || page < 1) return null
  const clip = parseClip(params.get('clip'))
  const rects = parseMark(params.get('mark')) ?? (clip ? [[clip.x, clip.y, clip.x + clip.width, clip.y + clip.height]] : null)
  const quote = params.get('quote')?.replace(/\s+/g, ' ').trim() || null
  return rects || quote ? { page, rects, quote: rects ? null : quote } : null
}

function pageElement(page: number) {
  return document.querySelector<HTMLElement>(`[data-material-page="${page}"]`)
}

/**
 * The page was just scrolled to its top. A passage further down moves up to
 * where reading starts; one near the top stays put, so the page itself (and
 * the page counter) stays where it is.
 */
function reveal(page: number, rects: PassageRects) {
  const box = pageElement(page)?.getBoundingClientRect()
  if (!box) return
  const top = Math.min(...rects.map(rect => rect[1]))
  const below = box.top + top * box.height - window.innerHeight * READING_HEIGHT
  if (below > 0) window.scrollBy({ top: below, behavior: 'instant' })
}

/** Looks for the quote once the page's text layer is there; gives up quietly after a while. */
function searchText(page: number, quote: string, found: (rects: PassageRects) => void): () => void {
  const started = Date.now()
  let timer = 0
  const attempt = () => {
    const element = pageElement(page)
    const layer = element?.querySelector('.textLayer')
    const range = layer?.textContent?.trim() ? findPassage(layer, quote) : null
    const rects = range && element ? pageRects(range.getClientRects(), element.getBoundingClientRect()) : []
    if (rects.length) return found(rects)
    // The page's text is there but the quote is not: the page alone has to do.
    if (layer?.textContent?.trim() && !range) return
    if (Date.now() - started < TEXT_WAIT_MS) timer = window.setTimeout(attempt, TEXT_POLL_MS)
  }
  attempt()
  return () => window.clearTimeout(timer)
}

/**
 * Shows the passage a link cites: the exact spot when the link carries it
 * (mark or clip), otherwise the quoted text found on the page. Runs once the
 * reader has restored its position, and again whenever a link is opened
 * while the reader is already showing this document, even the same link a
 * second time (each click is a new navigation, so `navigationKey` changes).
 */
export function useCitedPassage({ search, navigationKey, ready, enabled, goToPage }: {
  search: string; navigationKey: string; ready: boolean; enabled: boolean; goToPage: (page: number) => void
}): CitedPassage | null {
  const [passage, setPassage] = useState<CitedPassage | null>(null)
  const jump = useRef(goToPage)
  useEffect(() => { jump.current = goToPage })
  useEffect(() => {
    const citation = enabled && ready ? readCitation(search) : null
    setPassage(null)
    if (!citation) return
    jump.current(citation.page)
    const show = (rects: PassageRects) => {
      setPassage({ quote: citation.quote ?? '', page: citation.page, rects, cited: true })
      reveal(citation.page, rects)
    }
    if (citation.rects) {
      const frame = requestAnimationFrame(() => show(citation.rects!))
      return () => cancelAnimationFrame(frame)
    }
    return searchText(citation.page, citation.quote!, show)
  }, [search, navigationKey, ready, enabled])
  return passage
}

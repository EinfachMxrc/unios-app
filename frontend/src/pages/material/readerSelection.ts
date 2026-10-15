// SPDX-License-Identifier: AGPL-3.0-or-later

import type { Selection } from './ReaderParts'
import { pageRects } from './passageLink'

export const MIN_QUOTE_LENGTH = 2
export const MAX_QUOTE_LENGTH = 1000

export type ReaderSelectionResult =
  | { kind: 'selection'; selection: Selection }
  /** Nothing usable was selected; clear quietly. */
  | { kind: 'empty' }
  /** Text was selected but breaks the rules (length, more than one page): tell the user. */
  | { kind: 'constraint' }

/**
 * Turns the browser selection into a page-relative quote. Rects are stored as
 * fractions of the page, so they stay right at every zoom level.
 */
export function readReaderSelection(selected: globalThis.Selection | null): ReaderSelectionResult {
  const quote = selected?.toString().replace(/\s+/g, ' ').trim() ?? ''
  if (quote.length < MIN_QUOTE_LENGTH || quote.length > MAX_QUOTE_LENGTH || !selected?.anchorNode || !selected.focusNode)
    return quote ? { kind: 'constraint' } : { kind: 'empty' }
  const anchorPage = selected.anchorNode.parentElement?.closest('[data-material-page]')
  const focusPage = selected.focusNode.parentElement?.closest('[data-material-page]')
  if (!anchorPage || anchorPage !== focusPage) return { kind: 'constraint' }
  const rects = pageRects(selected.getRangeAt(0).getClientRects(), anchorPage.getBoundingClientRect())
  if (!rects.length) return { kind: 'empty' }
  return { kind: 'selection', selection: { quote, page: Number(anchorPage.getAttribute('data-material-page')), rects } }
}

/** Drops the browser highlight only if it still shows the quote that was just saved. */
export function clearSavedBrowserSelection(quote: string) {
  const range = window.getSelection()
  if (range?.toString().replace(/\s+/g, ' ').trim() === quote) range.removeAllRanges()
}

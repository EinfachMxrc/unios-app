// SPDX-License-Identifier: AGPL-3.0-or-later

/** A passage on a page: rectangles [left, top, right, bottom] as fractions of the page. */
export type PassageRects = number[][]

/** Enough rectangles for a long paragraph, short enough for a readable link. */
const MAX_RECTS = 24
const PRECISION = 10_000

const round = (value: number) => Math.round(value * PRECISION) / PRECISION

function validRect(rect: number[]): boolean {
  if (rect.length !== 4 || !rect.every(value => Number.isFinite(value) && value >= 0 && value <= 1.000001)) return false
  return rect[2] > rect[0] && rect[3] > rect[1]
}

/** Writes a passage into a link: "x1,y1,x2,y2;…", four decimals each. */
export function encodeMark(rects: PassageRects): string | null {
  const kept = rects.filter(validRect).slice(0, MAX_RECTS)
  return kept.length ? kept.map(rect => rect.map(round).join(',')).join(';') : null
}

/** Reads a passage back from a link; anything malformed means "no exact place". */
export function parseMark(value: string | null): PassageRects | null {
  if (!value || value.length > MAX_RECTS * 32) return null
  const rects = value.split(';').map(part => part.split(',').map(Number))
  return rects.length <= MAX_RECTS && rects.every(validRect) ? rects : null
}

/** Client rectangles of a range or selection, as fractions of its page box. */
export function pageRects(rects: Iterable<DOMRect>, page: DOMRect): PassageRects {
  const fraction = (value: number) => Math.max(0, Math.min(1, value))
  return Array.from(rects)
    .filter(rect => rect.width > 1 && rect.height > 1)
    .map(rect => [
      fraction((rect.left - page.left) / page.width),
      fraction((rect.top - page.top) / page.height),
      fraction((rect.right - page.left) / page.width),
      fraction((rect.bottom - page.top) / page.height),
    ])
}

/** Single characters, so a match index maps back to one place in the page text. */
function fold(char: string): string {
  const lower = char.toLowerCase()
  return lower.length === 1 ? lower : char
}

/** The shortest start of a quote still worth looking for when the whole quote is not on the page. */
const MIN_HEAD = 24

/**
 * Finds a quoted passage in a page's text layer and returns it as a range.
 * Spacing and case are ignored, since PDF text breaks lines and words freely.
 * When the whole quote is not found (a hyphenated line break, say), its
 * beginning still marks the place.
 */
export function findPassage(root: Element, quote: string): Range | null {
  const needle = Array.from(quote.replace(/\s+/g, '')).map(fold).join('')
  if (needle.length < 2) return null
  const places: { node: Text; offset: number }[] = []
  let text = ''
  const walker = root.ownerDocument.createTreeWalker(root, NodeFilter.SHOW_TEXT)
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    const value = node.nodeValue ?? ''
    for (let offset = 0; offset < value.length; offset++) {
      if (/\s/.test(value[offset])) continue
      text += fold(value[offset])
      places.push({ node: node as Text, offset })
    }
  }
  let length = needle.length
  let at = text.indexOf(needle)
  for (let head = Math.floor(needle.length / 2); at < 0 && head >= MIN_HEAD; head = Math.floor(head / 2)) {
    length = head
    at = text.indexOf(needle.slice(0, head))
  }
  if (at < 0) return null
  const range = root.ownerDocument.createRange()
  range.setStart(places[at].node, places[at].offset)
  const end = places[at + length - 1]
  range.setEnd(end.node, end.offset + 1)
  return range
}

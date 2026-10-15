// SPDX-License-Identifier: AGPL-3.0-or-later

/** One page's search hit count, as shown in the MaterialPage in-document search. */
export type PdfSearchResult = { page: number; count: number }

/** Case-insensitive (German-aware), non-overlapping occurrence count of `term` in `text`. */
export function countMatches(text: string, term: string): number {
  if (!term) return 0
  const haystack = text.toLocaleLowerCase('de-DE')
  const needle = term.toLocaleLowerCase('de-DE')
  let count = 0
  let index = haystack.indexOf(needle)
  while (index >= 0) {
    count += 1
    index = haystack.indexOf(needle, index + needle.length)
  }
  return count
}

/**
 * Joins a react-pdf/pdf.js `TextContent.items` array into a single search
 * string. Only text items carry a `str` field; marked-content items do not
 * and are treated as empty.
 */
export function extractPageText(items: readonly unknown[]): string {
  return items
    .map((item) => (item && typeof item === 'object' && 'str' in item ? String((item as { str: unknown }).str) : ''))
    .join(' ')
}

/** Picks the next (or previous, for direction -1) search hit relative to the current page, wrapping around. */
export function nextSearchResult(
  results: readonly PdfSearchResult[],
  currentPage: number,
  direction: -1 | 1,
): PdfSearchResult | undefined {
  if (!results.length) return undefined
  return direction === 1
    ? (results.find((result) => result.page > currentPage) ?? results[0])
    : ([...results].reverse().find((result) => result.page < currentPage) ?? results[results.length - 1])
}

/** Where the reader stands among the hit pages ("2 / 3"), plus all hits; index is null between hit pages. */
export function searchPosition(results: readonly PdfSearchResult[], page: number) {
  const at = results.findIndex((result) => result.page === page)
  return {
    index: at < 0 ? null : at + 1,
    pages: results.length,
    hits: results.reduce((sum, result) => sum + result.count, 0),
  }
}

type PlacedMark = { anchor: { page: number | null; status: string } }

/** Search hits and placed highlights per page, for the page overview. */
export function pageBadges(results: readonly PdfSearchResult[], marks: readonly PlacedMark[]) {
  const badges = new Map<number, { hits: number; marks: number }>()
  const entry = (page: number) => badges.get(page) ?? { hits: 0, marks: 0 }
  for (const result of results) badges.set(result.page, { ...entry(result.page), hits: result.count })
  for (const mark of marks) {
    if (mark.anchor.status !== 'matched' || mark.anchor.page === null) continue
    const current = entry(mark.anchor.page)
    badges.set(mark.anchor.page, { ...current, marks: current.marks + 1 })
  }
  return badges
}

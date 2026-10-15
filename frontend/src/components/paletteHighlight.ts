// SPDX-License-Identifier: AGPL-3.0-or-later

export type TextSegment = { text: string; match: boolean }

/**
 * Splits `text` into the parts that match the typed query and the rest, so a
 * result can show why it was found. Matching ignores case and treats every
 * whitespace-separated word of the query on its own, like the search itself.
 */
export function highlightSegments(text: string, query: string, locale?: string): TextSegment[] {
  const words = query.trim().split(/\s+/).filter(Boolean)
  if (!words.length || !text) return [{ text, match: false }]
  const lower = text.toLocaleLowerCase(locale)
  const marked = new Array<boolean>(text.length).fill(false)
  for (const word of words) {
    const needle = word.toLocaleLowerCase(locale)
    for (let index = lower.indexOf(needle); index >= 0; index = lower.indexOf(needle, index + needle.length)) {
      marked.fill(true, index, index + needle.length)
    }
  }
  const segments: TextSegment[] = []
  for (let index = 0; index < text.length; index += 1) {
    const last = segments[segments.length - 1]
    if (last && last.match === marked[index]) last.text += text[index]
    else segments.push({ text: text[index], match: marked[index] })
  }
  return segments
}

// SPDX-License-Identifier: AGPL-3.0-or-later

/** Normalize only supported workspace links on this app's origin. */
export function internalNoteHref(href: string | null, origin = window.location.origin): string | null {
  if (!href || href.includes('\\') || [...href].some((char) => char.charCodeAt(0) <= 32)) return null
  let localHref = href
  if (/^https?:\/\//i.test(href)) {
    try {
      const url = new URL(href)
      if (url.origin !== origin || url.username || url.password) return null
      localHref = `${url.pathname}${url.search}${url.hash}`
    } catch {
      return null
    }
  }
  return /^\/(?:notes(?:\?|$)|courses\/|material\/|learning(?:\?|$)|deadlines(?:\?|$)|projects\/|assessment(?:\?|$)|coding(?:\?|$))/.test(
    localHref,
  )
    ? localHref
    : null
}

// SPDX-License-Identifier: AGPL-3.0-or-later

import { matchPath } from 'react-router-dom'
import { areaRoutes } from '@/components/sidebarCatalog'

/** Screens outside the sidebar areas; they mirror the extra routes in App.tsx. */
const STANDALONE_SCREENS = ['/welcome', '/import', '/setup']

/**
 * Only real app screens are routed in the app. Downloads (/files/…), API
 * responses and other server paths share the origin but are not screens.
 */
export function isAppScreen(pathname: string): boolean {
  return [...STANDALONE_SCREENS, ...areaRoutes.map((route) => route.path)].some((path) =>
    matchPath({ path, end: true }, pathname),
  )
}
/** The longest quote a source link carries; enough to find the passage again. */
export const CITED_QUOTE_LIMIT = 300

interface ClickInfo {
  button: number
  ctrlKey: boolean
  metaKey: boolean
  shiftKey: boolean
  altKey: boolean
}

/**
 * Where a click on a link should go inside the app, or null when the browser
 * (or the desktop shell) should handle it. Links to this app always stay in
 * the app, even when they were written with target="_blank", as note links
 * are. In a plain browser, modifier clicks still open a new tab on purpose;
 * the desktop app has no tabs, so there they stay in the app too.
 */
export function inAppTarget(
  link: HTMLAnchorElement,
  click: ClickInfo,
  { desktop, origin }: { desktop: boolean; origin: string },
): string | null {
  if (click.button !== 0 || link.hasAttribute('download')) return null
  // Same-page anchors are not navigation. Links inside the note editor are
  // followed on click too: the browser would not follow them there at all, and
  // a quote's source link is meant to be clicked while writing beside the PDF.
  if ((link.getAttribute('href') ?? '').startsWith('#')) return null
  if (!desktop && (click.ctrlKey || click.metaKey || click.shiftKey || click.altKey)) return null
  let url: URL
  try {
    url = new URL(link.getAttribute('href') ?? '', origin)
  } catch {
    return null
  }
  if (url.origin !== origin || !isAppScreen(url.pathname)) return null
  return `${url.pathname}${url.search}${url.hash}`
}

/**
 * The website a click should open in the system browser (desktop app only),
 * or null. Every link to another site counts, not only target="_blank": the
 * app window has no back button, so following a plain link would strand the
 * user there. Downloads are left alone.
 */
export function externalTarget(link: HTMLAnchorElement, origin: string): string | null {
  if (link.hasAttribute('download')) return null
  let url: URL
  try {
    url = new URL(link.getAttribute('href') ?? '', origin)
  } catch {
    return null
  }
  if (url.origin === origin || (url.protocol !== 'http:' && url.protocol !== 'https:')) return null
  return url.href
}

/**
 * A note's source link right after a quote ("> passage" then "[PDF · 3](…)")
 * cites that passage. Returns the quoted text so the reader can find it.
 */
export function citedQuote(link: HTMLAnchorElement): string | null {
  const block = link.closest('p, li, div')
  const before = block?.previousElementSibling
  if (before?.tagName !== 'BLOCKQUOTE') return null
  const quote = (before.textContent ?? '').replace(/\s+/g, ' ').trim()
  return quote.length >= 2 ? quote.slice(0, CITED_QUOTE_LIMIT) : null
}

/** Adds the cited passage to a reader link that does not already point at an exact place. */
export function withCitedQuote(path: string, link: HTMLAnchorElement): string {
  const url = new URL(path, 'http://app.invalid')
  if (!/^\/material\/[1-9]\d*$/.test(url.pathname) || url.searchParams.has('mark') || url.searchParams.has('clip'))
    return path
  const quote = citedQuote(link)
  if (!quote) return path
  url.searchParams.set('quote', quote)
  return `${url.pathname}${url.search}${url.hash}`
}

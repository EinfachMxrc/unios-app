// SPDX-License-Identifier: AGPL-3.0-or-later

// Walks the user's own interactively-signed-in Outlook Web (OWA) window, read-only, to find
// new messages and read their sender/subject/date/body text — the fallback for institutions
// that block both mail forwarding and third-party OAuth app consent. Nothing here ever types,
// sends, deletes or flags anything; the native request guard in
// desktop/src-tauri/src/portal_crawl.rs refuses any non-GET request while a walk-through runs.
//
// OWA's exact DOM is not publicly documented and changes between Microsoft's rollouts, so the
// selectors below are a best-effort first pass built on OWA's known accessibility semantics
// (message rows exposed as ARIA `option`/`row` within a `listbox`/`grid`, the open message in a
// `role="main"` reading pane). `extractMessage` tries several fallbacks and simply returns
// `null` — skipping, not crashing — when none of them find enough to be useful. If a real
// mailbox turns out to need different selectors, only this file needs to change.

import type { CrawlBridge, PortalLink } from './portalCrawl'

export type ScrapedMessage = { messageKey: string; sender: string; subject: string; receivedAt: string | null; body: string }

const MAX_MESSAGES = 150
const MAX_EMPTY_SCROLLS = 3
const MAX_ROUNDS = 400
const MAILBOX = /^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/

/** A message-list row: visible, carries a sender/subject-looking label, not a folder or button. */
export function mailRowCandidate(link: PortalLink): boolean {
  if (!link.visible || !link.messageRow || !['option', 'row'].includes(link.role ?? '')) return false
  const text = link.text.trim()
  return text.length >= 4 && text.length <= 400
}

function parseHtml(html: string): Document {
  return new DOMParser().parseFromString(html, 'text/html')
}

function textOf(el: Element | null): string {
  return (el?.textContent ?? '').replace(/\s+/g, ' ').trim()
}

/** First element matching any selector in order; mirrors the "try several fallbacks" approach
 * used throughout because the real OWA markup cannot be verified ahead of time. */
function first(root: ParentNode, selectors: string[]): Element | null {
  for (const selector of selectors) {
    const found = root.querySelector(selector)
    if (found) return found
  }
  return null
}

const SENDER_SELECTORS = [
  '[role="main"] [role="heading"] + * [title*="@"]',
  '[role="main"] span[title*="@"]',
  '[role="main"] [aria-label*="@"]',
  'header [title*="@"]',
]
const SUBJECT_SELECTORS = ['[role="main"] [role="heading"]', '[role="main"] h1', '[role="main"] h2']
const BODY_SELECTORS = [
  '[role="main"] [aria-label="Message body"]',
  '[role="main"] [role="document"]',
  '[role="main"] iframe',
  '[role="main"]',
]
const DATE_SELECTORS = ['[role="main"] time[datetime]', '[role="main"] [title*=":"]']

/** Reads sender/subject/date/body out of a full-page HTML snapshot taken right after a message
 * row was clicked and the reading pane settled. Returns null when the page does not look like
 * an opened message at all (nothing worth storing), not when a field merely looks unusual. */
export function extractMessage(html: string, messageKey: string): ScrapedMessage | null {
  const doc = parseHtml(html)
  const main = doc.querySelector('[role="main"]') ?? doc.body
  if (!main) return null
  const subject = textOf(first(doc, SUBJECT_SELECTORS)).slice(0, 500)
  const senderField = first(doc, SENDER_SELECTORS)
  const senderAttr = senderField?.getAttribute('title') ?? senderField?.getAttribute('aria-label') ?? ''
  const senderMatch = senderAttr.match(/[^\s<>"']+@[^\s<>"']+\.[^\s<>"']+/) ?? textOf(senderField).match(/[^\s<>"']+@[^\s<>"']+\.[^\s<>"']+/)
  const sender = (senderMatch?.[0] ?? '').toLowerCase()
  const dateField = first(doc, DATE_SELECTORS)
  const dateText = dateField?.getAttribute('datetime') || dateField?.getAttribute('title') || ''
  const receivedAt = /^\d{4}-\d{2}-\d{2}T.*(?:Z|[+-]\d{2}:\d{2})$/i.test(dateText)
    && Number.isFinite(Date.parse(dateText)) ? dateText : null
  const bodyField = first(doc, BODY_SELECTORS)
  const body = textOf(bodyField).slice(0, 20_000)
  if (!MAILBOX.test(sender) || (!subject && !body)) return null
  return { messageKey, sender, subject: subject || '(Ohne Betreff)', receivedAt, body }
}

/** Walks the open OWA window: scrolls the message list into view row by row, opens each
 * unread-looking row once, records what `extractMessage` can read from it. Only reaches
 * whatever OWA has already rendered or loads via scrolling — there is no way to jump straight
 * to "everything", which matches reading an inbox by hand. */
export async function readMailWindow(
  bridge: CrawlBridge,
  seenKeys: ReadonlySet<string>,
  onProgress: (count: number) => void = () => undefined,
): Promise<{ messages: ScrapedMessage[]; partial: boolean }> {
  const start = await bridge.status()
  const address = new URL(start.url)
  if (start.hasPassword || address.protocol !== 'https:' || address.hostname !== 'outlook.office.com'
    || !address.pathname.startsWith('/mail')) throw new Error('login-required')
  if (!(await bridge.capabilities()).traversal) throw new Error('traversal-unavailable')
  const messages: ScrapedMessage[] = []
  const visitedThisRun = new Set<string>()
  let emptyScrolls = 0
  let partial = false
  let rounds = 0
  await bridge.guard(true, 0)
  try {
    for (let round = 0; round < MAX_ROUNDS && messages.length < MAX_MESSAGES; round += 1) {
      rounds = round + 1
      const listing = await bridge.links()
      const rows = listing.links.filter(mailRowCandidate)
      // The row's own label (sender/subject/preview/time, however OWA renders it) is the only
      // thing available both before a click (to skip already-known rows) and after (to key the
      // stored message), since the opened message's own stable id is not exposed to the DOM.
      const next = rows.find((row) => !visitedThisRun.has(row.text) && !seenKeys.has(row.text))
      if (!next) {
        if (emptyScrolls >= MAX_EMPTY_SCROLLS) break
        const scrolled = await bridge.scroll()
        if (!scrolled) emptyScrolls += 1
        continue
      }
      emptyScrolls = 0
      visitedThisRun.add(next.text)
      const clicked = await bridge.click(next.index, next.text)
      if (!clicked) {
        partial = true
        continue
      }
      await bridge.sleep(400)
      const snapshot = await bridge.snapshot()
      const extracted = extractMessage(snapshot.html, next.text)
      if (extracted) {
        messages.push(extracted)
        onProgress(messages.length)
      } else {
        partial = true
      }
    }
  } finally {
    await bridge.guard(false, 0)
  }
  return { messages, partial: partial || messages.length >= MAX_MESSAGES || rounds >= MAX_ROUNDS }
}

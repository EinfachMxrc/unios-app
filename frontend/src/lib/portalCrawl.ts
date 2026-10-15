// SPDX-License-Identifier: AGPL-3.0-or-later

// Walks through a university portal the user has signed in to, read-only, and collects the
// pages so they can be stored as anonymised samples. The desktop shell enforces the read-only
// rule for the browser (see desktop/src-tauri/src/portal_crawl.rs); the rules here decide what
// is worth opening and what is never opened.

export type PortalLink = {
  index: number
  text: string
  href: string
  visible: boolean
  role?: string
  messageRow?: boolean
}
export type PortalStatus = { url: string; ready: string; textLength: number; hasPassword: boolean }

export interface CrawlBridge {
  capabilities(): Promise<{ traversal: boolean }>
  links(): Promise<{ url: string; links: PortalLink[] }>
  status(): Promise<PortalStatus>
  snapshot(): Promise<{ url: string; title: string; html: string }>
  navigate(url: string): Promise<void>
  click(index: number, text: string): Promise<boolean>
  /** Scrolls the window's own most-scrollable container; true if it actually moved. */
  scroll(): Promise<boolean>
  guard(active: boolean, menuBudget: number): Promise<void>
  sleep(ms: number): Promise<void>
}

export type CrawledPage = { kind: string; html: string; label: string }
export type CrawlProgress = { visited: number; captured: number; label: string }
export type CrawlResult = { pages: CrawledPage[]; visited: number; skipped: number }
export type CrawlOptions = {
  currentKind?: string
  maxPages?: number
  maxVisits?: number
  maxPerKind?: number
  onProgress?: (progress: CrawlProgress) => void
  isCancelled?: () => boolean
}

export const MAX_PAGES = 24
export const MAX_VISITS = 45
export const MAX_PER_KIND = 3
export const SAMPLE_CHUNK = 30
const MIN_TEXT_LENGTH = 40
const SETTLE_POLLS = 16
const SETTLE_INTERVAL_MS = 500

// Entries that end a session or change something are never opened, whatever the page offers.
const FORBIDDEN =
  /anmeld|abmeld|logout|log out|sign out|ausloggen|save|delete|update|bezahl|l(ö|oe)sch|absend|einreich|drucken|print|download|export|passwort|password|datenschutz|impressum|cookie|kontakt/i
// Looking at the list of exam registrations is fine; the registration itself needs a form post.
const READ_ONLY_EXCEPTION = /pr(ü|ue)fungs?anmeldung/i

const KIND_RULES: Array<[string, RegExp]> = [
  ['blog', /blog|beitrag|artikel/i],
  ['timetable', /stundenplan|timetable|vorlesungsplan/i],
  ['events', /veranstaltung|event|termin/i],
  ['enrollment', /r(ü|ue)ckmeld|einschreib|immatrikul/i],
  ['news', /news|neuigkeit|meldung|aktuell/i],
  ['grades', /note|leistung|ergebnis|transcript/i],
  ['exams', /pr(ü|ue)fung/i],
  ['study_program', /studium|studiengang|studien/i],
]

export function isForbiddenLabel(label: string): boolean {
  return FORBIDDEN.test(label) && !READ_ONLY_EXCEPTION.test(label)
}

export function classifyLabel(label: string): string {
  return KIND_RULES.find(([, pattern]) => pattern.test(label))?.[0] ?? 'other'
}

function withoutHash(url: string): string {
  try {
    const parsed = new URL(url)
    parsed.hash = ''
    return parsed.href
  } catch {
    return url
  }
}

function sameHost(url: string, host: string): boolean {
  try {
    const parsed = new URL(url)
    return parsed.protocol === 'https:' && parsed.host === host
  } catch {
    return false
  }
}

export type Candidate = { link: PortalLink; kind: string }

/** The links worth opening from a page: visible, on the portal's host, not forbidden, ranked. */
export function pickCandidates(
  links: PortalLink[],
  host: string,
  seen: ReadonlySet<string>,
  currentUrl = '',
): Candidate[] {
  const unique = new Map<string, Candidate>()
  for (const link of links) {
    const text = link.text.trim()
    if (!link.visible || text.length < 2 || text.length > 80 || isForbiddenLabel(text)) continue
    if (link.href) {
      if (!sameHost(link.href, host) || /^(mailto|tel|javascript):/i.test(link.href)) continue
      const key = withoutHash(link.href)
      // A link that only points at an anchor of the page it is on leads nowhere new.
      if (seen.has(key) || link.href.endsWith('#') || (currentUrl && key === withoutHash(currentUrl))) continue
    }
    const key = link.href ? withoutHash(link.href) : `click:${text.toLowerCase()}`
    if (seen.has(key) || unique.has(key)) continue
    unique.set(key, { link, kind: classifyLabel(text) })
  }
  const known = [...unique.values()].filter((item) => item.kind !== 'other')
  const rest = [...unique.values()].filter((item) => item.kind === 'other')
  return [...known, ...rest.slice(0, 6)]
}

function fingerprint(html: string): string {
  let hash = 0
  const sample = `${html.length}:${html.slice(0, 4000)}:${html.slice(-1000)}`
  for (let index = 0; index < sample.length; index += 1) hash = (Math.imul(31, hash) + sample.charCodeAt(index)) | 0
  return String(hash)
}

async function settle(bridge: CrawlBridge): Promise<PortalStatus | null> {
  let previous = -1
  for (let attempt = 0; attempt < SETTLE_POLLS; attempt += 1) {
    await bridge.sleep(SETTLE_INTERVAL_MS)
    const status = await bridge.status().catch(() => null)
    if (!status) continue
    if (status.ready === 'complete' && status.textLength > 0 && status.textLength === previous) return status
    previous = status.textLength
  }
  return bridge.status().catch(() => null)
}

export async function crawlPortal(bridge: CrawlBridge, options: CrawlOptions = {}): Promise<CrawlResult> {
  const capabilities = await bridge.capabilities()
  // Inspect the open page without navigation or clicks when no native write guard exists.
  if (!capabilities.traversal) {
    if (options.isCancelled?.()) return { pages: [], visited: 0, skipped: 0 }
    const status = await settle(bridge)
    if (!status || status.hasPassword || status.textLength < MIN_TEXT_LENGTH || !status.url.startsWith('https://')) {
      return { pages: [], visited: 0, skipped: 1 }
    }
    if (options.isCancelled?.()) return { pages: [], visited: 0, skipped: 0 }
    const snapshot = await bridge.snapshot()
    if (!sameHost(snapshot.url, new URL(status.url).host)) return { pages: [], visited: 0, skipped: 1 }
    const kind = options.currentKind ?? 'start'
    options.onProgress?.({ visited: 0, captured: 1, label: snapshot.title })
    return { pages: [{ kind, html: snapshot.html, label: snapshot.title }], visited: 0, skipped: 0 }
  }
  const maxPages = options.maxPages ?? MAX_PAGES
  const maxVisits = options.maxVisits ?? MAX_VISITS
  const maxPerKind = options.maxPerKind ?? MAX_PER_KIND
  const pages: CrawledPage[] = []
  const perKind = new Map<string, number>()
  const seenUrls = new Set<string>()
  const seenPages = new Set<string>()
  let visited = 0
  let skipped = 0

  await bridge.guard(true, 0)
  try {
    const start = await bridge.status()
    const host = new URL(start.url).host
    seenUrls.add(withoutHash(start.url))

    const capture = async (kind: string, label: string): Promise<boolean> => {
      const status = await settle(bridge)
      if (!status || status.hasPassword || status.textLength < MIN_TEXT_LENGTH || !sameHost(status.url, host)) {
        skipped += 1
        return false
      }
      const snapshot = await bridge.snapshot()
      const key = fingerprint(snapshot.html)
      seenUrls.add(withoutHash(snapshot.url))
      if (seenPages.has(key) || (perKind.get(kind) ?? 0) >= maxPerKind) {
        skipped += 1
        return false
      }
      seenPages.add(key)
      perKind.set(kind, (perKind.get(kind) ?? 0) + 1)
      pages.push({ kind, html: snapshot.html, label })
      options.onProgress?.({ visited, captured: pages.length, label })
      return true
    }

    await capture('start', 'start')
    const sources: string[] = [start.url]
    // Level 0: the entries of the start page. Level 1: what the interesting pages link to.
    for (let level = 0; level < 2 && pages.length < maxPages; level += 1) {
      const nextSources: string[] = []
      for (const source of sources) {
        if (options.isCancelled?.() || visited >= maxVisits || pages.length >= maxPages) break
        await bridge.navigate(source)
        await settle(bridge)
        const listing = await bridge.links()
        let onSource = true
        for (const candidate of pickCandidates(listing.links, host, seenUrls, listing.url)) {
          if (options.isCancelled?.() || visited >= maxVisits || pages.length >= maxPages) break
          if ((perKind.get(candidate.kind) ?? 0) >= maxPerKind && candidate.kind !== 'other') continue
          visited += 1
          if (candidate.link.href) {
            seenUrls.add(withoutHash(candidate.link.href))
            await bridge.navigate(candidate.link.href)
            onSource = false
          } else {
            if (!onSource) {
              // Clicked entries are found by their number on the page they belong to.
              await bridge.navigate(source)
              await settle(bridge)
              await bridge.links()
              onSource = true
            }
            await bridge.guard(true, 1)
            const clicked = await bridge.click(candidate.link.index, candidate.link.text)
            await bridge.guard(true, 0)
            seenUrls.add(`click:${candidate.link.text.toLowerCase()}`)
            if (!clicked) {
              skipped += 1
              continue
            }
          }
          const stored = await capture(candidate.kind, candidate.link.text)
          const current = await bridge.status().catch(() => null)
          if (stored && level === 0 && current && candidate.kind !== 'other') nextSources.push(current.url)
          if (!candidate.link.href) {
            // A clicked entry cannot be reopened by address; go back to the page it was on.
            await bridge.navigate(source)
            await settle(bridge)
            await bridge.links()
            onSource = true
          }
        }
      }
      sources.splice(0, sources.length, ...nextSources)
      if (!sources.length) break
    }
  } finally {
    await bridge.guard(false, 0)
  }
  return { pages, visited, skipped }
}

export function chunkPages<T>(pages: T[], size = SAMPLE_CHUNK): T[][] {
  const chunks: T[][] = []
  for (let index = 0; index < pages.length; index += size) chunks.push(pages.slice(index, index + size))
  return chunks
}

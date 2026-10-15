// SPDX-License-Identifier: AGPL-3.0-or-later
import type { CrawlBridge, PortalLink } from './portalCrawl'

export type PrimussPage = { url: string; html: string; label: string }
const READ =
  /prüfung|pruefung|note|leistung|bescheid|nachricht|dokument|bescheinigung|studium|studien|übersicht|uebersicht|anzeigen|weiter|zurück|zurueck/i
const WRITE =
  /anmeld|abmeld|beantrag|registrier|änder|aender|bearbeit|speicher|lösch|loesch|logout|passwort|password|zahl|bezahl|absend|submit|confirm|delete|cancel|enroll|register|hochladen|upload/i
const FILE = /\.(pdf|docx?|xlsx?|odt|csv|txt)(\?|$)/i

export function primussCandidate(link: PortalLink, host: string): boolean {
  if (!link.visible || !READ.test(link.text) || WRITE.test(link.text) || FILE.test(link.href)) return false
  if (!link.href || /^javascript:/i.test(link.href)) return true
  try {
    const url = new URL(link.href)
    if (url.protocol !== 'https:' || url.host !== host || url.username || url.password) return false
    if (WRITE.test(url.pathname)) return false
    let safe = true
    url.searchParams.forEach((value, key) => {
      if (/^(action|mode|operation|cmd)$/i.test(key) && !/^(view|read|show|list|display|overview)$/i.test(value))
        safe = false
    })
    return safe
  } catch {
    return false
  }
}

/** Walk expanded menus in place: they can share one URL and expose new child links. */
export async function readPrimussWindow(bridge: CrawlBridge, onProgress: (count: number) => void = () => undefined) {
  const pages: PrimussPage[] = []
  const seen = new Set<string>()
  const seenPages = new Set<string>()
  let partial = false
  const start = await bridge.status()
  if (start.hasPassword) throw new Error('login-required')
  const host = new URL(start.url).host
  async function settled() {
    let previous = -1
    for (let attempt = 0; attempt < 16; attempt += 1) {
      await bridge.sleep(500)
      const state = await bridge.status()
      if (state.hasPassword || new URL(state.url).host !== host) throw new Error('login-required')
      if (state.ready === 'complete' && state.textLength === previous) return
      previous = state.textLength
    }
    partial = true
  }
  // No form submission budget: menu expansion and navigation must be reads.
  if (!(await bridge.capabilities()).traversal) {
    await settled()
    const snapshot = await bridge.snapshot()
    onProgress(1)
    return { pages: [{ ...snapshot, label: 'Übersicht' }], partial: true }
  }
  await bridge.guard(true, 0)
  try {
    async function walk(depth: number, label: string) {
      await settled()
      const snapshot = await bridge.snapshot()
      if (!seenPages.has(snapshot.html)) {
        seenPages.add(snapshot.html)
        pages.push({ ...snapshot, label })
        onProgress(pages.length)
      }
      const listing = await bridge.links()
      const candidates = listing.links.filter((link) => primussCandidate(link, host))
      if (depth >= 6 || pages.length >= 60) {
        partial ||= candidates.length > 0
        return
      }
      for (const candidate of candidates) {
        const key = `${listing.url}:${candidate.text}:${candidate.href}`
        if (seen.has(key)) continue
        seen.add(key)
        // Freshly discover the index because expanding a menu changes the DOM.
        const fresh = await bridge.links()
        const link = fresh.links.find(
          (item) => item.text === candidate.text && item.href === candidate.href && item.visible,
        )
        if (!link) {
          partial = true
          continue
        }
        const before = await bridge.snapshot()
        if (!(await bridge.click(link.index, link.text))) {
          partial = true
          continue
        }
        await settled()
        const after = await bridge.snapshot()
        if (before.html === after.html) {
          partial = true
          continue
        }
        await walk(depth + 1, link.text)
        if (pages.length >= 60) {
          partial = true
          break
        }
        // Real navigation needs a return; client-side menu expansions stay expanded.
        const current = await bridge.status()
        if (current.url !== listing.url) {
          await bridge.navigate(listing.url)
          await settled()
        }
      }
    }
    await walk(0, 'Übersicht')
  } finally {
    await bridge.guard(false, 0)
  }
  return { pages, partial: partial || pages.length <= 1 }
}

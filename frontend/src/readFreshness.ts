// SPDX-License-Identifier: AGPL-3.0-or-later

// Short in-memory reuse for navigation. Persistent offline caching is a separate
// allowlist. Unknown endpoints, host leases, access checks and live sessions stay
// immediately stale; their existing polling and mutation checks are unchanged.
const navigationReads = new Set([
  '/api/courses',
  '/api/overview',
  '/api/deadlines',
  '/api/notes/link-targets',
  '/api/entities/note',
  '/api/learning/practice',
  '/api/learning/practice/history',
  '/api/learning/topics',
  '/api/learning/modules',
  '/api/learning/weekly',
  '/api/learning/blocks',
  '/api/learning/questions',
  '/api/learning/cycles',
  '/api/addons/slots/learning.tools',
  '/api/learning/assessment/tasks',
  '/api/learning/assessment/progress',
  '/api/learning/coding/templates',
  '/api/learning/coding/tasks',
  '/api/anki/study/status',
  '/api/anki/study/due',
  '/api/anki/study/stats',
])

export function readFreshness(path: string): number {
  const pathname = path.split('?')[0]
  if (/^\/api\/courses\/[1-9]\d*$/.test(pathname)) return 30_000
  if (navigationReads.has(pathname)) return 30_000
  if (pathname === '/api/notifications') return 10_000
  if (pathname === '/api/sync/status') return 5_000
  return 0
}

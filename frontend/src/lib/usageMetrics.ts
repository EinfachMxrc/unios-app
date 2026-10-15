// SPDX-License-Identifier: AGPL-3.0-or-later
const KEY = 'unios-optional-usage-v1'
const AREAS = [
  'today',
  'courses',
  'deadlines',
  'notes',
  'search',
  'learning',
  'study',
  'settings',
  'system',
  'ai',
  'import',
  'other',
] as const
type Area = (typeof AREAS)[number]
export type UsageMetrics = { enabled: boolean; counters: Partial<Record<Area, number>> }
export function usageMetrics(): UsageMetrics {
  try {
    const value = JSON.parse(localStorage.getItem(KEY) ?? 'null') as UsageMetrics | null
    if (value?.enabled !== true) return { enabled: false, counters: {} }
    return {
      enabled: true,
      counters: Object.fromEntries(
        AREAS.flatMap((area) => {
          const count = value.counters?.[area]
          return Number.isSafeInteger(count) && count! > 0 && count! <= 1000000 ? [[area, count]] : []
        }),
      ),
    }
  } catch {
    return { enabled: false, counters: {} }
  }
}
export function allowUsageMetrics(enabled: boolean): void {
  try {
    localStorage.setItem(KEY, JSON.stringify({ enabled, counters: {} }))
  } catch {
    /* Storage denial disables telemetry. */
  }
}
export function recordPage(path: string): void {
  const value = usageMetrics()
  if (!value.enabled) return
  const first = path.split(/[/?#]/)[1]
  const area: Area = path === '/' ? 'today' : AREAS.includes(first as Area) ? (first as Area) : 'other'
  value.counters[area] = Math.min(1000000, (value.counters[area] ?? 0) + 1)
  try {
    localStorage.setItem(KEY, JSON.stringify(value))
  } catch {
    /* No remote fallback. */
  }
}

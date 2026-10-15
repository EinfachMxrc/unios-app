// SPDX-License-Identifier: AGPL-3.0-or-later

import type { components } from '@/generated/api'

export type OfflineSearchIndex = components['schemas']['OfflineSearchIndexView']
export type OfflineSearchItem = components['schemas']['OfflineSearchItemView']

function normalized(value: string): string {
  return value.normalize('NFKC').toLocaleLowerCase('de-DE')
}

const questionStopwords = new Set([
  'aber',
  'alle',
  'auch',
  'dass',
  'eine',
  'einem',
  'einen',
  'einer',
  'eines',
  'für',
  'haben',
  'hat',
  'hier',
  'kann',
  'man',
  'mit',
  'oder',
  'sind',
  'über',
  'und',
  'unter',
  'wann',
  'wird',
  'wurde',
  'werden',
  'welche',
  'welcher',
  'wenn',
])

export function searchOffline(
  index: OfflineSearchIndex,
  query: string,
  courseId = '',
  semesterId = '',
  kind = '',
): { hits: Array<OfflineSearchItem & { excerpt: string }>; total: number } {
  const raw = (normalized(query).match(/[\p{L}\p{N}_]+/gu) ?? []).slice(0, 10)
  const relevant =
    raw.length > 3 ? raw.filter((term) => term.length >= 4 && !questionStopwords.has(term)).slice(0, 8) : []
  const terms = relevant.length ? relevant : raw
  const allRequired = !relevant.length
  if (!terms.length) return { hits: [], total: 0 }
  const hits: Array<OfflineSearchItem & { excerpt: string }> = []
  let total = 0
  for (const item of index.items) {
    if (kind && item.kind !== kind) continue
    if (courseId && String(item.course_id) !== courseId) continue
    if (semesterId && String(item.semester_id) !== semesterId) continue
    const haystack = normalized(`${item.title} ${item.body}`)
    if (allRequired ? !terms.every((term) => haystack.includes(term)) : !terms.some((term) => haystack.includes(term)))
      continue
    total += 1
    if (hits.length >= 100) continue
    const body = item.body.replace(/\s+/g, ' ').trim()
    const first = normalized(body).indexOf(terms[0])
    const start = Math.max(0, first < 0 ? 0 : first - 60)
    const excerpt = `${start ? '…' : ''}${body.slice(start, start + 180)}${body.length > start + 180 ? '…' : ''}`
    hits.push({ ...item, excerpt })
  }
  return { hits, total }
}

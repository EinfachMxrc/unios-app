// SPDX-License-Identifier: AGPL-3.0-or-later

import type { QueryClient, QueryKey } from '@tanstack/react-query'
import { request } from '@/api'
import { studyDuePath, type StudyDueResponse } from '@/studyTypes'

/** URL strings are complete TanStack key elements; a global key is no prefix for scoped URLs. */
export function isStudyReadKey(key: QueryKey): boolean {
  return (
    key[0] === 'api' && typeof key[1] === 'string' && /^\/api\/anki\/study\/(?:status|stats|due)(?:\?|$)/.test(key[1])
  )
}

export function invalidateStudyReads(client: QueryClient, options: { progress?: boolean } = {}): Promise<void> {
  return client.invalidateQueries({
    predicate: (query) => {
      if (isStudyReadKey(query.queryKey)) return true
      const [domain, path] = query.queryKey
      return (
        options.progress === true &&
        domain === 'api' &&
        typeof path === 'string' &&
        /^\/api\/(?:learning\/(?:topics|modules|weekly|cycles|blocks)|analytics\/study|overview)(?:\?|$)/.test(path)
      )
    },
  })
}

/** A pre-replay pending fetch has no freshness guarantee, even with staleTime: 0. */
export async function fetchFreshStudyDue(
  client: QueryClient,
  deck: string,
  isCurrent: () => boolean = () => true,
): Promise<StudyDueResponse | null> {
  if (!isCurrent()) return null
  const path = studyDuePath(deck)
  const queryKey = ['api', path]
  await client.cancelQueries({ queryKey, exact: true })
  // A deck switch can supersede this initializer while cancellation settles.
  if (!isCurrent()) return null
  const result = await client.fetchQuery<StudyDueResponse>({
    queryKey,
    queryFn: ({ signal }) => request(path, { signal }),
    staleTime: 0,
    meta: { offlineCache: true },
  })
  return isCurrent() ? result : null
}

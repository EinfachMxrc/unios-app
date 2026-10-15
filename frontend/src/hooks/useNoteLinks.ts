// SPDX-License-Identifier: AGPL-3.0-or-later

import { createContext, useEffect, useMemo } from 'react'
import { useQueries, useQueryClient, type QueryClient } from '@tanstack/react-query'
import { request, useApi } from '@/api'
import { useDebouncedValue } from '@/hooks/useDebouncedValue'
import { queryClient } from '@/offlineCache'

export type NoteLinkResolution = {
  title: string
  status: 'resolved' | 'ambiguous' | 'missing' | 'unavailable'
  target: { id: string; title: string; course_name: string } | null
}
export type NoteSuggestion = { id: string; title: string; course_id: number }
export const NoteLinkTargetsContext = createContext<ReadonlyMap<string, NoteLinkResolution>>(new Map())

// All open readers share four metadata request slots. Long Unicode titles can
// require hundreds of URL-sized batches; do not flood the local host at once.
let activeBatches = 0
const waitingBatches: (() => void)[] = []
export async function requestNoteLinkBatch(path: string, signal: AbortSignal): Promise<NoteLinkResolution[]> {
  await new Promise<void>((resolve, reject) => {
    const cancel = () => {
      const position = waitingBatches.indexOf(start)
      if (position !== -1) waitingBatches.splice(position, 1)
      reject(signal.reason ?? new DOMException('Aborted', 'AbortError'))
    }
    const start = () => {
      signal.removeEventListener('abort', cancel)
      activeBatches++
      resolve()
    }
    if (signal.aborted) {
      cancel()
      return
    }
    signal.addEventListener('abort', cancel, { once: true })
    if (activeBatches < 4) start()
    else waitingBatches.push(start)
  })
  try {
    return await request<NoteLinkResolution[]>(path, { signal })
  } finally {
    activeBatches--
    waitingBatches.shift()?.()
  }
}

function cachedNoteLinks(client: QueryClient): Map<string, NoteLinkResolution> {
  const latest = new Map<string, { updated: number; resolution: NoteLinkResolution }>()
  for (const query of client.getQueryCache().getAll()) {
    if (
      query.queryKey[0] !== 'api' ||
      typeof query.queryKey[1] !== 'string' ||
      query.queryKey[1].split('?')[0] !== '/api/notes/link-targets' ||
      !Array.isArray(query.state.data)
    )
      continue
    for (const resolution of query.state.data as NoteLinkResolution[]) {
      if (query.state.dataUpdatedAt >= (latest.get(resolution.title)?.updated ?? -1)) {
        latest.set(resolution.title, { updated: query.state.dataUpdatedAt, resolution })
      }
    }
  }
  return new Map([...latest].map(([title, item]) => [title, item.resolution]))
}

export function noteTitleHasText(title: string): boolean {
  return [...title].some((char) => {
    // Python strip() includes these controls, while JS trim() additionally
    // removes the BOM. Keep the exact backend title rules without casefolding.
    return char === '\uFEFF' || (Boolean(char.trim()) && ![28, 29, 30, 31, 133].includes(char.charCodeAt(0)))
  })
}

/** Stable read batches: metadata only, bounded count and URL length. */
export function noteLinkPaths(body: string): string[] {
  const titles = [
    ...new Set([...body.matchAll(/\[\[([^[\]\r\n]{1,200})\]\]/gu)].map((match) => match[1]).filter(noteTitleHasText)),
  ].sort()
  const paths: string[] = []
  let params = new URLSearchParams()
  for (const title of titles) {
    const next = new URLSearchParams(params)
    next.append('titles', title)
    if (params.size && (params.size >= 32 || next.toString().length > 6000)) {
      paths.push(`/api/notes/link-targets?${params}`)
      params = new URLSearchParams()
    }
    params.append('titles', title)
  }
  if (params.size) paths.push(`/api/notes/link-targets?${params}`)
  return paths
}

let refreshUsers = 0
function refreshCatalog() {
  void queryClient.invalidateQueries({
    predicate: (query) =>
      query.queryKey[0] === 'api' &&
      typeof query.queryKey[1] === 'string' &&
      ['/api/notes/link-targets', '/api/entities/note'].includes(query.queryKey[1].split('?')[0]),
  })
}

export function useNoteLinkTargets(body: string) {
  const client = useQueryClient()
  const paths = useMemo(() => noteLinkPaths(body), [body])
  const resolutions = useQueries({
    queries: paths.map((path) => ({
      queryKey: ['api', path],
      queryFn: ({ signal }: { signal: AbortSignal }) => requestNoteLinkBatch(path, signal),
      staleTime: 30_000,
      networkMode: 'always' as const,
      meta: { offlineCache: true },
    })),
    combine: (queries) => {
      // A new title changes a batch key. Preserve prior exact global answers
      // while refreshing or offline instead of losing the other known links.
      const previous = cachedNoteLinks(client)
      return queries.flatMap((query, index) => {
        // Access observer data even when another batch supplies the newer
        // answer: React Query must subscribe this view to successful updates.
        const current = new Map(query.data?.map((resolution) => [resolution.title, resolution]))
        const failed = query.isError
        return new URLSearchParams(paths[index].split('?')[1]).getAll('titles').flatMap((title) => {
          const resolved = previous.get(title) ?? current.get(title)
          return resolved ? [resolved] : failed ? [{ title, status: 'unavailable' as const, target: null }] : []
        })
      })
    },
  })
  useEffect(() => {
    if (refreshUsers++ === 0) {
      window.addEventListener('unios:local-change', refreshCatalog)
      window.addEventListener('unios:sync-completed', refreshCatalog)
    }
    return () => {
      if (--refreshUsers === 0) {
        window.removeEventListener('unios:local-change', refreshCatalog)
        window.removeEventListener('unios:sync-completed', refreshCatalog)
      }
    }
  }, [])
  return useMemo(() => new Map(resolutions.map((item) => [item.title, item])), [resolutions])
}

/** Search the global entity catalogue, never the currently filtered note list. */
export function useNoteSuggestions(query: string, enabled: boolean) {
  const term = query.trim().slice(0, 100)
  const settled = useDebouncedValue(term, 250)
  const path = `/api/entities/note?limit=40${settled.length >= 2 ? `&q=${encodeURIComponent(settled)}` : ''}`
  const result = useApi<NoteSuggestion[]>(path, { enabled: enabled && term === settled })
  // Do not insert a stale result while a new typed query is still settling.
  return { ...result, data: term === settled ? result.data : null }
}

// SPDX-License-Identifier: AGPL-3.0-or-later

import { useEffect, useState } from 'react'
import { request } from '@/api'
import type { SearchResponse } from '@/types'
import { extractApiErrorMessage } from '@/hooks/useApiMutation'

interface PaletteSearchState {
  query: string
  results: SearchResponse | null
  searching: boolean
  error: string
}

/** Abort is complemented by query ownership, including clients that resolve after cancellation. */
export function useCommandPaletteSearch(query: string, enabled: boolean): PaletteSearchState | null {
  const value = query.trim()
  const [state, setState] = useState<PaletteSearchState | null>(null)
  useEffect(() => {
    if (!enabled || value.length < 2) {
      setState(null)
      return
    }
    const controller = new AbortController()
    const timer = window.setTimeout(() => {
      setState({ query: value, results: null, searching: true, error: '' })
      request<SearchResponse>(`/api/search?q=${encodeURIComponent(value)}`, { signal: controller.signal })
        .then((results) => {
          if (!controller.signal.aborted) setState({ query: value, results, searching: false, error: '' })
        })
        .catch((cause) => {
          if (!controller.signal.aborted)
            setState({ query: value, results: null, searching: false, error: extractApiErrorMessage(cause) })
        })
    }, 250)
    return () => {
      window.clearTimeout(timer)
      controller.abort()
    }
  }, [enabled, value])
  // Hide results/loading/errors synchronously when the input changes, before
  // effect cleanup or the next debounce, rather than exposing the previous query.
  return enabled && value.length >= 2 && state?.query === value ? state : null
}

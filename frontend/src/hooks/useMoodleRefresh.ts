// SPDX-License-Identifier: AGPL-3.0-or-later
import { useEffect, useRef } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ApiError, notifySyncCompleted, request } from '@/api'
import { readFreshness } from '@/readFreshness'

interface SyncStatus {
  running: boolean
  last_run_id: number | null
  last_status: string | null
}

/** Observe startup and manual runs through the same live status. */
export function useMoodleRefresh() {
  const client = useQueryClient()
  const key = ['api', '/api/sync/status']
  const status = useQuery({
    queryKey: key,
    queryFn: ({ signal }) => request<SyncStatus>('/api/sync/status', { signal, cache: 'no-store' }),
    refetchInterval: (query) => query.state.data?.running ? 2_000 : 10_000,
    staleTime: readFreshness('/api/sync/status'),
  })
  const previous = useRef<SyncStatus | undefined>(undefined)
  useEffect(() => {
    if (previous.current?.running && status.data && !status.data.running) notifySyncCompleted()
    previous.current = status.data
  }, [status.data])
  const mutation = useMutation({
    mutationFn: async () => {
      try {
        return await request<{ status: string; id?: number }>('/api/sync', { method: 'POST' })
      } catch (error) {
        // The scheduler can start between the status check and this request.
        if (error instanceof ApiError && error.status === 409 && error.message === 'Sync läuft bereits') {
          return { status: 'running' }
        }
        throw error
      }
    },
    onSuccess: (result) => {
      if (result.status === 'running') {
        client.setQueryData<SyncStatus>(key, (old) => ({
          running: true, last_run_id: old?.last_run_id ?? null, last_status: 'running',
        }))
      } else {
        client.setQueryData<SyncStatus>(key, {
          running: false, last_run_id: result.id ?? null, last_status: result.status,
        })
        notifySyncCompleted()
      }
    },
    onSettled: () => { void client.invalidateQueries({ queryKey: key }) },
  })
  const busy = mutation.isPending || status.data?.running === true
  const result = busy ? null : mutation.error ? 'error'
    : status.data?.last_status === 'running' ? 'error' : status.data?.last_status
  return {
    busy,
    result: result === 'success' || result === 'warning' || result === 'error' ? result : null,
    refresh: () => mutation.mutate(),
  }
}

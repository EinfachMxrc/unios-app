// SPDX-License-Identifier: AGPL-3.0-or-later

import { useMutation, useQuery } from '@tanstack/react-query'
import { ApiError, request } from '@/api'
import { useHostOnline } from '@/hostAvailability'
import { queryClient } from '@/offlineCache'

export type CampusImportReport = {
  events: number
  news: number
  documents: number
  files_stored: number
  new_items: number
  warnings: string[]
}

export type CampusImportStatus = {
  state: 'idle' | 'running' | 'done' | 'error'
  message: string
  report: CampusImportReport | null
  login_required?: boolean
}

const STATUS_PATH = '/api/mycampus/import/status'
const STATUS_KEY = ['api', STATUS_PATH]

/** The server owns the job; this shared, non-persisted query follows it across pages. */
export function useCampusImport() {
  const online = useHostOnline()
  const status = useQuery<CampusImportStatus, Error>({
    queryKey: STATUS_KEY,
    queryFn: ({ signal }) => request(STATUS_PATH, { signal }),
    enabled: online,
    staleTime: 1_000,
    refetchOnWindowFocus: true,
    refetchInterval: (query) => {
      if (query.state.error instanceof ApiError && query.state.error.status === 404) return false
      return query.state.data?.state === 'running' ? 1_500 : 15_000
    },
    meta: { offlineCache: false },
  })
  const start = useMutation({
    mutationFn: async () => {
      await queryClient.cancelQueries({ queryKey: STATUS_KEY })
      return request('/api/mycampus/import', { method: 'POST' })
    },
    onSuccess: () => {
      queryClient.setQueryData<CampusImportStatus>(STATUS_KEY, { state: 'running', message: '', report: null })
      void queryClient.invalidateQueries({ queryKey: STATUS_KEY })
    },
  })
  return { status: status.data, starting: start.isPending, start: start.mutateAsync }
}

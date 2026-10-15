// SPDX-License-Identifier: AGPL-3.0-or-later

import { useEffect } from 'react'
import { request } from '@/api'
import { isHostOnline } from '@/hostAvailability'
import { queryClient } from '@/offlineCache'
import { flushReviews } from '@/studyQueue'

/** Keep today's Anki queue available in the PWA and replay reviews from any page. */
export function StudySync() {
  useEffect(() => {
    const sync = async () => {
      if (!isHostOnline()) return
      try {
        // The shared outbox invalidates status, stats and all scoped queues after replay.
        await flushReviews()
        const status = await queryClient.fetchQuery<{ mode: string }>({
          queryKey: ['api', '/api/anki/study/status'],
          queryFn: () => request('/api/anki/study/status'),
          meta: { offlineCache: true },
          staleTime: 60_000,
        })
        if (status.mode === 'integrated') {
          await queryClient.fetchQuery({
            queryKey: ['api', '/api/anki/study/due'],
            queryFn: () => request('/api/anki/study/due'),
            meta: { offlineCache: true },
            staleTime: 60_000,
          })
        }
      } catch {
        // A failed replay remains in IndexedDB and is shown on the study page.
      }
    }
    const onOnline = () => {
      void sync()
    }
    window.addEventListener('online', onOnline)
    const interval = window.setInterval(onOnline, 5 * 60_000)
    onOnline()
    return () => {
      window.removeEventListener('online', onOnline)
      window.clearInterval(interval)
    }
  }, [])
  return null
}

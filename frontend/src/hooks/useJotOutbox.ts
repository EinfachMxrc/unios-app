// SPDX-License-Identifier: AGPL-3.0-or-later

import { useCallback, useEffect, useState } from 'react'
import { flushJots, pendingJots, subscribeJots } from '@/jotQueue'
import type { PendingJot } from '@/jotQueue'

export function useJotOutbox() {
  const [pending, setPending] = useState<PendingJot[]>([])
  const reload = useCallback(() => {
    void pendingJots().then(setPending)
  }, [])
  useEffect(() => {
    reload()
    return subscribeJots(reload)
  }, [reload])
  return { pending, reload }
}

export function JotOutboxSync() {
  useEffect(() => {
    const onOnline = () => {
      void flushJots()
    }
    window.addEventListener('online', onOnline)
    const timer = window.setInterval(onOnline, 15_000)
    onOnline()
    return () => {
      window.removeEventListener('online', onOnline)
      window.clearInterval(timer)
    }
  }, [])
  return null
}

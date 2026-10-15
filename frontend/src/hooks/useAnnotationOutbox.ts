// SPDX-License-Identifier: AGPL-3.0-or-later

import { useCallback, useEffect, useState } from 'react'
import { flushAnnotations, pendingAnnotations, subscribeAnnotations } from '@/annotationQueue'
import type { PendingAnnotation } from '@/annotationQueue'

export function useAnnotationOutbox() {
  const [pending, setPending] = useState<PendingAnnotation[]>([])
  const reload = useCallback(() => {
    void pendingAnnotations().then(setPending)
  }, [])
  useEffect(() => {
    reload()
    return subscribeAnnotations(reload)
  }, [reload])
  return { pending, reload }
}

export function AnnotationOutboxSync() {
  useEffect(() => {
    const flush = () => {
      void flushAnnotations()
    }
    window.addEventListener('online', flush)
    const timer = window.setInterval(flush, 15_000)
    flush()
    return () => {
      window.removeEventListener('online', flush)
      window.clearInterval(timer)
    }
  }, [])
  return null
}

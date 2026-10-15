// SPDX-License-Identifier: AGPL-3.0-or-later

import { useEffect, useState } from 'react'
import { useLocation } from 'react-router-dom'
import { request } from '@/api'
import { isHostOnline } from '@/hostAvailability'
import { queryClient, mayCache } from '@/offlineCache'
import { preloadRoute } from '@/lib/routeLoading'
import { useT } from '@/i18n/useT'
import './NavigationIntent.css'

/** Prepare only the page being approached, never editors, files or mutations. */
export function NavigationIntent() {
  const { pathname } = useLocation()
  const { t } = useT('common')
  const [loading, setLoading] = useState<string | null>(null)
  useEffect(() => {
    let timer: number | undefined
    let sequence = 0
    const preparing = new Set<string>()
    const approached = new Map<string, number>()
    const intent = (event: Event) => {
      if (!(event.target instanceof Element)) return
      const anchor = event.target.closest('a[href]')
      if (!(anchor instanceof HTMLAnchorElement) || anchor.download ||
          (anchor.target && anchor.target !== '_self')) return
      const url = new URL(anchor.href, window.location.href)
      if (url.origin !== window.location.origin || url.pathname === pathname) return
      if (event instanceof MouseEvent && (event.button > 0 || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey)) return
      // At most two small course metadata reads; no PDF, editor, auth or mutation prefetch.
      const course = /^\/courses\/([1-9]\d*)$/.exec(url.pathname)
      if (course && isHostOnline() && preparing.size < 2 && Date.now() - (approached.get(url.pathname) ?? 0) > 30_000) {
        const path = `/api/courses/${course[1]}`
        preparing.add(path); approached.set(url.pathname, Date.now())
        void queryClient.prefetchQuery({ queryKey: ['api', path], queryFn: () => request(path), staleTime: 30_000,
          meta: { offlineCache: mayCache(path) } }).finally(() => preparing.delete(path))
      }
      const pending = preloadRoute(url.pathname)
      if (!pending) return
      // Hover/focus prepare silently. Only a slow click gets a subtle status bar.
      if (event.type !== 'click') { void pending.catch(() => undefined); return }
      const current = ++sequence
      window.clearTimeout(timer)
      timer = window.setTimeout(() => setLoading(pathname), 120)
      void pending.catch(() => undefined).finally(() => {
        if (current !== sequence) return
        window.clearTimeout(timer)
        setLoading(null)
      })
    }
    const events = ['pointerover', 'focusin', 'touchstart', 'click'] as const
    events.forEach(event => document.addEventListener(event, intent, { passive: true }))
    return () => {
      sequence++
      window.clearTimeout(timer)
      events.forEach(event => document.removeEventListener(event, intent))
    }
  }, [pathname])
  return loading === pathname ? <div className="navigation-progress" role="status" aria-label={t('pageLoading')}><span /></div> : null
}

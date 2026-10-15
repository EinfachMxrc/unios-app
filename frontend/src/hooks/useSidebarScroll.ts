// SPDX-License-Identifier: AGPL-3.0-or-later
import { useCallback, useLayoutEffect, useRef } from 'react'
import { rememberWorkspace, workspaceValue } from '@/lib/workspaceState'

const KEY = 'sidebar:scroll-top'
/** Route shells and lazy-loading fallbacks share one independent navigation viewport. */
export function useSidebarScroll(ready: boolean) {
  const ref = useRef<HTMLElement>(null)
  const position = useRef(workspaceValue(KEY, 0))
  const interacted = useRef(false)
  const capture = useCallback(
    (nav: HTMLElement | null) => {
      if (!nav || (!ready && !interacted.current) || !nav.isConnected || !nav.getClientRects().length) return
      position.current = nav.scrollTop
      rememberWorkspace(KEY, nav.scrollTop)
    },
    [ready],
  )
  useLayoutEffect(() => {
    const nav = ref.current
    // Loading courses may initially clamp a deep position. Restore once they
    // arrive, unless the user has already chosen a new position meanwhile.
    if (nav && !interacted.current) nav.scrollTop = position.current
    return () => capture(nav)
  }, [capture])
  const onScroll = () => capture(ref.current)
  const onInteraction = () => {
    interacted.current = true
  }
  const onClickCapture = () => {
    onInteraction()
    capture(ref.current)
  }
  return {
    ref,
    onScroll,
    onClickCapture,
    onWheelCapture: onInteraction,
    onPointerDownCapture: onInteraction,
    onKeyDownCapture: onInteraction,
  }
}

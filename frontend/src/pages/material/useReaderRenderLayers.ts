// SPDX-License-Identifier: AGPL-3.0-or-later

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'

export const READER_RENDER_IDLE_MS = 140

type RenderLayers = {
  currentWidth: number
  pendingWidth: number | null
  hasError: boolean
  currentHasError: boolean
}

/** Keep the finished page while gestures change layout; render one replacement after idle. */
export function useReaderRenderLayers(width: number) {
  const [layers, setLayers] = useState<RenderLayers>({
    currentWidth: width, pendingWidth: null, hasError: false, currentHasError: false,
  })
  const desiredWidth = useRef(width)

  useLayoutEffect(() => {
    desiredWidth.current = width
  }, [width])

  useEffect(() => {
    // A new gesture supersedes a pending raster without touching the displayed page.
    // A failed active layer stays failed until a complete replacement takes over.
    // Returning to its width cannot restart that task or make it appear sharp.
    setLayers(current => current.pendingWidth === null && current.hasError === current.currentHasError
      ? current : { ...current, pendingWidth: null, hasError: current.currentHasError })
    if (width === layers.currentWidth) return
    const timer = window.setTimeout(() => {
      setLayers(current => ({ ...current, pendingWidth: width, hasError: current.currentHasError }))
    }, READER_RENDER_IDLE_MS)
    return () => window.clearTimeout(timer)
  }, [width, layers.currentWidth])

  const rendered = useCallback((renderWidth: number) => {
    if (desiredWidth.current !== renderWidth) return
    setLayers(current => current.pendingWidth === renderWidth
      ? { currentWidth: renderWidth, pendingWidth: null, hasError: false, currentHasError: false }
      : current)
  }, [])

  const failed = useCallback((renderWidth: number) => {
    setLayers(current => {
      // The visible initial task may finish after a gesture requests another width.
      // Record its failure without cancelling the healthy pending replacement.
      if (current.currentWidth === renderWidth)
        return { ...current, hasError: true, currentHasError: true }
      if (desiredWidth.current === renderWidth && current.pendingWidth === renderWidth)
        return { ...current, pendingWidth: null, hasError: true }
      return current
    })
  }, [])

  return { ...layers, rendered, failed }
}

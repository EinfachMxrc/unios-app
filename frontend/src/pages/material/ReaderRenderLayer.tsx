// SPDX-License-Identifier: AGPL-3.0-or-later

import { useCallback, useRef, useState, type ReactNode } from 'react'
import { Page } from 'react-pdf'

type RenderPart = 'canvas' | 'text' | 'annotations'

/** One PDF rendering task, independent of fast layout/transform updates. */
export function ReaderRenderLayer({
  number,
  renderWidth,
  layoutWidth,
  ratio,
  active,
  onRendered,
  onFailed,
  children,
}: {
  number: number
  renderWidth: number
  layoutWidth: number
  ratio: number
  active: boolean
  onRendered: (width: number) => void
  onFailed: (width: number) => void
  children?: ReactNode
}) {
  const completed = useRef(new Set<RenderPart>())
  const [complete, setComplete] = useState(false)
  const failed = useRef(false)
  const finishPart = useCallback((part: RenderPart) => {
    if (failed.current) return
    completed.current.add(part)
    if (completed.current.size === 3) {
      setComplete(true)
      onRendered(renderWidth)
    }
  }, [onRendered, renderWidth])
  const reportFailure = useCallback(() => {
    // A failed part cannot satisfy the shared success barrier. Also ignore
    // late successes from this task after its replacement was discarded.
    failed.current = true
    setComplete(false)
    onFailed(renderWidth)
  }, [onFailed, renderWidth])
  // React-PDF TextLayer restarts its render effect when this callback changes.
  // Fast layout-only updates must keep every render-task callback stable.
  const canvasSuccess = useCallback(() => finishPart('canvas'), [finishPart])
  const textSuccess = useCallback(() => finishPart('text'), [finishPart])
  const annotationSuccess = useCallback(() => finishPart('annotations'), [finishPart])
  return (
    <div
      className="material-render-layer"
      data-reader-render-width={renderWidth}
      data-reader-render-active={active}
      data-reader-render-complete={complete}
      aria-hidden={!active}
      inert={!active}
      style={{
        position: 'absolute',
        left: 0,
        top: 0,
        width: renderWidth,
        height: renderWidth * ratio,
        transform: layoutWidth === renderWidth ? undefined : `scale(${layoutWidth / renderWidth})`,
        transformOrigin: 'top left',
        visibility: active ? 'visible' : 'hidden',
      }}
    >
      <Page
        pageNumber={number}
        width={renderWidth}
        devicePixelRatio={Math.min(window.devicePixelRatio || 1, 2)}
        renderTextLayer
        renderAnnotationLayer
        suspense={false}
        _enableRegisterUnregisterPage={false}
        loading={null}
        error={null}
        onRenderSuccess={canvasSuccess}
        onRenderTextLayerSuccess={textSuccess}
        onRenderAnnotationLayerSuccess={annotationSuccess}
        onLoadError={reportFailure}
        onRenderError={reportFailure}
        onGetTextError={reportFailure}
        onRenderTextLayerError={reportFailure}
        onGetAnnotationsError={reportFailure}
        onRenderAnnotationLayerError={reportFailure}
      />
      {children}
    </div>
  )
}

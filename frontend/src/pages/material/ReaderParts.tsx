// SPDX-License-Identifier: AGPL-3.0-or-later

import { localDate } from '@/api'
import { AssessmentQuestion } from '@/components/AssessmentQuestion'
import { Failure } from '@/components/State'
import { Button } from '@/components/ui/button'
import { useT } from '@/i18n/useT'
import { useWorkspaceState } from '@/lib/workspaceState'
import type { MaterialAnnotation } from '@/types'
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { useDocumentContext } from 'react-pdf'
import { Quote } from 'lucide-react'
import { ReaderRenderLayer } from './ReaderRenderLayer'
import { useReaderRenderLayers } from './useReaderRenderLayers'
import { extractApiErrorMessage } from '@/hooks/useApiMutation'
/** A passage on a page; `cited` when a link opened it rather than the reader's own selection. */
export type Selection = { quote: string; page: number; rects: number[][]; cited?: boolean }
export type OCRStatus = {
  pending_pages: number
  recognized_pages: number
  empty_pages: number
  available: boolean
  language: string | null
}
export function ReaderPage({
  number,
  width,
  ratio,
  originalColors,
  annotations,
  pendingSelection,
  onSelect,
  citationCount = 0,
  onCitations,
}: {
  number: number
  width: number
  ratio: number
  originalColors: boolean
  annotations: MaterialAnnotation[]
  pendingSelection: Selection | null
  onSelect: () => void
  /** Notes quoting this page; the marker opens the citation list. */
  citationCount?: number
  onCitations?: () => void
}) {
  const { t } = useT('material')
  const container = useRef<HTMLDivElement>(null)
  const [visible, setVisible] = useState(number === 1)
  useEffect(() => {
    const node = container.current
    if (!node) return
    const observer = new IntersectionObserver(([entry]) => setVisible(entry.isIntersecting), {
      rootMargin: '900px 0px',
    })
    observer.observe(node)
    return () => observer.disconnect()
  }, [])
  return (
    <div
      ref={container}
      id={`reader-page-${number}`}
      className="material-page-position"
      data-reader-page={number}
      style={{ width, height: width * ratio }}
    >
      {citationCount > 0 && onCitations && <button type="button" className="reader-page-citations"
        onClick={onCitations} title={t('citationsBadge', { count: citationCount })}
        aria-label={t('citationsBadge', { count: citationCount })}>
        <Quote size={12} aria-hidden="true" /> {citationCount}
      </button>}
      {visible && (
        <ReaderPageContent
          number={number}
          width={width}
          ratio={ratio}
          originalColors={originalColors}
          annotations={annotations}
          pendingSelection={pendingSelection}
          onSelect={onSelect}
        />
      )}
    </div>
  )
}

function ReaderPageContent({
  number, width, ratio, originalColors, annotations, pendingSelection, onSelect,
}: {
  number: number
  width: number
  ratio: number
  originalColors: boolean
  annotations: MaterialAnnotation[]
  pendingSelection: Selection | null
  onSelect: () => void
}) {
  const frame = useRef<HTMLDivElement>(null)
  const context = useDocumentContext()
  const registerPage = context?.registerPage
  const unregisterPage = context?.unregisterPage
  const layers = useReaderRenderLayers(width)
  const { rendered } = layers
  const readyAfterSelection = useRef<number | null>(null)
  const desiredWidth = useRef(width)
  const { t } = useT('material')
  useLayoutEffect(() => { desiredWidth.current = width }, [width])
  const acceptRendered = useCallback((renderWidth: number) => {
    if (renderWidth !== desiredWidth.current) return
    const selection = window.getSelection()
    if (selection && !selection.isCollapsed && selection.anchorNode && frame.current?.contains(selection.anchorNode)) {
      // Keep the selected text DOM until capture/focus has released it.
      readyAfterSelection.current = renderWidth
      return
    }
    readyAfterSelection.current = null
    rendered(renderWidth)
  }, [rendered])
  useEffect(() => {
    const releaseSelection = () => {
      if (readyAfterSelection.current !== null) acceptRendered(readyAfterSelection.current)
    }
    document.addEventListener('selectionchange', releaseSelection)
    return () => document.removeEventListener('selectionchange', releaseSelection)
  }, [acceptRendered])
  useEffect(() => {
    const node = frame.current
    if (!node || !registerPage) return
    // A stable target prevents replacement Pages from registering/unregistering each other.
    registerPage(number - 1, node)
    return () => unregisterPage?.(number - 1)
  }, [number, registerPage, unregisterPage])
  const renderWidths = layers.pendingWidth === null ? [layers.currentWidth] : [layers.currentWidth, layers.pendingWidth]
  // Clip old raster layout boxes so scaling down cannot add phantom scroll overflow.
  return (
    <div
      ref={frame}
      className={`material-page${originalColors ? ' original-colors' : ''}`}
      data-material-page={number}
      data-reader-render-state={layers.hasError ? 'error' : layers.currentWidth === width ? 'sharp' : 'preview'}
      style={{ width, height: width * ratio, overflow: 'hidden' }}
      onMouseUp={onSelect}
      onTouchEnd={onSelect}
    >
      {renderWidths.map(renderWidth => (
        <ReaderRenderLayer
          key={renderWidth}
          number={number}
          renderWidth={renderWidth}
          layoutWidth={width}
          ratio={ratio}
          active={renderWidth === layers.currentWidth}
          onRendered={acceptRendered}
          onFailed={layers.failed}
        >
          {renderWidth === layers.currentWidth && <div className="material-overlays" aria-hidden="true">
            {annotations
              .filter((item) => item.anchor.status === 'matched' && item.anchor.page === number)
              .flatMap((item) =>
                item.anchor.rects.map((rect, index) => (
                  <span
                    key={`${item.id}-${index}`}
                    className={`material-mark ${item.kind === 'question' ? 'question' : ''}`}
                    style={{
                      left: `${rect[0] * 100}%`,
                      top: `${rect[1] * 100}%`,
                      width: `${(rect[2] - rect[0]) * 100}%`,
                      height: `${(rect[3] - rect[1]) * 100}%`,
                    }}
                  />
                )),
              )}
            {/* The browser drops its own selection once the comment field takes focus; keep the passage visible. */}
            {pendingSelection?.page === number &&
              pendingSelection.rects.map((rect, index) => (
                <span
                  key={`pending-${index}`}
                  className={`material-mark pending${pendingSelection.cited ? ' cited' : ''}`}
                  style={{
                    left: `${rect[0] * 100}%`,
                    top: `${rect[1] * 100}%`,
                    width: `${(rect[2] - rect[0]) * 100}%`,
                    height: `${(rect[3] - rect[1]) * 100}%`,
                  }}
                />
              ))}
          </div>}
        </ReaderRenderLayer>
      ))}
      {layers.hasError && <div style={{ position: 'absolute', inset: '0 0 auto', zIndex: 5 }}><Failure message={t('pdfLoadFailed')} /></div>}
    </div>
  )
}
export function AnnotationRow({
  item,
  onPage,
  onUpdate,
  onDelete,
  onReanchor,
  onCreateCard,
  disabled,
}: {
  item: MaterialAnnotation
  onPage: (page: number) => void
  onUpdate: (item: MaterialAnnotation, comment: string, resolved: boolean) => Promise<void>
  onDelete: (item: MaterialAnnotation) => Promise<void>
  onReanchor: (item: MaterialAnnotation) => void
  onCreateCard?: (item: MaterialAnnotation) => void
  disabled: boolean
}) {
  const { t } = useT('material')
  const { t: study } = useT('study')
  const [comment, setComment] = useWorkspaceState(`reader:annotation:${item.id}:${item.revision}:comment`, item.comment,
    { persist: false })
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [commentPreview, setCommentPreview] = useState(false)
  async function save(resolved = item.resolved) {
    setBusy(true)
    setError('')
    try {
      await onUpdate(item, comment, resolved)
    } catch (cause) {
      setError(extractApiErrorMessage(cause))
    } finally {
      setBusy(false)
    }
  }
  async function remove() {
    if (!window.confirm(t('confirmRemoveAnnotation'))) return
    setBusy(true)
    setError('')
    try {
      await onDelete(item)
    } catch (cause) {
      setError(extractApiErrorMessage(cause))
    } finally {
      setBusy(false)
    }
  }
  return (
    <article
      id={`annotation-${item.id}`}
      className={`material-annotation ${item.kind === 'question' ? 'is-question' : ''}`}
    >
      <div className="material-annotation-meta">
        <strong>{item.kind === 'question' ? t('kindQuestion') : t('kindHighlight')}</strong>
        <span>{item.anchor.status === 'matched' ? t('pageLabel', { page: item.anchor.page }) : t('needsReview')}</span>
      </div>
      <blockquote>{item.quote}</blockquote>
      {item.anchor.status === 'matched' && item.anchor.page && (
        <button className="subtle-link" onClick={() => onPage(item.anchor.page!)}>
          {t('showLocation')}
        </button>
      )}
      {item.anchor.status !== 'matched' && (
        <>
          <p className="muted-text">
            {item.anchor.status === 'ambiguous' ? t('anchorAmbiguous') : t('anchorNotFound')}
          </p>
          <Button size="sm" variant="outline" disabled={disabled || busy} onClick={() => onReanchor(item)}>
            {t('reanchorButton')}
          </Button>
        </>
      )}
      <label className="material-comment-label">
        {t('commentLabel')}
        <textarea
          value={comment}
          onChange={(event) => setComment(event.target.value)}
          maxLength={5000}
          disabled={disabled || busy}
          rows={2}
        />
      </label>
      {comment.trim() && <details open={commentPreview}
        onToggle={event => setCommentPreview(event.currentTarget.open)}>
        <summary>{t('commentPreviewSummary')}</summary>
        {commentPreview && <AssessmentQuestion text={comment} />}
      </details>}
      <div className="material-annotation-actions">
        {onCreateCard && item.anchor.status === 'matched' && Number.isSafeInteger(item.anchor.page) &&
          (item.anchor.page ?? 0) > 0 && item.revision > 0 && item.quote.trim() &&
          <Button type="button" size="sm" variant="ghost" disabled={busy} data-manual-card-source={item.id}
            onClick={() => onCreateCard(item)}>
            {study('manual.createAction')}
          </Button>}
        <Button
          size="sm"
          variant="outline"
          disabled={disabled || busy || comment === item.comment}
          onClick={() => void save()}
        >
          {t('saveCommentButton')}
        </Button>
        {item.kind === 'question' && (
          <Button size="sm" variant="ghost" disabled={disabled || busy} onClick={() => void save(!item.resolved)}>
            {item.resolved ? t('reopenQuestion') : t('markResolved')}
          </Button>
        )}
        <Button size="sm" variant="ghost" disabled={disabled || busy} onClick={() => void remove()}>
          {t('removeButton')}
        </Button>
      </div>
      {error && <Failure message={error} />}
      <small className="muted-text">{localDate(item.updated_at)}</small>
    </article>
  )
}

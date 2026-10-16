// SPDX-License-Identifier: AGPL-3.0-or-later

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import type { ComponentProps, CSSProperties } from 'react'
import { Link, useLocation, useNavigationType, useParams } from 'react-router-dom'
import { Document, pdfjs } from 'react-pdf'
import { Dialog } from 'radix-ui'
import type { PDFDocumentProxy } from 'pdfjs-dist'
import 'react-pdf/dist/Page/AnnotationLayer.css'
import 'react-pdf/dist/Page/TextLayer.css'
import { ArrowDownToLine, ChevronLeft, ChevronRight, MessageCircleQuestion, PanelsTopLeft, X } from 'lucide-react'
import { useT } from '@/i18n/useT'
import { Button } from '@/components/ui/button'
import { Shell } from '@/components/Shell'
import { Failure, Loading } from '@/components/State'
import { request, useApi } from '@/api'
import { useWritableHost } from '@/hooks/host'
import { useHostOnline } from '@/hostAvailability'
import { useAnnotationOutbox } from '@/hooks/useAnnotationOutbox'
import { useAnchorScroll } from '@/hooks/useAnchorScroll'
import { EntityProperties } from '@/components/EntityProperties'
import { AddonWidgetSlot } from '@/addons/AddonWidgetSlot'
import type { Material, MaterialAnnotation } from '@/types'
import { ReaderPage, type OCRStatus } from '@/pages/material/ReaderParts'
import { useReaderSearch } from '@/pages/material/useReaderSearch'
import { useCitedPassage } from '@/pages/material/useCitedPassage'
import { useReaderAnnotations } from '@/pages/material/useReaderAnnotations'
import { FirstUseHint } from '@/components/FirstUseHint'
import { useWorkspaceState } from '@/lib/workspaceState'
import { focusPath } from '@/lib/learningFocus'
import { rememberStudySession } from '@/lib/studyResume'
import { useSourceNoteTarget, validSourceNoteTarget } from '@/lib/sourceNoteTarget'
import { rememberObject } from '@/lib/recentObjects'
import { useOfflineFileUrl } from '@/lib/courseOffline'
import { useMediaQuery } from '@/hooks/useMediaQuery'
import { ReaderAnnotations } from './material/ReaderAnnotations'
import { ReaderStudyTools } from './material/ReaderStudyTools'
import { ReaderPageNavigator } from './material/ReaderPageNavigator'
import { pageBadges } from './material/pdfSearch'
import { PdfClipTool } from './material/PdfClipTool'
import { ManualCardDialog } from '@/components/ManualCardDialog'
import { manualCardContext, type ManualCardContext } from '@/manualCardTypes'
import {
  appendReaderBlock,
  appendReaderExcerpt,
  prepareReaderTarget,
  ReaderExcerptError,
} from './material/readerExcerpt'
import { useReaderGestures } from './material/useReaderGestures'
import { readerWidthForStep } from './material/readerGestures'
import { useReaderShortcuts } from './material/useReaderShortcuts'
import { ReaderSearchFeedback, ReaderSearchNavigation, ReaderToolbar } from './material/ReaderToolbar'
import { ReaderCitations, citationsByPage, useReaderCitations } from './material/ReaderCitations'
import { extractApiErrorMessage } from '@/hooks/useApiMutation'
import './MaterialPage.css'
pdfjs.GlobalWorkerOptions.workerSrc = new URL('pdfjs-dist/build/pdf.worker.min.mjs', import.meta.url).toString()
export function MaterialPage() {
  const { id } = useParams()
  const location = useLocation()
  const params = new URLSearchParams(location.search)
  const note = params.get('note')
  return (
    <MaterialReader
      key={`${id}:${location.key}`}
      versionId={Number(id)}
      initialWorkspace={params.get('workspace') === '1'}
      selectedNoteId={note && validSourceNoteTarget(note) ? note : undefined}
    />
  )
}
function EmbeddedMaterialFrame({ children, title }: ComponentProps<typeof Shell>) {
  return (
    <section className="material-shell focus-material-frame" aria-label={title}>
      {children}
    </section>
  )
}
export function MaterialReader({
  versionId,
  embedded = false,
  expectedCourseId,
  onVersionChange,
  onPageChange,
  savedNoteHref,
  onNoteChange,
  selectedNoteId,
  initialWorkspace = false,
}: {
  versionId: number
  embedded?: boolean
  expectedCourseId?: number
  onVersionChange?: (versionId: number) => void
  onPageChange?: (page: number) => void
  savedNoteHref?: (noteId: string) => string
  onNoteChange?: (noteId: string | null) => void
  selectedNoteId?: string
  initialWorkspace?: boolean
}) {
  const { t } = useT('material')
  const { t: nav } = useT('nav')
  const { t: quality } = useT('quality')
  const { t: learning } = useT('learning')
  const { t: studyWorkspace } = useT('studyWorkspace')
  const offlinePdfUrl = useOfflineFileUrl(versionId)
  const offlineDownloadUrl = useOfflineFileUrl(versionId, '')
  const { hash, search, key: navigationKey } = useLocation()
  const navigation = useNavigationType()
  const positionRestored = useRef(false)
  const [positionReady, setPositionReady] = useState(false)
  const canWrite = useWritableHost()
  const online = useHostOnline()
  const { pending } = useAnnotationOutbox()
  const { data, error, loading, updatedAt, reload } = useApi<Material>(`/api/material/${versionId}`)
  // Restored here, not only inside the notes drawer, so the chosen note is known while it is closed.
  const { target: sourceNoteId, restoring: restoringSourceNote } = useSourceNoteTarget(
    data?.course_id ?? 0,
    data?.resource_id ?? 0,
  )
  const { data: ocr, reload: reloadOcr } = useApi<OCRStatus>(`/api/ocr/material/${versionId}`, {
    enabled: Boolean(data),
  })
  const [ocrRunning, setOcrRunning] = useState(false)
  const desktop = useMediaQuery('(min-width: 960px)')
  const layoutRef = useRef<HTMLDivElement>(null)
  const [layoutWidth, setLayoutWidth] = useState(() => Math.max(0, window.innerWidth - 280))
  const wide = desktop && layoutWidth >= 652
  const [notesOpen, storeNotesOpen] = useWorkspaceState(
    `pdf:${versionId}:notesOpen`,
    (embedded || initialWorkspace) && desktop,
  )
  const [workspaceLayout, setWorkspaceLayout] = useWorkspaceState<'split' | 'write'>('reader:layout', 'split', {
    valid: (value): value is 'split' | 'write' => value === 'split' || value === 'write',
  })
  const [studyTab, setStudyTab] = useWorkspaceState<'annotations' | 'notes' | 'recall'>(
    `pdf:${versionId}:studyTab`,
    embedded || initialWorkspace ? 'notes' : 'annotations',
    {
      valid: (value): value is 'annotations' | 'notes' | 'recall' =>
        value === 'annotations' || value === 'notes' || value === 'recall',
    },
  )
  const [excerptRevision, setExcerptRevision] = useState(0)
  const workspaceRequested = useRef(false)
  useEffect(() => {
    if (initialWorkspace && desktop && !workspaceRequested.current) {
      workspaceRequested.current = true
      storeNotesOpen(true)
      setStudyTab('notes')
    }
  }, [initialWorkspace, desktop, storeNotesOpen, setStudyTab])
  const writingOnly = wide && notesOpen && studyTab === 'notes' && workspaceLayout === 'write'
  const writingAnchor = useRef<{ number: number; fraction: number } | null>(null)
  const citations = useReaderCitations(versionId, excerptRevision)
  const pageCitations = useMemo(() => citationsByPage(citations.data?.citations), [citations.data])
  // A citing note opened from the list takes over the split view until the caller picks another.
  const [citedNoteId, setCitedNoteId] = useState<string | undefined>()
  useEffect(() => {
    setCitedNoteId(undefined)
  }, [selectedNoteId])
  const [cardContext, setCardContext] = useState<ManualCardContext | null>(null)
  const cardDialogActive = useRef(false)
  const cardReturnAnnotation = useRef<string | null>(null)
  const [savedSideWidth, setSideWidth] = useWorkspaceState(`pdf:sideWidth`, 0, {
    valid: (value): value is number =>
      typeof value === 'number' && Number.isFinite(value) && (value === 0 || (value >= 280 && value <= 1000)),
  })
  const maxSideWidth = Math.max(320, Math.min(1000, layoutWidth - 332))
  const sideWidth = Math.max(320, Math.min(maxSideWidth, savedSideWidth || Math.round((layoutWidth - 12) * 0.5)))
  useLayoutEffect(() => {
    const frame = layoutRef.current
    if (!frame) return
    const measure = () => {
      if (frame.clientWidth > 0) setLayoutWidth(frame.clientWidth)
    }
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(frame)
    return () => observer.disconnect()
  }, [data?.version_id, expectedCourseId])
  const resizeStart = useRef<{ x: number; width: number } | null>(null)
  const toolbarRef = useRef<HTMLDivElement>(null)
  const [toolbarHeight, setToolbarHeight] = useState(48)
  useLayoutEffect(() => {
    const bar = toolbarRef.current
    if (!bar) return
    const measure = () => setToolbarHeight(bar.getBoundingClientRect().height || 48)
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(bar)
    return () => observer.disconnect()
  }, [data?.version_id])
  const layoutAnchor = useRef<{ number: number; fraction: number; width: number } | null>(null)
  function preserveReadingPosition(force = false) {
    if (!force && !fitWidth) return
    const slot = document.querySelector<HTMLElement>(`[data-reader-page="${page}"]`)
    if (!slot) return
    const rect = slot.getBoundingClientRect()
    if (rect.height <= 0) return
    layoutAnchor.current = {
      number: page,
      fraction: Math.max(0, Math.min(1, (readingLine() - rect.top) / rect.height)),
      width: pageWidth,
    }
  }
  function setNotesOpen(open: boolean) {
    if (wide && open !== notesOpen) preserveReadingPosition()
    storeNotesOpen(open)
  }
  function chooseWorkspaceLayout(next: 'read' | 'split' | 'write') {
    if (next === 'write' && !writingOnly) {
      const rect = document.querySelector<HTMLElement>(`[data-reader-page="${page}"]`)?.getBoundingClientRect()
      if (rect && rect.height > 0)
        writingAnchor.current = {
          number: page,
          fraction: Math.max(0, Math.min(1, (readingLine() - rect.top) / rect.height)),
        }
    }
    if (next !== 'read') {
      setWorkspaceLayout(next)
      setStudyTab('notes')
    }
    setNotesOpen(next !== 'read')
  }
  useAnchorScroll(Boolean(data) && notesOpen && !wide)
  const requestedPage = Number(new URLSearchParams(search).get('page'))
  const [page, setPage] = useWorkspaceState(
    `pdf:${versionId}:page`,
    Number.isSafeInteger(requestedPage) && requestedPage > 0 ? requestedPage : 1,
    { valid: (value): value is number => typeof value === 'number' && Number.isSafeInteger(value) && value > 0 },
  )
  const [pages, setPages] = useState(0)
  useEffect(() => {
    if (pages > 0 && positionRestored.current) onPageChange?.(page)
  }, [page, pages, onPageChange])
  useEffect(() => {
    if (data && !error && pages > 0) rememberObject(`/material/${versionId}?page=${page}`, data.resource_name)
  }, [data, error, pages, page, versionId])
  useEffect(() => {
    if (!embedded && data && !error && pages > 0 && !restoringSourceNote)
      rememberStudySession(
        { kind: 'course', id: data.course_id },
        { mode: 'source', version: versionId, page, note: sourceNoteId ?? undefined },
        data.resource_name,
      )
  }, [embedded, data, error, pages, page, versionId, sourceNoteId, restoringSourceNote])
  const [width, setWidth] = useWorkspaceState(`pdf:${versionId}:width`, 760, {
    valid: (value): value is number =>
      typeof value === 'number' && Number.isFinite(value) && value >= 180 && value <= 1600,
  })
  const [readerWidth, setReaderWidth] = useState(760)
  const [selectionFrame, setSelectionFrame] = useState({ left: 12, width: 760 })
  const [fitWidth, setFitWidth] = useWorkspaceState(`pdf:${versionId}:fitWidth`, true)
  const readerRef = useRef<HTMLDivElement>(null)
  const readingLine = useCallback(() => {
    const controls = readerRef.current?.querySelector<HTMLElement>('.material-controls')
    if (!controls) return 140
    const top = Number.parseFloat(window.getComputedStyle(controls).top)
    // The embedded mode bar adds a measured sticky layer above the PDF.
    return Number.isFinite(top) ? Math.max(140, top + controls.getBoundingClientRect().height + 32) : 140
  }, [])
  const viewportRef = useRef<HTMLDivElement>(null)
  const [originalColors, setOriginalColors] = useWorkspaceState(`pdf:${versionId}:originalColors`, true)
  const [pdfDocument, setPdfDocument] = useState<PDFDocumentProxy | null>(null)
  const [pageOverview, setPageOverview] = useState(false)
  const [pageRatios, setPageRatios] = useState<number[]>([])
  const [pageSizeError, setPageSizeError] = useState(false)
  const documentSearch = useReaderSearch({ versionId, pdfDocument, page, goToPage })
  const citedPassage = useCitedPassage({
    search,
    navigationKey,
    ready: positionReady,
    enabled: !embedded,
    goToPage: (next) => {
      goToPage(next)
      if (!wide) setNotesOpen(false)
    },
  })
  const {
    selection,
    setSelection,
    comment,
    setComment,
    reanchorId,
    setReanchorId,
    saving,
    actionError,
    setActionError,
    actionMessage,
    setActionMessage,
    captureSelection,
    add,
    update,
    remove,
    reassign,
  } = useReaderAnnotations({ versionId, data, reload, canWrite, online })
  async function recognizeText() {
    setOcrRunning(true)
    setActionError('')
    try {
      let remaining = ocr?.pending_pages ?? 0
      while (remaining > 0) {
        const result = await request<OCRStatus>(`/api/ocr/material/${versionId}`, { method: 'POST' })
        remaining = result.pending_pages
        setActionMessage(
          remaining
            ? t('ocrPagesRemaining', { count: remaining })
            : result.recognized_pages
              ? t('ocrRecognized')
              : t('ocrNoWords'),
        )
      }
      reloadOcr()
    } catch (cause) {
      setActionError(extractApiErrorMessage(cause))
      reloadOcr()
    } finally {
      setOcrRunning(false)
    }
  }
  useEffect(() => {
    const item = data?.annotations.find((entry) => hash === `#annotation-${entry.id}`)
    if (item?.anchor.status === 'matched' && item.anchor.page) setPage(item.anchor.page)
    if (item) {
      setStudyTab('annotations')
      storeNotesOpen(true)
    }
  }, [data, hash, storeNotesOpen, setPage, setStudyTab])
  const pageWidth = fitWidth ? Math.min(760, readerWidth) : width
  const readerContext = useRef({ page, pageWidth, fitWidth })
  const readingPoint = useRef<{ number: number; fraction: number } | null>(null)
  useLayoutEffect(() => {
    readerContext.current = { page, pageWidth, fitWidth }
  }, [page, pageWidth, fitWidth])
  useEffect(() => {
    const reader = readerRef.current
    if (!reader) return
    const measure = () => {
      if (reader.clientWidth <= 0) return
      const nextWidth = Math.max(180, reader.clientWidth - 32)
      const previous = readerContext.current
      // Opening/resizing the split can leave a capped fit page at the same
      // width. Once measured, that action no longer owns a restoration anchor.
      if (previous.fitWidth && layoutAnchor.current?.width === Math.min(760, nextWidth)) layoutAnchor.current = null
      // ResizeObserver runs before committing the new PDF slot geometry. Capture
      // the committed reading position here, including responsive split changes.
      if (
        previous.fitWidth &&
        Math.min(760, nextWidth) !== previous.pageWidth &&
        !layoutAnchor.current &&
        !writingAnchor.current
      ) {
        const slot = document.querySelector<HTMLElement>(`[data-reader-page="${previous.page}"]`)
        if (slot) {
          const before = slot.getBoundingClientRect()
          // Responsive focus/scroll locking may already have moved the window
          // before ResizeObserver runs. Use the last visible source position.
          const fraction =
            readingPoint.current?.number === previous.page
              ? readingPoint.current.fraction
              : Math.max(0, Math.min(1, (readingLine() - before.top) / before.height))
          layoutAnchor.current = { number: previous.page, fraction, width: previous.pageWidth }
        }
      }
      setReaderWidth(nextWidth)
      const rect = reader.getBoundingClientRect()
      const trayWidth = Math.max(180, Math.min(760, rect.width - 24, window.innerWidth - 24))
      setSelectionFrame({ left: Math.max(12, rect.left + (rect.width - trayWidth) / 2), width: trayWidth })
    }
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(reader)
    return () => observer.disconnect()
  }, [data?.version_id, readingLine])
  useLayoutEffect(() => {
    if (writingOnly || writingAnchor.current) return
    const anchor = layoutAnchor.current
    if (!anchor || anchor.width === pageWidth) return
    const slot = document.querySelector<HTMLElement>(`[data-reader-page="${anchor.number}"]`)
    if (slot) {
      const rect = slot.getBoundingClientRect()
      window.scrollBy({ top: rect.top + anchor.fraction * rect.height - readingLine(), behavior: 'instant' })
    }
    layoutAnchor.current = null
  }, [pageWidth, readingLine, writingOnly])
  useLayoutEffect(() => {
    if (writingOnly || !writingAnchor.current) return
    const anchor = writingAnchor.current
    const frame = requestAnimationFrame(() => {
      const rect = document.querySelector<HTMLElement>(`[data-reader-page="${anchor.number}"]`)?.getBoundingClientRect()
      if (rect && rect.height > 0)
        window.scrollBy({ top: rect.top + anchor.fraction * rect.height - readingLine(), behavior: 'instant' })
      layoutAnchor.current = null
      writingAnchor.current = null
    })
    return () => cancelAnimationFrame(frame)
  }, [writingOnly, pageWidth, readingLine])
  useLayoutEffect(() => {
    if (!positionRestored.current || writingOnly || (notesOpen && !wide) || layoutAnchor.current) return
    const rect = document.querySelector<HTMLElement>(`[data-reader-page="${page}"]`)?.getBoundingClientRect()
    if (rect && rect.height > 0 && rect.bottom > 0 && rect.top < window.innerHeight)
      readingPoint.current = {
        number: page,
        fraction: Math.max(0, Math.min(1, (readingLine() - rect.top) / rect.height)),
      }
  }, [page, pageWidth, notesOpen, wide, readingLine, writingOnly])
  useReaderGestures({
    viewportRef,
    pageWidth,
    enabled: pageRatios.length === pages && pages > 0,
    onWidthChange: (next) => {
      layoutAnchor.current = null
      setFitWidth(false)
      setWidth(next)
    },
    onPageSwipe: (direction) => goToPage(page + direction),
  })
  useEffect(() => {
    let cancelled = false
    setPageRatios([])
    setPageSizeError(false)
    if (pdfDocument) {
      void (async () => {
        try {
          // Read only page geometry; canvases and text layers still load near the viewport.
          // Keeping every slot the same size while loading/unloading prevents scroll jumps.
          const ratios: number[] = []
          for (let number = 1; number <= pdfDocument.numPages; number += 1) {
            const pdfPage = await pdfDocument.getPage(number)
            if (cancelled) return
            const viewport = pdfPage.getViewport({ scale: 1 })
            ratios.push(viewport.height / viewport.width)
          }
          if (!cancelled) setPageRatios(ratios)
        } catch {
          if (!cancelled) setPageSizeError(true)
        }
      })()
    }
    return () => {
      cancelled = true
    }
  }, [pdfDocument])
  function openCitingNote(noteId: string) {
    setCitedNoteId(noteId)
    setStudyTab('notes')
    setNotesOpen(true)
  }
  function showCitations() {
    setStudyTab('annotations')
    setNotesOpen(true)
    requestAnimationFrame(() => document.getElementById('reader-citations')?.scrollIntoView({ block: 'nearest' }))
  }
  function zoomReader(direction: -1 | 1) {
    preserveReadingPosition(true)
    setFitWidth(false)
    setWidth(readerWidthForStep(pageWidth, direction))
  }
  function zoomReaderTo(width: number) {
    preserveReadingPosition(true)
    setFitWidth(false)
    setWidth(width)
  }
  function fitReaderWidth() {
    if (!fitWidth) preserveReadingPosition(true)
    setFitWidth(true)
  }
  function toggleNoteBeside() {
    if (notesOpen && studyTab === 'notes') {
      setNotesOpen(false)
      return
    }
    setStudyTab('notes')
    setNotesOpen(true)
  }
  function openPageJump() {
    const jump = readerRef.current?.querySelector<HTMLDetailsElement>('details.reader-page-jump')
    if (jump) jump.open = true
  }
  function focusDocumentSearch() {
    const field = readerRef.current?.querySelector<HTMLInputElement>('#material-search-input')
    field?.focus()
    field?.select()
  }
  useReaderShortcuts({
    zoom: zoomReader,
    fitWidth: fitReaderWidth,
    toggleNoteBeside,
    jumpToPage: openPageJump,
    focusSearch: focusDocumentSearch,
  })
  function goToPage(next: number) {
    const target = Math.max(1, Math.min(pages || next, next))
    layoutAnchor.current = null
    setPage(target)
    setSelection(null)
    document.getElementById(`reader-page-${target}`)?.scrollIntoView({ behavior: 'instant', block: 'start' })
  }
  useEffect(() => {
    if (!pages) return
    const updatePage = () => {
      if (!positionRestored.current) return
      // A mobile modal owns scrolling. Its focus/reflow must not replace the
      // reading position in the obscured PDF with an incidental window offset.
      if (writingOnly || writingAnchor.current || (notesOpen && !wide)) return
      // A no-op resize key may not trigger ResizeObserver. Genuine scrolling
      // supersedes its anchor when measured fit geometry is still unchanged.
      if (
        layoutAnchor.current?.width === readerContext.current.pageWidth &&
        readerContext.current.fitWidth &&
        readerRef.current &&
        Math.min(760, Math.max(180, readerRef.current.clientWidth - 32)) === layoutAnchor.current.width
      )
        layoutAnchor.current = null
      const positions = Array.from(document.querySelectorAll<HTMLElement>('[data-reader-page]'))
      const atEnd = window.scrollY + window.innerHeight >= document.documentElement.scrollHeight - 2
      const current = atEnd
        ? positions.at(-1)
        : positions.findLast((node) => node.getBoundingClientRect().top <= readingLine() + 40)
      if (current) {
        const number = Number(current.dataset.readerPage)
        setPage(number)
        if (!layoutAnchor.current) {
          const rect = current.getBoundingClientRect()
          readingPoint.current = {
            number,
            fraction: Math.max(0, Math.min(1, (readingLine() - rect.top) / rect.height)),
          }
        }
      }
    }
    window.addEventListener('scroll', updatePage, { passive: true })
    updatePage()
    return () => window.removeEventListener('scroll', updatePage)
  }, [pages, pageRatios, setPage, notesOpen, wide, readingLine, writingOnly])
  useEffect(() => {
    if (!pages || pageRatios.length !== pages || positionRestored.current || writingOnly || (notesOpen && !wide)) return
    const annotation = data?.annotations.find((entry) => hash === `#annotation-${entry.id}`)
    const explicitPage =
      navigation !== 'POP' && Number.isSafeInteger(requestedPage) && requestedPage > 0 ? requestedPage : null
    const target = Math.max(1, Math.min(pages, annotation?.anchor.page ?? explicitPage ?? page))
    const frame = requestAnimationFrame(() => {
      document.getElementById(`reader-page-${target}`)?.scrollIntoView({ block: 'start', behavior: 'instant' })
      positionRestored.current = true
      setPositionReady(true)
      setPage(target)
    })
    return () => cancelAnimationFrame(frame)
  }, [
    pages,
    pageRatios,
    data?.annotations,
    hash,
    requestedPage,
    navigation,
    page,
    setPage,
    notesOpen,
    wide,
    writingOnly,
  ])
  async function collectExcerpt() {
    if (!data || !selection) return
    try {
      await prepareReaderTarget(data)
      appendReaderExcerpt({ material: data, quote: selection.quote, page: selection.page, rects: selection.rects })
      setExcerptRevision((current) => current + 1)
      setStudyTab('notes')
      setNotesOpen(true)
      setSelection(null)
      window.getSelection()?.removeAllRanges()
      setActionError('')
      setActionMessage(t('excerptAdded'))
    } catch (cause) {
      setActionError(
        t(
          cause instanceof ReaderExcerptError && cause.code === 'tooLong'
            ? 'excerptTooLong'
            : cause instanceof ReaderExcerptError && cause.code === 'invalid'
              ? 'excerptInvalid'
              : 'excerptStorageFailed',
        ),
      )
    }
  }
  function createOwnCard(annotation: MaterialAnnotation) {
    if (!data) return
    const context = manualCardContext(data, annotation)
    if (context) {
      cardDialogActive.current = true
      cardReturnAnnotation.current = annotation.id
      setCardContext(context)
    }
  }
  function closeOwnCard() {
    cardDialogActive.current = false
    setCardContext(null)
  }
  function restoreOwnCardFocus(event: Event) {
    event.preventDefault()
    if (cardDialogActive.current || !readerRef.current) return
    const action = Array.from(document.querySelectorAll<HTMLElement>('[data-manual-card-source]')).find(
      (element) => element.dataset.manualCardSource === cardReturnAnnotation.current,
    )
    const target = action ?? readerRef.current.querySelector<HTMLElement>('.reader-page-jump > summary')
    target?.focus({ preventScroll: true })
  }
  const workspace = data && (
    <>
      <div className="material-side-header">
        <div>
          <Dialog.Title className="material-side-title">{t('annotationsDialogTitle')}</Dialog.Title>
          <Dialog.Description id="material-side-description" className="material-side-description muted-text">
            {t('annotationsDialogDescription')}
          </Dialog.Description>
        </div>
        <Dialog.Close asChild>
          <Button variant="ghost" size="icon" aria-label={t('closeAnnotationsAria')}>
            <X size={18} />
          </Button>
        </Dialog.Close>
      </div>
      <ReaderStudyTools
        material={data}
        tab={studyTab}
        onTabChange={setStudyTab}
        excerptRevision={excerptRevision}
        onPage={(next) => {
          goToPage(next)
          if (!wide) setNotesOpen(false)
        }}
        canWrite={canWrite}
        onCreateCard={createOwnCard}
        savedNoteHref={savedNoteHref}
        onNoteChange={onNoteChange}
        selectedNoteId={citedNoteId ?? selectedNoteId}
        currentPage={page}
        pageCount={pages || undefined}
      >
        <ReaderAnnotations
          material={data}
          pending={pending}
          canWrite={canWrite}
          onPage={(next) => {
            goToPage(next)
            if (!wide) setNotesOpen(false)
          }}
          onUpdate={update}
          onDelete={remove}
          onCreateCard={createOwnCard}
          onReanchor={(entry) => {
            setReanchorId(entry.id)
            setSelection(null)
            if (!wide) setNotesOpen(false)
          }}
          citations={
            <ReaderCitations
              material={data}
              citations={citations.data?.citations}
              error={citations.error}
              retry={citations.reload}
              onPage={(next) => {
                goToPage(next)
                if (!wide) setNotesOpen(false)
              }}
              onOpenBeside={openCitingNote}
            />
          }
        />
      </ReaderStudyTools>
    </>
  )
  const Frame = embedded ? EmbeddedMaterialFrame : Shell
  return (
    <Frame
      title={data?.resource_name ?? t('defaultTitle')}
      eyebrow={t('eyebrow')}
      cachedAt={updatedAt}
      compactNavigation
      breadcrumbs={[
        { label: nav('courses'), to: '/courses' },
        ...(data ? [{ label: data.course_name, to: `/courses/${data.course_id}` }] : []),
        { label: data?.resource_name ?? t('defaultTitle'), to: `/material/${versionId}` },
        ...(data ? [{ label: t('pageLabel', { page }) }] : []),
      ]}
    >
      {!embedded && (
        <div className="page-actions material-page-actions">
          <Link className="subtle-link" to={data ? `/courses/${data.course_id}` : '/courses'}>
            {t('backToCourse')}
          </Link>
          {data && <span className="muted-text">{data.course_name}</span>}
        </div>
      )}
      {!data && Number.isInteger(versionId) && versionId > 0 && (
        // Not part of the actions bar, which the workspace layout hides: a document that cannot
        // be shown must stay downloadable everywhere.
        <p className="material-download-fallback">
          <a className="subtle-link" href={offlineDownloadUrl} download>
            {t('downloadOriginal')}
          </a>
        </p>
      )}
      {loading && !data ? (
        <Loading />
      ) : error ? (
        <Failure message={error} />
      ) : data && expectedCourseId !== undefined && data.course_id !== expectedCourseId ? (
        <Failure message={learning('focusForeignSource')} />
      ) : (
        data && (
          <Dialog.Root open={notesOpen && !cardContext} onOpenChange={setNotesOpen} modal={!wide && !cardContext}>
            <div className="material-toolbar" ref={toolbarRef}>
              {!embedded && (
                <Link
                  className="reader-course-link"
                  to={`/courses/${data.course_id}`}
                  aria-label={`${t('backToCourse')}: ${data.course_name}`}
                  title={data.course_name}
                >
                  <ChevronLeft size={15} aria-hidden="true" />
                  <span>{data.course_name}</span>
                </Link>
              )}
              <nav className="reader-layout-modes" aria-label={t('workspaceLayout')}>
                {(['read', ...(wide ? (['split'] as const) : []), 'write'] as const).map((mode) => (
                  <Button
                    key={mode}
                    size="sm"
                    variant="ghost"
                    aria-pressed={mode === (notesOpen ? (writingOnly || !wide ? 'write' : 'split') : 'read')}
                    onClick={() => chooseWorkspaceLayout(mode)}
                  >
                    {t(`layout_${mode}`)}
                  </Button>
                ))}
              </nav>
              {data.versions.length > 1 && (
                <label>
                  {t('versionLabel')}{' '}
                  <select
                    className="native-select"
                    value={data.version_id}
                    onChange={(event) => {
                      setPage(1)
                      setSelection(null)
                      if (onVersionChange) onVersionChange(Number(event.target.value))
                      else window.location.assign(`/material/${event.target.value}`)
                    }}
                  >
                    {data.versions.map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.version}
                      </option>
                    ))}
                  </select>
                </label>
              )}
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setStudyTab('annotations')
                  setNotesOpen(true)
                }}
              >
                {t('annotationsButton', { count: data.annotations.length })}
              </Button>
              {canWrite && ocr && ocr.pending_pages > 0 && (
                <Button
                  variant="outline"
                  size="sm"
                  disabled={ocrRunning || !ocr.available || !online}
                  onClick={() => void recognizeText()}
                >
                  {ocrRunning ? t('ocrRunningLabel') : t('ocrRecognizeButton')}
                </Button>
              )}
              <details className="material-file-actions">
                <summary>
                  {t('moreSummary')} <ChevronRight size={14} />
                </summary>
                <div>
                  {!embedded && (
                    <Link
                      to={focusPath(
                        { kind: 'course', id: data.course_id },
                        { mode: 'source', version: versionId, page },
                      )}
                      onClick={() => {
                        storeNotesOpen(true)
                        setStudyTab('notes')
                      }}
                    >
                      <PanelsTopLeft size={15} aria-hidden="true" />
                      {studyWorkspace('open')}
                    </Link>
                  )}
                  {canWrite && (
                    <Link
                      to={`/notes?new=1&course_id=${data.course_id}&resource_id=${data.resource_id}&title=${encodeURIComponent(data.resource_name.replace(/\.[^/.]+$/, ''))}`}
                    >
                      {t('createNoteLink')}
                    </Link>
                  )}
                  <Link to={`/assessment?course=${data.course_id}&version=${versionId}&page=${page}`}>
                    {t('checkSection')}
                  </Link>
                  <a href={offlineDownloadUrl} download={data.resource_name}>
                    <ArrowDownToLine size={15} /> {t('downloadOriginal')}
                  </a>
                  <a href={`/api/material/${versionId}/export`}>
                    <ArrowDownToLine size={15} /> {t('exportWithAnnotations')}
                  </a>
                  {!embedded && (
                    <EntityProperties
                      rows={[
                        {
                          label: t('courseLabel'),
                          value: <Link to={`/courses/${data.course_id}`}>{data.course_name}</Link>,
                        },
                        { label: t('fileLabel'), value: data.resource_name },
                        { label: t('versionRowLabel'), value: String(data.version) },
                        {
                          label: t('questionsLabel'),
                          value: String(
                            data.annotations.filter((item) => item.kind === 'question' && !item.resolved).length,
                          ),
                        },
                      ]}
                      metadata={{ kind: 'material', id: String(data.resource_id) }}
                      activity={{ kind: 'material', id: String(data.resource_id) }}
                    />
                  )}
                </div>
              </details>
            </div>
            {ocr && ocr.pending_pages > 0 && !ocr.available && <p className="muted-text mb-4">{t('ocrUnavailable')}</p>}
            <div
              className="material-layout"
              ref={layoutRef}
              data-study-open={wide && notesOpen}
              data-reader-layout={writingOnly ? 'write' : notesOpen && wide ? 'split' : 'read'}
              style={
                {
                  '--reader-side-width': `${sideWidth}px`,
                  '--reader-toolbar-height': `${toolbarHeight}px`,
                } as CSSProperties
              }
            >
              <div
                className="material-reader"
                data-workspace-pending={pageRatios.length !== pages || !pages || !positionReady ? true : undefined}
                data-reader-position-ready={positionReady ? true : undefined}
                ref={readerRef}
                data-zoomed={!fitWidth}
              >
                <ReaderToolbar
                  page={page}
                  pages={pages}
                  ready={Boolean(pdfDocument)}
                  goToPage={goToPage}
                  pageOverview={pageOverview}
                  onToggleOverview={() => setPageOverview(!pageOverview)}
                  notesExpanded={notesOpen && studyTab === 'notes'}
                  onOpenNotes={() => {
                    setStudyTab('notes')
                    setNotesOpen(true)
                  }}
                  search={documentSearch}
                  pageWidth={pageWidth}
                  fitWidth={fitWidth}
                  onZoom={zoomReader}
                  onZoomTo={zoomReaderTo}
                  onFitWidth={fitReaderWidth}
                  originalColors={originalColors}
                  onToggleColors={() => setOriginalColors((value) => !value)}
                />
                <ReaderSearchFeedback search={documentSearch} total={pdfDocument?.numPages ?? pages} />
                {pageOverview && pdfDocument && (
                  <ReaderPageNavigator
                    pdf={pdfDocument}
                    currentPage={page}
                    onPage={goToPage}
                    badges={pageBadges(documentSearch.results, data?.annotations ?? [])}
                  />
                )}
                {pdfDocument && (
                  <PdfClipTool
                    pdf={pdfDocument}
                    material={data}
                    page={page}
                    canWrite={canWrite && online}
                    onApply={async (blocks) => {
                      await prepareReaderTarget(data)
                      appendReaderBlock(data, blocks)
                      setExcerptRevision((current) => current + 1)
                      setStudyTab('notes')
                      setNotesOpen(true)
                      setActionMessage(t('clip.saved'))
                    }}
                  />
                )}
                <ReaderSearchNavigation search={documentSearch} page={page} />
                <p className="muted-text material-hint">{reanchorId ? t('reanchorHint') : t('selectHint')}</p>
                {reanchorId && !selection && (
                  <Button variant="ghost" size="sm" onClick={() => setReanchorId(null)}>
                    {t('cancelReanchor')}
                  </Button>
                )}
                {selection && (
                  <div
                    className="material-selection"
                    role="region"
                    aria-label={t('textSelectionAria')}
                    style={{ left: selectionFrame.left, width: selectionFrame.width }}
                  >
                    <strong>{t('selectedQuote', { quote: selection.quote })}</strong>
                    {actionError && <Failure message={actionError} />}
                    {!reanchorId && (
                      <textarea
                        aria-label={t('annotationCommentAria')}
                        placeholder={t('commentPlaceholder')}
                        rows={2}
                        value={comment}
                        onChange={(event) => setComment(event.target.value)}
                        maxLength={5000}
                      />
                    )}
                    <div>
                      {reanchorId ? (
                        <>
                          <Button disabled={!canWrite || saving} onClick={() => void reassign()}>
                            {t('reanchorHereButton')}
                          </Button>{' '}
                          <Button
                            variant="ghost"
                            onClick={() => {
                              setReanchorId(null)
                              setSelection(null)
                            }}
                          >
                            {t('cancelButton')}
                          </Button>
                        </>
                      ) : (
                        <>
                          <Button disabled={(online && !canWrite) || saving} onClick={() => void add('highlight')}>
                            {t('highlightButton')}
                          </Button>{' '}
                          <Button
                            variant="outline"
                            disabled={(online && !canWrite) || saving}
                            onClick={() => void add('question')}
                          >
                            <MessageCircleQuestion size={16} /> {t('questionButton')}
                          </Button>
                          <Button variant="outline" disabled={saving} onClick={() => void collectExcerpt()}>
                            {t('addExcerpt')}
                          </Button>
                          <Button
                            variant="ghost"
                            disabled={saving}
                            aria-label={t('clearSelection')}
                            onClick={() => {
                              setSelection(null)
                              window.getSelection()?.removeAllRanges()
                            }}
                          >
                            <X size={16} />
                          </Button>
                        </>
                      )}
                    </div>
                  </div>
                )}
                {!selection && (actionError || actionMessage) && (
                  <div
                    className="material-selection material-feedback"
                    style={{ left: selectionFrame.left, width: selectionFrame.width }}
                  >
                    {actionError ? <Failure message={actionError} /> : <p role="status">{actionMessage}</p>}
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label={t('dismissFeedback')}
                      onClick={() => {
                        setActionError('')
                        setActionMessage('')
                      }}
                    >
                      <X size={16} />
                    </Button>
                  </div>
                )}
                <div className="material-viewport" ref={viewportRef}>
                  <Document
                    file={offlinePdfUrl}
                    suspense={false}
                    loading={<Loading />}
                    error={<Failure message={t('pdfLoadFailed')} />}
                    onLoadSuccess={(document) => {
                      setPdfDocument(document)
                      setPages(document.numPages)
                      setPage((current) => Math.min(current, document.numPages))
                      if (canWrite)
                        void request(`/api/analytics/material-versions/${versionId}/opened`, {
                          method: 'POST',
                        }).catch(() => {
                          /* Reading remains possible when analytics cannot be recorded. */
                        })
                    }}
                  >
                    <div className="material-pages" data-reader-zoom-surface aria-label={t('pdfPagesAria')}>
                      {pdfDocument &&
                        !pageRatios.length &&
                        (pageSizeError ? <Failure message={t('pdfLoadFailed')} /> : <Loading />)}
                      {pageRatios.map((ratio, index) => (
                        <ReaderPage
                          key={index + 1}
                          number={index + 1}
                          width={pageWidth}
                          ratio={ratio}
                          originalColors={originalColors}
                          annotations={data.annotations}
                          pendingSelection={selection ?? citedPassage}
                          onSelect={captureSelection}
                          citationCount={pageCitations.get(index + 1) ?? 0}
                          onCitations={showCitations}
                        />
                      ))}
                    </div>
                  </Document>
                </div>
              </div>
              {wide && notesOpen && (
                <>
                  <div
                    className="reader-split-handle"
                    hidden={writingOnly}
                    role="separator"
                    tabIndex={0}
                    aria-orientation="vertical"
                    aria-label={t('resizeWorkspace')}
                    aria-valuemin={320}
                    aria-valuemax={maxSideWidth}
                    aria-valuenow={sideWidth}
                    title={studyWorkspace('splitHint')}
                    onDoubleClick={() => {
                      preserveReadingPosition()
                      setSideWidth(0)
                    }}
                    onPointerDown={(event) => {
                      preserveReadingPosition()
                      resizeStart.current = { x: event.clientX, width: sideWidth }
                      event.currentTarget.setPointerCapture(event.pointerId)
                    }}
                    onPointerMove={(event) => {
                      if (!resizeStart.current) return
                      preserveReadingPosition()
                      setSideWidth(
                        Math.max(
                          320,
                          Math.min(maxSideWidth, resizeStart.current.width + resizeStart.current.x - event.clientX),
                        ),
                      )
                    }}
                    onPointerUp={() => {
                      resizeStart.current = null
                    }}
                    onLostPointerCapture={() => {
                      resizeStart.current = null
                    }}
                    onKeyDown={(event) => {
                      if (!['ArrowLeft', 'ArrowRight', 'Home', 'End', 'Enter'].includes(event.key)) return
                      event.preventDefault()
                      preserveReadingPosition()
                      setSideWidth(
                        event.key === 'Enter'
                          ? 0
                          : event.key === 'Home'
                            ? 320
                            : event.key === 'End'
                              ? maxSideWidth
                              : Math.max(
                                  320,
                                  Math.min(maxSideWidth, sideWidth + (event.key === 'ArrowLeft' ? 20 : -20)),
                                ),
                      )
                    }}
                  />
                  <Dialog.Content
                    className="material-side-inline"
                    aria-describedby="material-side-description"
                    onInteractOutside={(event) => event.preventDefault()}
                    onOpenAutoFocus={(event) => event.preventDefault()}
                    onCloseAutoFocus={(event) => event.preventDefault()}
                  >
                    {workspace}
                  </Dialog.Content>
                </>
              )}
            </div>
            <FirstUseHint name="reader" message={quality('firstReaderHint')} />
            {!wide && (
              <Dialog.Portal>
                <Dialog.Overlay className="material-side-overlay" />
                <Dialog.Content
                  className="material-side-drawer"
                  aria-modal="true"
                  aria-describedby="material-side-description"
                  onCloseAutoFocus={(event) => {
                    event.preventDefault()
                    if (cardDialogActive.current) return
                    // The opening control may be 80 pages above the source.
                    // The page jump summary stays visible, including on page one;
                    // buttons inside closed details cannot receive keyboard focus.
                    readerRef.current
                      ?.querySelector<HTMLElement>('.reader-page-jump > summary')
                      ?.focus({ preventScroll: true })
                  }}
                >
                  {workspace}
                </Dialog.Content>
              </Dialog.Portal>
            )}
          </Dialog.Root>
        )
      )}
      <AddonWidgetSlot slot="material.actions" />
      {cardContext && (
        <ManualCardDialog
          context={cardContext}
          canWrite={canWrite}
          onClose={closeOwnCard}
          onCloseAutoFocus={restoreOwnCardFocus}
        />
      )}
    </Frame>
  )
}

// SPDX-License-Identifier: AGPL-3.0-or-later
import { useEffect, useRef, useState } from 'react'
import { Document, Page, pdfjs } from 'react-pdf'
import 'react-pdf/dist/Page/TextLayer.css'
import { useOfflineFileUrl } from '@/lib/courseOffline'
import { useT } from '@/i18n/useT'
import { Loading } from '@/components/State'

pdfjs.GlobalWorkerOptions.workerSrc = new URL('pdfjs-dist/build/pdf.worker.min.mjs', import.meta.url).toString()

/** A separate read-only preview never changes the full reader's saved position. */
export default function CollectionPdfPreview({ id }: { id: number }) {
  const { t } = useT('collections')
  const url = useOfflineFileUrl(id)
  const root = useRef<HTMLDivElement>(null)
  const [width, setWidth] = useState(300)
  const [pages, setPages] = useState(0)
  const [page, setPage] = useState(1)
  useEffect(() => {
    const current = root.current
    if (!current) return
    const observer = new ResizeObserver(() => setWidth(Math.max(150, current.clientWidth)))
    observer.observe(current)
    return () => observer.disconnect()
  }, [])
  return (
    <div className="collection-pdf-preview" ref={root}>
      <div className="collection-pdf-controls">
        <button type="button" disabled={page <= 1} aria-label={t('previewPrevious')} onClick={() => setPage(page - 1)}>
          ←
        </button>
        <span>{t('previewPage', { page, count: pages || '…' })}</span>
        <button
          type="button"
          disabled={!pages || page >= pages}
          aria-label={t('previewNext')}
          onClick={() => setPage(page + 1)}
        >
          →
        </button>
      </div>
      <Document
        file={url}
        loading={<Loading variant="rows" />}
        error={<p role="alert">{t('previewUnavailable')}</p>}
        onLoadSuccess={({ numPages }) => setPages(numPages)}
      >
        <Page
          pageNumber={page}
          width={width}
          renderAnnotationLayer={false}
          renderTextLayer
          loading={<Loading variant="rows" />}
        />
      </Document>
    </div>
  )
}

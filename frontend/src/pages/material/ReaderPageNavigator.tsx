// SPDX-License-Identifier: AGPL-3.0-or-later

import { Page } from 'react-pdf'
import type { PDFDocumentProxy } from 'pdfjs-dist'
import { useEffect, useRef, useState, type RefObject } from 'react'
import { useT } from '@/i18n/useT'
import './ReaderPageNavigator.css'

type Badge = { hits: number; marks: number }

function PageThumbnail({
  pdf,
  number,
  active,
  root,
  onPage,
  badge,
}: {
  pdf: PDFDocumentProxy
  number: number
  active: boolean
  root: RefObject<HTMLDivElement | null>
  onPage: (number: number) => void
  badge?: Badge
}) {
  const { t } = useT('material')
  const button = useRef<HTMLButtonElement>(null)
  const [near, setNear] = useState(false)
  useEffect(() => {
    if (!button.current) return
    const observer = new IntersectionObserver(([entry]) => setNear(entry.isIntersecting), {
      root: root.current,
      rootMargin: '0px 180px',
    })
    observer.observe(button.current)
    return () => observer.disconnect()
  }, [root])
  return (
    <button
      ref={button}
      type="button"
      data-thumbnail-page={number}
      aria-current={active ? 'page' : undefined}
      aria-label={[
        t('thumbnailPage', { page: number }),
        badge?.hits ? t('thumbnailHits', { count: badge.hits }) : '',
        badge?.marks ? t('thumbnailMarks', { count: badge.marks }) : '',
      ]
        .filter(Boolean)
        .join(', ')}
      data-has-hits={badge?.hits ? 'true' : undefined}
      onClick={() => onPage(number)}
    >
      <span className="reader-thumbnail-image" aria-hidden="true">
        {near && (
          <Page
            pdf={pdf}
            pageNumber={number}
            width={78}
            devicePixelRatio={1}
            renderTextLayer={false}
            renderAnnotationLayer={false}
            suspense={false}
            _enableRegisterUnregisterPage={false}
            loading={null}
            error={null}
          />
        )}
      </span>
      <span>{number}</span>
      {/* Where the search found something, and where your highlights are, before opening the page. */}
      {badge && (badge.hits > 0 || badge.marks > 0) && (
        <span className="reader-thumbnail-badges" aria-hidden="true">
          {badge.hits > 0 && <span className="reader-thumbnail-hits">{badge.hits}</span>}
          {badge.marks > 0 && <span className="reader-thumbnail-marks">{badge.marks}</span>}
        </span>
      )}
    </button>
  )
}

export function ReaderPageNavigator({
  pdf,
  currentPage,
  onPage,
  badges,
}: {
  pdf: PDFDocumentProxy
  currentPage: number
  onPage: (number: number) => void
  badges?: Map<number, Badge>
}) {
  const { t } = useT('material')
  const root = useRef<HTMLDivElement>(null)
  useEffect(() => {
    // Scroll only the rail, never the outer document or its current PDF page.
    const rail = root.current
    const target = rail?.querySelector<HTMLElement>(`[data-thumbnail-page="${currentPage}"]`)
    if (rail && target) {
      if (target.offsetLeft < rail.scrollLeft) rail.scrollLeft = target.offsetLeft
      else if (target.offsetLeft + target.offsetWidth > rail.scrollLeft + rail.clientWidth)
        rail.scrollLeft = target.offsetLeft + target.offsetWidth - rail.clientWidth
    }
  }, [currentPage])
  return (
    <div className="reader-page-navigator" ref={root} role="region" aria-label={t('pageOverview')}>
      {Array.from({ length: pdf.numPages }, (_, index) => (
        <PageThumbnail
          key={index + 1}
          pdf={pdf}
          number={index + 1}
          active={currentPage === index + 1}
          root={root}
          onPage={onPage}
          badge={badges?.get(index + 1)}
        />
      ))}
    </div>
  )
}

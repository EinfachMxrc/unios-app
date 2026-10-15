// SPDX-License-Identifier: AGPL-3.0-or-later

import { useEffect, useRef, useState } from 'react'
import { useT } from '@/i18n/useT'
import type { Sheet } from '@/lib/xlsxSheets'
import { TableView } from './TableView'

/**
 * A Word document drawn page by page in the app (docx-preview), so it opens
 * without Word or LibreOffice. Pages keep their paper colour, like PDFs.
 */
export function DocxView({ data, onError }: { data: ArrayBuffer; onError: (reason: string) => void }) {
  const host = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const target = host.current
    if (!target) return
    let cancelled = false
    void import('docx-preview')
      .then(({ renderAsync }) =>
        renderAsync(data, target, undefined, {
          className: 'docx',
          inWrapper: true,
          breakPages: true,
          ignoreLastRenderedPageBreak: true,
          renderHeaders: true,
          renderFooters: true,
          renderFootnotes: true,
          useBase64URL: false,
          experimental: false,
        }),
      )
      .catch((cause: unknown) => {
        if (!cancelled) onError(cause instanceof Error ? cause.message : String(cause))
      })
    return () => {
      cancelled = true
      target.replaceChildren()
    }
  }, [data, onError])
  return <div className="docx-view" ref={host} />
}

/** An Excel workbook as one table per sheet, switched with tabs. */
export function XlsxView({ data, onError }: { data: ArrayBuffer; onError: (reason: string) => void }) {
  const { t } = useT('material')
  const [sheets, setSheets] = useState<Sheet[] | null>(null)
  const [active, setActive] = useState(0)
  useEffect(() => {
    let cancelled = false
    void import('@/lib/xlsxSheets')
      .then(({ readWorkbook }) => readWorkbook(data))
      .then((result) => {
        if (!cancelled) setSheets(result)
      })
      .catch((cause: unknown) => {
        if (!cancelled) onError(cause instanceof Error ? cause.message : String(cause))
      })
    return () => {
      cancelled = true
    }
  }, [data, onError])
  if (!sheets) return <p className="muted-text">{t('viewerLoading')}</p>
  const sheet = sheets[Math.min(active, sheets.length - 1)]
  return (
    <>
      {sheets.length > 1 && (
        <div className="sheet-tabs" role="tablist" aria-label={t('viewerSheets')}>
          {sheets.map((item, index) => (
            <button
              key={item.name}
              type="button"
              role="tab"
              aria-selected={index === active}
              onClick={() => setActive(index)}
            >
              {item.name}
            </button>
          ))}
        </div>
      )}
      {sheet ? (
        <TableView rows={sheet.rows} truncated={sheet.truncated} label={sheet.name} />
      ) : (
        <p className="muted-text">{t('viewerEmptySheet')}</p>
      )}
    </>
  )
}

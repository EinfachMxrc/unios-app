// SPDX-License-Identifier: AGPL-3.0-or-later
import { useEffect, useState } from 'react'
import { CalendarDays, Copy } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useT } from '@/i18n/useT'
import {
  LectureCoverageError,
  lectureCoverage,
  lectureToday,
  formatLecturePages,
  recordLectureCoverage,
  lectureDraftPrompt,
  type LectureSource,
} from '@/lib/lectureCoverage'
import './LectureCoveragePanel.css'
export type { LectureSource } from '@/lib/lectureCoverage'

export function LectureCoveragePanel({
  body,
  onChange,
  source,
  disabled = false,
  embedded = false,
}: {
  body: string
  onChange: (body: string) => void
  source: LectureSource
  disabled?: boolean
  embedded?: boolean
}) {
  const { t } = useT('lectureCoverage')
  const [date, setDate] = useState(lectureToday)
  const saved = lectureCoverage(body, source, date)
  const [pages, setPages] = useState(() => (saved ? formatLecturePages(saved.pages) : String(source.currentPage ?? 1)))
  const [edited, setEdited] = useState(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  useEffect(() => {
    if (!edited) {
      const recorded = lectureCoverage(body, source, date)
      setPages(recorded ? formatLecturePages(recorded.pages) : String(source.currentPage ?? 1))
    }
  }, [body, source, date, edited])
  function record() {
    try {
      const result = recordLectureCoverage(body, source, date, pages)
      onChange(result.body)
      setMessage(t('recorded'))
      setError('')
    } catch (cause) {
      setMessage('')
      setError(t(cause instanceof LectureCoverageError ? `error_${cause.code}` : 'error_document'))
    }
  }
  async function copy() {
    try {
      const result = recordLectureCoverage(body, source, date, pages)
      onChange(result.body)
      await navigator.clipboard.writeText(lectureDraftPrompt(source, result.coverage))
      setError('')
      setMessage(t('copied'))
    } catch (cause) {
      setMessage('')
      setError(t(cause instanceof LectureCoverageError ? `error_${cause.code}` : 'copyFailed'))
    }
  }
  const content = (
    <div className="lecture-coverage-content">
      <p>{t('description')}</p>
      <p className="muted-text">
        {source.resourceName} · {t('version', { version: source.version })}
      </p>
      <div
        className="lecture-coverage-fields"
        onKeyDown={(event) => {
          if (event.key === 'Enter' && !event.nativeEvent.isComposing) {
            event.preventDefault()
            if (!disabled) record()
          }
        }}
      >
        <label>
          {t('date')}
          <input
            type="date"
            value={date}
            disabled={disabled}
            onChange={(event) => {
              const next = event.target.value
              setDate(next)
              const recorded = lectureCoverage(body, source, next)
              if (recorded) setPages(formatLecturePages(recorded.pages))
              setEdited(false)
              setError('')
              setMessage('')
            }}
          />
        </label>
        <label>
          {t('pages')}
          <input
            value={pages}
            maxLength={400}
            disabled={disabled}
            placeholder="5-12, 18"
            onChange={(event) => {
              setPages(event.target.value)
              setEdited(true)
              setError('')
              setMessage('')
            }}
          />
        </label>
      </div>
      <p className="muted-text">{t('pagesHint', { count: source.pageCount ?? '—' })}</p>
      <div className="lecture-coverage-actions">
        <Button type="button" size="sm" variant="outline" disabled={disabled} onClick={record}>
          {t('record')}
        </Button>
        <Button type="button" size="sm" variant="ghost" disabled={disabled} onClick={() => void copy()}>
          <Copy size={15} aria-hidden="true" />
          {t('copy')}
        </Button>
      </div>
      {message && <p role="status">{message}</p>}
      {error && <p role="alert">{error}</p>}
    </div>
  )
  return embedded ? (
    content
  ) : (
    <details className="lecture-coverage-panel">
      <summary>
        <CalendarDays size={16} aria-hidden="true" />
        {t('title')}
        {saved && <span>{formatLecturePages(saved.pages)}</span>}
      </summary>
      {content}
    </details>
  )
}

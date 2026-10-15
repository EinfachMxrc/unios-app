// SPDX-License-Identifier: AGPL-3.0-or-later

import { useEffect, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { Link } from 'react-router-dom'
import { ArrowRight, BookOpen, X } from 'lucide-react'
import { useT } from '@/i18n/useT'
import type { TypedT } from '@/i18n/useT'
import { Button } from '@/components/ui/button'
import { useApi } from '@/api'
import './StudyPeekLink.css'

type Peek = {
  id: string
  title: string
  course_name: string
  excerpt: string
  topic_name: string | null
  anki_retention: number | null
  anki_review_count: number
  exercise_accuracy: number | null
  exercise_attempt_count: number
  confidence: 'low' | 'medium' | 'high' | null
  open_questions: number
}

function percentage(value: number | null, t: TypedT<'studyPeek'>) {
  return value === null ? t('notEnoughDataText') : `${Math.round(value * 100)} %`
}

export function StudyPeekLink({
  id,
  children,
  className = '',
}: {
  id: string
  children: ReactNode
  className?: string
}) {
  const { t } = useT('studyPeek')
  const { t: quality } = useT('quality')
  const skipFocus = useRef(false)
  const touchGesture = useRef(false)
  const [open, setOpen] = useState(false)
  const [side, setSide] = useState<'left' | 'right'>('left')
  const [above, setAbove] = useState(false)
  const [mobile, setMobile] = useState(() => window.innerWidth <= 600)
  const card = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const resize = () => setMobile(window.innerWidth <= 600)
    window.addEventListener('resize', resize)
    return () => window.removeEventListener('resize', resize)
  }, [])
  const anchor = useRef<HTMLSpanElement>(null)
  const trigger = useRef<HTMLAnchorElement>(null)
  const timer = useRef<number | null>(null)
  const { data, error, loading } = useApi<Peek>(`/api/notes/${id}/peek`, { enabled: open })

  function show() {
    cancel()
    const bounds = anchor.current?.getBoundingClientRect()
    if (bounds) {
      setSide(bounds.left > window.innerWidth / 2 ? 'right' : 'left')
      setAbove(bounds.bottom + 310 > window.innerHeight && bounds.top > 310)
    }
    setOpen(true)
  }
  function close() {
    cancel()
    setOpen(false)
    skipFocus.current = true
    trigger.current?.focus()
  }
  function schedule() {
    cancel()
    if (!mobile) timer.current = window.setTimeout(show, 180)
  }
  function cancel() {
    if (timer.current !== null) window.clearTimeout(timer.current)
    timer.current = null
  }
  useEffect(() => {
    if (!open) return
    function outside(event: PointerEvent) {
      if (
        anchor.current &&
        !anchor.current.contains(event.target as Node) &&
        !card.current?.contains(event.target as Node)
      )
        setOpen(false)
    }
    document.addEventListener('pointerdown', outside)
    return () => document.removeEventListener('pointerdown', outside)
  }, [open])
  useEffect(() => () => cancel(), [])

  const preview = open ? (
    <div
      ref={card}
      className={`study-peek-card ${mobile ? 'is-sheet' : ''}`}
      role="dialog"
      aria-label={t('previewLabel', { title: data?.title ?? t('defaultNoteTitle') })}
    >
      <Button
        type="button"
        className="study-peek-close"
        size="icon"
        variant="ghost"
        aria-label={quality('closePreview')}
        onClick={close}
      >
        <X size={16} />
      </Button>
      {loading && !data ? (
        <p>{t('loadingText')}</p>
      ) : error ? (
        <p>{t('unavailableText')}</p>
      ) : (
        data && (
          <>
            <div className="study-peek-heading">
              <BookOpen size={15} />
              <span>{data.course_name}</span>
            </div>
            <strong>{data.title}</strong>
            <p className="study-peek-excerpt">{data.excerpt || t('noExcerptText')}</p>
            {data.topic_name ? (
              <dl className="study-peek-stats">
                <div>
                  <dt>{t('ankiRetentionLabel')}</dt>
                  <dd>{percentage(data.anki_retention, t)}</dd>
                </div>
                <div>
                  <dt>{t('exerciseAccuracyLabel')}</dt>
                  <dd>{percentage(data.exercise_accuracy, t)}</dd>
                </div>
                <div>
                  <dt>{t('openQuestionsLabel')}</dt>
                  <dd>{data.open_questions}</dd>
                </div>
              </dl>
            ) : (
              <p className="study-peek-context">{t('noTopicText')}</p>
            )}
            <Link to={`/notes?id=${id}`} className="study-peek-open">
              {t('openNoteLink')} <ArrowRight size={14} />
            </Link>
          </>
        )
      )}
    </div>
  ) : null

  return (
    <span
      ref={anchor}
      className="study-peek-anchor"
      data-side={side}
      data-above={above}
      onMouseEnter={schedule}
      onMouseLeave={() => {
        cancel()
        if (!mobile) setOpen(false)
      }}
      onFocus={() => {
        if (!skipFocus.current) show()
        skipFocus.current = false
      }}
      onBlur={(event) => {
        if (
          !mobile &&
          !event.currentTarget.contains(event.relatedTarget) &&
          !card.current?.contains(event.relatedTarget)
        )
          setOpen(false)
      }}
      onKeyDown={(event) => {
        if (event.key === 'Escape') {
          event.stopPropagation()
          close()
        }
      }}
    >
      <Link
        ref={trigger}
        onPointerDown={(event) => {
          touchGesture.current = event.pointerType === 'touch'
          skipFocus.current = touchGesture.current
        }}
        to={`/notes?id=${id}`}
        className={className}
        onClick={(event) => {
          if (mobile || touchGesture.current || window.matchMedia('(hover: none)').matches) {
            event.preventDefault()
            if (open) close()
            else show()
          }
          touchGesture.current = false
        }}
      >
        {children}
      </Link>
      {preview && (mobile ? createPortal(preview, document.body) : preview)}
    </span>
  )
}

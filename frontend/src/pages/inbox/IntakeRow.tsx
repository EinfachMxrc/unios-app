// SPDX-License-Identifier: AGPL-3.0-or-later

import { localDate, request, useApi } from '@/api'
import { ActionFeedback } from '@/components/ActionFeedback'
import { Button } from '@/components/ui/button'
import { useWritableHost } from '@/hooks/host'
import { useT } from '@/i18n/useT'
import { motionDuration, waitForMotion } from '@/lib/motion'
import type { CoursesResponse } from '@/types'
import { ArrowRight, Link2 } from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import type { IntakeItem, IntakeTarget, IntakeState } from './types'
export function IntakeRow({
  item,
  items,
  courses,
  filter,
  reload,
}: {
  item: IntakeItem
  items: IntakeItem[]
  courses: CoursesResponse['courses']
  filter: 'open' | 'snoozed' | 'done'
  reload: () => void
}) {
  const { t } = useT('inbox')
  const canWrite = useWritableHost()
  const [courseId, setCourseId] = useState(item.course_id?.toString() ?? '')
  const [target, setTarget] = useState(
    item.target_kind && item.target_id ? `${item.target_kind}:${item.target_id}` : '',
  )
  const [later, setLater] = useState(item.critical ? '4' : '24')
  const [duplicateOf, setDuplicateOf] = useState('')
  const [showDuplicate, setShowDuplicate] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [successMessage, setSuccessMessage] = useState('')
  const [removing, setRemoving] = useState(false)
  const [mobileOpen, setMobileOpen] = useState(false)
  const [mobileClosing, setMobileClosing] = useState(false)
  const row = useRef<HTMLElement>(null)
  const sheetClosing = useRef(false)
  const closeTimer = useRef<number | null>(null)
  const mobileTrigger = useRef<HTMLButtonElement>(null)
  const mobileSheet = useRef<HTMLDivElement>(null)
  const closeButton = useRef<HTMLButtonElement>(null)
  const { data: targets } = useApi<IntakeTarget[]>(`/api/intake/targets?course_id=${courseId}`, {
    enabled: Boolean(courseId),
  })
  useEffect(() => setCourseId(item.course_id?.toString() ?? ''), [item.course_id])
  const closeMobile = useCallback(() => {
    if (sheetClosing.current) return
    sheetClosing.current = true
    const duration = motionDuration(180)
    if (!duration) {
      setMobileOpen(false)
      setMobileClosing(false)
      sheetClosing.current = false
      return
    }
    setMobileClosing(true)
    closeTimer.current = window.setTimeout(() => {
      setMobileOpen(false)
      setMobileClosing(false)
      sheetClosing.current = false
    }, duration)
  }, [])
  useEffect(
    () => () => {
      if (closeTimer.current !== null) window.clearTimeout(closeTimer.current)
    },
    [],
  )
  useEffect(() => {
    if (!mobileOpen) return
    closeButton.current?.focus()
    const trigger = mobileTrigger.current
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    function onSheetKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') closeMobile()
      if (event.key !== 'Tab') return
      const controls = Array.from(
        mobileSheet.current?.querySelectorAll<HTMLElement>('button, select, input, summary, a[href]') ?? [],
      ).filter((control) => !control.hasAttribute('disabled') && control.getClientRects().length > 0)
      if (!controls.length) return
      const first = controls[0]
      const last = controls[controls.length - 1]
      if (
        event.shiftKey &&
        (document.activeElement === first || !mobileSheet.current?.contains(document.activeElement))
      ) {
        event.preventDefault()
        last.focus()
      } else if (
        !event.shiftKey &&
        (document.activeElement === last || !mobileSheet.current?.contains(document.activeElement))
      ) {
        event.preventDefault()
        first.focus()
      }
    }
    window.addEventListener('keydown', onSheetKeyDown)
    return () => {
      window.removeEventListener('keydown', onSheetKeyDown)
      document.body.style.overflow = previousOverflow
      trigger?.focus()
    }
  }, [mobileOpen, closeMobile])
  async function update(state: IntakeState) {
    setBusy(true)
    setError('')
    try {
      const [targetKind, targetId] = target ? target.split(':', 2) : [null, null]
      await request(`/api/intake/${item.source_kind}/${encodeURIComponent(item.source_id)}`, {
        method: 'PATCH',
        body: JSON.stringify({
          expected_revision: item.revision,
          state,
          course_id: courseId ? Number(courseId) : null,
          target_kind: targetKind,
          target_id: targetId,
          snoozed_until: state === 'snoozed' ? new Date(Date.now() + Number(later) * 3_600_000).toISOString() : null,
          duplicate_of: state === 'duplicate' ? duplicateOf : null,
        }),
      })
      if (mobileOpen) closeMobile()
      const leaves =
        filter === 'open'
          ? state !== 'new' && state !== 'review'
          : filter === 'snoozed'
            ? state !== 'snoozed'
            : !['accepted', 'rejected', 'duplicate'].includes(state)
      if (leaves) {
        setSuccessMessage(
          state === 'accepted'
            ? t('classifiedMessage')
            : state === 'snoozed'
              ? t('snoozedMessage')
              : t('removedMessage'),
        )
        await waitForMotion(360)
        row.current?.style.setProperty('--inbox-row-height', `${row.current.offsetHeight}px`)
        setRemoving(true)
        await waitForMotion(200)
      }
      reload()
    } catch {
      setError(t('updateFailed'))
    } finally {
      setBusy(false)
    }
  }
  const done = ['accepted', 'rejected', 'duplicate'].includes(item.state)
  const stateLabel: Record<IntakeState, string> = {
    new: t('stateNew'),
    review: t('stateReview'),
    accepted: t('stateAccepted'),
    rejected: t('stateRejected'),
    snoozed: t('stateSnoozed'),
    duplicate: t('stateDuplicate'),
  }
  return (
    <article
      ref={row}
      className={`inbox-row ${removing ? 'is-removing' : ''}`}
      id={`${item.source_kind}-${item.source_id}`}
    >
      <div className="inbox-row-symbol">
        <Link2 size={17} />
      </div>
      <div className="inbox-row-main">
        <div className="inbox-row-meta">
          <span>{item.detail}</span>
          <span>·</span>
          <time>{localDate(item.created_at)}</time>
          <span className="intake-state">{stateLabel[item.state]}</span>
          {item.critical && <span className="intake-critical">{t('criticalLabel')}</span>}
        </div>
        <strong className="inbox-row-desktop-title">{item.title}</strong>
        <button
          type="button"
          ref={mobileTrigger}
          className="inbox-row-mobile-open"
          onClick={() => {
            setMobileClosing(false)
            sheetClosing.current = false
            setMobileOpen(true)
          }}
          aria-label={t('classifyAria', { title: item.title })}
        >
          {item.title}
          <span>{t('classifyArrow')}</span>
        </button>
        {item.url.startsWith('http') ? (
          <a className="subtle-link" href={item.url} target="_blank" rel="noopener noreferrer">
            {t('openOriginal')} <ArrowRight size={13} />
          </a>
        ) : (
          <Link className="subtle-link" to={item.url}>
            {item.source_kind === 'file' ? t('openFileImport') : t('openSource')} <ArrowRight size={13} />
          </Link>
        )}
        {mobileOpen && (
          <button
            type="button"
            className={`inbox-row-backdrop ${mobileClosing ? 'is-closing' : ''}`}
            aria-label={t('closeClassifyAria')}
            onClick={closeMobile}
          />
        )}
        <div
          ref={mobileSheet}
          className={`inbox-row-editor ${mobileOpen ? 'is-open' : ''} ${mobileClosing ? 'is-closing' : ''}`}
          role={mobileOpen ? 'dialog' : undefined}
          aria-modal={mobileOpen || undefined}
          aria-label={mobileOpen ? t('classifyAria', { title: item.title }) : undefined}
        >
          <div className="inbox-row-editor-head">
            <strong>{item.title}</strong>
            <button type="button" ref={closeButton} onClick={closeMobile} aria-label={t('closeButtonAria')}>
              ×
            </button>
          </div>
          <div className="inbox-row-actions">
            {done && item.course_id && (
              <span className="muted-text">{courses.find((course) => course.id === item.course_id)?.name}</span>
            )}
            {!done && (
              <>
                <label>
                  {t('courseLabel')}{' '}
                  <select
                    className="native-select"
                    value={courseId}
                    onChange={(event) => {
                      setCourseId(event.target.value)
                      setTarget('')
                    }}
                    disabled={!canWrite || busy}
                  >
                    <option value="">{t('notYetAssigned')}</option>
                    {courses.map((course) => (
                      <option key={course.id} value={course.id}>
                        {course.name}
                      </option>
                    ))}
                  </select>
                </label>
                {courseId && (
                  <label>
                    {t('assignToLabel')}{' '}
                    <select
                      className="native-select"
                      value={target}
                      onChange={(event) => setTarget(event.target.value)}
                      disabled={!canWrite || busy}
                    >
                      <option value="">{t('courseOnly')}</option>
                      {targets?.map((entry) => (
                        <option key={`${entry.kind}:${entry.id}`} value={`${entry.kind}:${entry.id}`}>
                          {entry.kind === 'topic'
                            ? t('targetTopic')
                            : entry.kind === 'assignment'
                              ? t('targetAssignment')
                              : entry.kind === 'material'
                                ? t('targetMaterial')
                                : t('targetProject')}
                          : {entry.label}
                        </option>
                      ))}
                    </select>
                  </label>
                )}
              </>
            )}
            {!done && (
              <Button size="sm" disabled={!canWrite || busy || !courseId} onClick={() => void update('accepted')}>
                {t('assignButton')}
              </Button>
            )}
            {!done && (
              <Button size="sm" variant="outline" disabled={!canWrite || busy} onClick={() => void update('snoozed')}>
                {t('laterButton')}
              </Button>
            )}
            {!done && (
              <Button size="sm" variant="ghost" disabled={!canWrite || busy} onClick={() => void update('rejected')}>
                {t('ignoreButton')}
              </Button>
            )}
            {!done && (
              <details className="inbox-row-more">
                <summary>{t('moreSummary')}</summary>
                <div>
                  {item.state === 'new' && (
                    <Button
                      size="sm"
                      variant="ghost"
                      disabled={!canWrite || busy}
                      onClick={() => void update('review')}
                    >
                      {t('markForReviewButton')}
                    </Button>
                  )}
                  <label>
                    {t('remindLaterLabel')}
                    <select className="native-select" value={later} onChange={(event) => setLater(event.target.value)}>
                      <option value="1">{t('in1Hour')}</option>
                      <option value="4">{t('in4Hours')}</option>
                      {item.critical ? (
                        <option value="12">{t('in12Hours')}</option>
                      ) : (
                        <>
                          <option value="24">{t('tomorrow')}</option>
                          <option value="168">{t('inOneWeek')}</option>
                        </>
                      )}
                    </select>
                  </label>
                  <Button
                    size="sm"
                    variant="ghost"
                    disabled={!canWrite || busy}
                    onClick={() => setShowDuplicate(!showDuplicate)}
                  >
                    {t('markDuplicateButton')}
                  </Button>
                </div>
              </details>
            )}
            {done && (
              <Button size="sm" variant="ghost" disabled={!canWrite || busy} onClick={() => void update('new')}>
                {t('backToInboxButton')}
              </Button>
            )}
          </div>
          {showDuplicate && (
            <div className="inbox-row-actions">
              <label>
                {t('sameEntryLabel')}{' '}
                <select
                  className="native-select"
                  value={duplicateOf}
                  onChange={(event) => setDuplicateOf(event.target.value)}
                >
                  <option value="">{t('selectPlaceholder')}</option>
                  {items
                    .filter((candidate) => candidate !== item)
                    .slice(0, 100)
                    .map((candidate) => (
                      <option
                        key={`${candidate.source_kind}:${candidate.source_id}`}
                        value={`${candidate.source_kind}:${candidate.source_id}`}
                      >
                        {candidate.title}
                      </option>
                    ))}
                </select>
              </label>
              <Button size="sm" disabled={!canWrite || busy || !duplicateOf} onClick={() => void update('duplicate')}>
                {t('confirmDuplicateButton')}
              </Button>
            </div>
          )}
          {error && (
            <p role="alert" className="text-destructive">
              {error}
            </p>
          )}
        </div>
        {successMessage && <ActionFeedback tone="success" message={successMessage} />}
      </div>
    </article>
  )
}

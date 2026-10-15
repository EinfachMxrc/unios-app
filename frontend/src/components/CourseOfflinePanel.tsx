// SPDX-License-Identifier: AGPL-3.0-or-later

import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { Download, HardDrive } from 'lucide-react'
import { localDate } from '@/api'
import { useT } from '@/i18n/useT'
import { useHostOnline } from '@/hostAvailability'
import { Button } from '@/components/ui/button'
import type { CourseDetail, NotesResponse } from '@/types'
import {
  courseOfflineScope,
  initialOfflineCatalog,
  inspectCourseOffline,
  prepareCourseOffline,
  type CourseOfflineStatus,
} from '@/lib/courseOffline'
import { subscribeManualChanges } from '@/lib/manualDraftCoordination'
import './CourseOfflinePanel.css'

export function CourseOfflinePanel({ detail, notes }: { detail: CourseDetail; notes: NotesResponse | null }) {
  const { t } = useT('courseOffline')
  const online = useHostOnline()
  const [status, setStatus] = useState<CourseOfflineStatus | null>(null)
  const [unavailable, setUnavailable] = useState(false)
  const [busy, setBusy] = useState(false)
  const [failed, setFailed] = useState(false)
  const [progress, setProgress] = useState({ done: 0, total: 0 })
  const controller = useRef<AbortController | null>(null)
  useEffect(() => {
    let active = true
    const update = () => {
      setStatus(null)
      void courseOfflineScope()
        .then((scope) => inspectCourseOffline(scope, initialOfflineCatalog(detail, notes)))
        .then((value) => {
          if (active) {
            setStatus(value)
            setUnavailable(false)
          }
        })
        .catch(() => {
          if (active) setUnavailable(true)
        })
    }
    update()
    const unsubscribe = subscribeManualChanges(update)
    return () => {
      active = false
      unsubscribe()
    }
  }, [detail, notes])
  useEffect(
    () => () => {
      controller.current?.abort()
    },
    [],
  )

  async function prepare() {
    if (busy || !online) return
    const operation = new AbortController()
    controller.current = operation
    setBusy(true)
    setFailed(false)
    try {
      const scope = await courseOfflineScope()
      const result = await prepareCourseOffline(detail.course.id, scope, operation.signal, (done, total) =>
        setProgress({ done, total }),
      )
      if (!operation.signal.aborted) setStatus(result)
    } catch {
      if (!operation.signal.aborted) setFailed(true)
    } finally {
      if (!operation.signal.aborted) setBusy(false)
      controller.current = null
    }
  }

  return (
    <details className="course-offline">
      <summary>
        <HardDrive size={16} aria-hidden="true" />
        <span>{t('title')}</span>
        <span className="course-offline-summary">
          {unavailable
            ? t('unavailableShort')
            : status
              ? t('pdfCount', { saved: status.filesSaved, total: status.filesTotal })
              : t('checking')}
        </span>
      </summary>
      <div className="course-offline-content">
        <p>{t('description')}</p>
        {status && (
          <dl>
            <div>
              <dt>{t('pdfs')}</dt>
              <dd>{t('count', { saved: status.filesSaved, total: status.filesTotal })}</dd>
            </div>
            <div>
              <dt>{t('noteTexts')}</dt>
              <dd>{t('count', { saved: status.notesSaved, total: status.notesTotal })}</dd>
            </div>
          </dl>
        )}
        {status && (!status.complete || status.unsupported > 0) && (
          <p className="muted-text">{t('partial', { count: status.unsupported })}</p>
        )}
        {status?.savedAt && <p className="muted-text">{t('savedAt', { date: localDate(status.savedAt) })}</p>}
        <p className="muted-text">
          {t('limits')} <Link to="/study">{t('openStudy')}</Link>
        </p>
        {unavailable ? (
          <p role="status">{t('unavailable')}</p>
        ) : (
          <>
            <Button variant="outline" size="sm" disabled={busy || !online || !status} onClick={() => void prepare()}>
              <Download size={15} aria-hidden="true" /> {busy ? t('preparing') : t('prepare')}
            </Button>
            {!online && <p className="muted-text">{t('connectionNeeded')}</p>}
          </>
        )}
        {busy && <p role="status">{t('progress', progress)}</p>}
        {failed && <p role="alert">{t('failed')}</p>}
      </div>
    </details>
  )
}

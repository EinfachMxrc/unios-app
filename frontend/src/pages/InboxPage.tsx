// SPDX-License-Identifier: AGPL-3.0-or-later

import { request, useApi } from '@/api'
import { LocalActions } from '@/components/LocalActions'
import { Shell } from '@/components/Shell'
import { Failure, Loading } from '@/components/State'
import { Button } from '@/components/ui/button'
import { useWritableHost } from '@/hooks/host'
import { useT } from '@/i18n/useT'
import type { CoursesResponse } from '@/types'
import { ArrowRight, FileUp, Link2, Mail, Mic } from 'lucide-react'
import { useEffect, useRef, useState, type FormEvent } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import './InboxPage.css'
import { IntakeRow } from './inbox/IntakeRow'
import type { IntakeItem } from './inbox/types'
import { extractApiErrorMessage } from '@/hooks/useApiMutation'
function sharedUrl(params: URLSearchParams) {
  const direct = params.get('url')
  if (direct) return direct
  const match = params.get('text')?.match(/https?:\/\/\S+/)
  return match?.[0] ?? ''
}
export function InboxPage() {
  const { t } = useT('inbox')
  const [params, setParams] = useSearchParams()
  const canWrite = useWritableHost()
  const { data, error, loading, updatedAt, reload } = useApi<IntakeItem[]>('/api/intake')
  const { data: courseData } = useApi<CoursesResponse>('/api/courses?all_semesters=true')
  const initialUrl = sharedUrl(params)
  const [mode, setMode] = useState<'web' | 'text'>(initialUrl ? 'web' : 'text')
  const [title, setTitle] = useState(params.get('title') ?? '')
  const [url, setUrl] = useState(initialUrl)
  const [body, setBody] = useState((params.get('text') ?? '').replace(initialUrl, '').trim())
  const [courseId, setCourseId] = useState('')
  const [filter, setFilter] = useState<'open' | 'snoozed' | 'done'>('open')
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const [hasFile, setHasFile] = useState(false)
  const [captureOpen, setCaptureOpen] = useState(Boolean(initialUrl))
  const fileInput = useRef<HTMLInputElement>(null)
  const captureGeneration = useRef(0)
  const operationPending = useRef(false)
  const mounted = useRef(true)
  useEffect(() => {
    mounted.current = true
    return () => {
      mounted.current = false
    }
  }, [])
  function editCapture(update: () => void) {
    captureGeneration.current += 1
    update()
  }
  async function capture(event: FormEvent) {
    event.preventDefault()
    if (operationPending.current || !canWrite) return
    operationPending.current = true
    const sentGeneration = captureGeneration.current
    setBusy(true)
    setMessage('')
    try {
      await request('/api/inbox/clips', {
        method: 'POST',
        body: JSON.stringify({
          kind: mode,
          title: title.trim() || (mode === 'web' ? url.slice(0, 300) : body.slice(0, 80)),
          url: mode === 'web' ? url.trim() : null,
          body: body.trim(),
          course_id: courseId ? Number(courseId) : null,
        }),
      })
      if (!mounted.current) return
      const unchanged = sentGeneration === captureGeneration.current
      if (unchanged) {
        setTitle('')
        setUrl('')
        setBody('')
        setCourseId('')
        setParams({}, { replace: true })
      }
      setMessage(t(unchanged ? 'savedToInboxMessage' : 'savedEarlierDraftMessage'))
      reload()
    } catch (cause) {
      if (mounted.current) setMessage(t('saveFailedMessage', { error: extractApiErrorMessage(cause) }))
    } finally {
      operationPending.current = false
      if (mounted.current) setBusy(false)
    }
  }
  async function upload() {
    const file = fileInput.current?.files?.[0]
    if (!file || operationPending.current || !canWrite) return
    operationPending.current = true
    setBusy(true)
    setMessage('')
    try {
      const form = new FormData()
      form.append('file', file)
      await request('/api/inbox/upload', { method: 'POST', body: form })
      if (!mounted.current) return
      if (fileInput.current) fileInput.current.value = ''
      setHasFile(false)
      setMessage(t('fileUploadedMessage'))
      reload()
    } catch (cause) {
      if (mounted.current) setMessage(t('fileUploadFailedMessage', { error: extractApiErrorMessage(cause) }))
    } finally {
      operationPending.current = false
      if (mounted.current) setBusy(false)
    }
  }
  async function copyBookmarklet() {
    const destination = `${window.location.origin}/inbox`
    const code = `javascript:(()=>{let u=new URL(${JSON.stringify(destination)});u.searchParams.set('url',location.href);u.searchParams.set('title',document.title);u.searchParams.set('text',getSelection()?.toString().slice(0,20000)||'');open(u.href,'_blank','noopener')})()`
    try {
      await navigator.clipboard.writeText(code)
      setMessage(t('bookmarkletCopiedMessage'))
    } catch {
      setMessage(t('bookmarkletCopyFailedMessage'))
    }
  }
  const visibleItems = (data ?? []).filter((item) =>
    filter === 'open'
      ? item.state === 'new' || item.state === 'review'
      : filter === 'snoozed'
        ? item.state === 'snoozed'
        : ['accepted', 'rejected', 'duplicate'].includes(item.state),
  )
  return (
    <Shell title={t('pageTitle')} cachedAt={updatedAt}>
      <LocalActions kind="intake" compact />
      <div className="inbox-intro">
        <p>{t('introKicker')}</p>
        <h2>{t('introTitle')}</h2>
        <span>{t('introText')}</span>
      </div>
      <div className="inbox-layout">
        <div className="inbox-primary">
          <section className="inbox-capture">
            <div className="inbox-section-head">
              <h3>{t('addSomethingTitle')}</h3>
              <button
                type="button"
                className="inbox-capture-toggle"
                aria-expanded={captureOpen}
                onClick={() => setCaptureOpen(!captureOpen)}
              >
                {captureOpen ? t('closeButton') : t('addButton')}
              </button>
            </div>
            {captureOpen && (
              <>
                <div className="inbox-section-head">
                  <span className="muted-text">{t('saveWebOrTextLabel')}</span>
                  <div className="inbox-mode">
                    <button
                      type="button"
                      className={mode === 'web' ? 'active' : ''}
                      onClick={() => {
                        if (mode !== 'web') editCapture(() => setMode('web'))
                      }}
                    >
                      {t('modeWebsite')}
                    </button>
                    <button
                      type="button"
                      className={mode === 'text' ? 'active' : ''}
                      onClick={() => {
                        if (mode !== 'text') editCapture(() => setMode('text'))
                      }}
                    >
                      {t('modeText')}
                    </button>
                    <Link to="/voice">
                      <Mic size={14} /> {t('voiceLink')}
                    </Link>
                  </div>
                </div>
                <form onSubmit={(event) => void capture(event)} className="inbox-form">
                  {mode === 'web' && (
                    <label>
                      {t('urlLabel')}
                      <input
                        type="url"
                        required
                        value={url}
                        onChange={(event) => editCapture(() => setUrl(event.target.value))}
                        placeholder={t('urlPlaceholder')}
                      />
                    </label>
                  )}
                  <label>
                    {t('titleLabel')}
                    <input
                      value={title}
                      onChange={(event) => editCapture(() => setTitle(event.target.value))}
                      maxLength={300}
                      placeholder={mode === 'web' ? t('titlePlaceholderWeb') : t('titlePlaceholderText')}
                    />
                  </label>
                  <label>
                    {mode === 'web' ? t('bodyLabelWeb') : t('bodyLabelText')}
                    <textarea
                      value={body}
                      onChange={(event) => editCapture(() => setBody(event.target.value))}
                      maxLength={50_000}
                      rows={4}
                      required={mode === 'text'}
                      placeholder={mode === 'web' ? t('bodyPlaceholderWeb') : t('bodyPlaceholderText')}
                    />
                  </label>
                  <div className="inbox-form-end">
                    <label>
                      {t('courseLabel')}{' '}
                      <select
                        className="native-select"
                        value={courseId}
                        onChange={(event) => editCapture(() => setCourseId(event.target.value))}
                      >
                        <option value="">{t('notYetAssigned')}</option>
                        {courseData?.courses.map((course) => (
                          <option key={course.id} value={course.id}>
                            {course.name}
                          </option>
                        ))}
                      </select>
                    </label>
                    <Button type="submit" disabled={!canWrite || busy || (mode === 'web' ? !url : !body.trim())}>
                      {t('saveToInboxButton')}
                    </Button>
                  </div>
                </form>
              </>
            )}
          </section>
          <section className="inbox-list">
            <div className="inbox-section-head">
              <h3>{t('receivedTitle')}</h3>
              <div className="intake-filters">
                <button type="button" className={filter === 'open' ? 'active' : ''} onClick={() => setFilter('open')}>
                  {t('filterOpen')}
                </button>
                <button
                  type="button"
                  className={filter === 'snoozed' ? 'active' : ''}
                  onClick={() => setFilter('snoozed')}
                >
                  {t('laterButton')}
                </button>
                <button type="button" className={filter === 'done' ? 'active' : ''} onClick={() => setFilter('done')}>
                  {t('filterDone')}
                </button>
              </div>
            </div>
            {loading && !data ? (
              <Loading />
            ) : error ? (
              <Failure message={error} />
            ) : (
              <>
                {visibleItems.map((item) => (
                  <IntakeRow
                    key={`${item.source_kind}:${item.source_id}`}
                    item={item}
                    items={data ?? []}
                    courses={courseData?.courses ?? []}
                    filter={filter}
                    reload={reload}
                  />
                ))}
                {!visibleItems.length && <p className="inbox-empty">{t('allSortedText')}</p>}
              </>
            )}
          </section>
        </div>
        <aside className="inbox-tools">
          <section>
            <h3>{t('fromBrowserTitle')}</h3>
            <p>{t('fromBrowserText')}</p>
            <Button variant="outline" size="sm" onClick={() => void copyBookmarklet()}>
              <Link2 size={15} /> {t('copyBookmarkletButton')}
            </Button>
            <small>{t('bookmarkletHint')}</small>
          </section>
          <section>
            <h3>{t('fileOrPhotoTitle')}</h3>
            <p>{t('fileUploadText')}</p>
            <input
              aria-label={t('chooseFileAria')}
              type="file"
              ref={fileInput}
              disabled={!canWrite || busy}
              onChange={(event) => setHasFile(Boolean(event.target.files?.length))}
            />
            <Button variant="outline" size="sm" disabled={!canWrite || busy || !hasFile} onClick={() => void upload()}>
              <FileUp size={15} /> {t('addFileButton')}
            </Button>
          </section>
          <section>
            <h3>{t('moreSourcesTitle')}</h3>
            <Link to="/mail">
              <Mail size={15} /> {t('openMailLink')}
            </Link>
            <Link to="/projects">
              {t('openProjectsLink')} <ArrowRight size={14} />
            </Link>
          </section>
          {message && (
            <p role="status" className="inbox-message">
              {message}
            </p>
          )}
        </aside>
      </div>
    </Shell>
  )
}

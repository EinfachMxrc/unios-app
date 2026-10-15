// SPDX-License-Identifier: AGPL-3.0-or-later
import { useState } from 'react'
import { Link } from 'react-router-dom'
import { FileUp } from 'lucide-react'
import { request, useApi } from '@/api'
import { useT } from '@/i18n/useT'
import { useWritableHost } from '@/hooks/host'
import { parseNoteCsv, MAX_CSV_NOTES, type ImportedCsvNote } from '@/lib/importCsv'
import { Button } from './ui/button'
import './ImportWizard.css'

type ImportKind = 'markdown' | 'csv' | 'pdf' | 'anki' | 'calendar'
export function validImportFiles(kind: ImportKind, files: File[]) {
  return (
    files.length > 0 &&
    files.length <= 50 &&
    (kind !== 'csv' || files.reduce((total, file) => total + file.size, 0) <= 2 * 1024 * 1024) &&
    files.every(
      (file) =>
        file.size > 0 &&
        file.size <= (kind === 'markdown' ? 100_000 : 50 * 1024 * 1024) &&
        (kind !== 'markdown' || /\.(md|markdown)$/i.test(file.name)) &&
        (kind !== 'csv' || /\.csv$/i.test(file.name)),
    )
  )
}

export function ImportWizard() {
  const { t } = useT('releaseOnboarding')
  const canWrite = useWritableHost()
  const { data } = useApi<{ courses: { id: number; name: string }[] }>('/api/courses')
  const [kind, setKind] = useState<ImportKind>('markdown')
  const [files, setFiles] = useState<File[]>([])
  const [courseId, setCourseId] = useState('')
  const [reviewing, setReviewing] = useState(false)
  const [busy, setBusy] = useState(false)
  const [progress, setProgress] = useState(0)
  const [message, setMessage] = useState('')
  const [failed, setFailed] = useState(false)
  const [csvNotes, setCsvNotes] = useState<ImportedCsvNote[]>([])
  const notesKind = kind === 'markdown' || kind === 'csv'
  async function reviewFiles() {
    if (!ready) return
    if (kind !== 'csv') {
      setReviewing(true)
      return
    }
    setBusy(true)
    setMessage('')
    setFailed(false)
    try {
      const notes: ImportedCsvNote[] = []
      for (const file of files) {
        notes.push(...parseNoteCsv(await file.text()))
        if (notes.length > MAX_CSV_NOTES) throw new Error('CSV rows')
      }
      setCsvNotes(notes)
      setReviewing(true)
    } catch {
      setFailed(true)
      setMessage(t('csvInvalid'))
    } finally {
      setBusy(false)
    }
  }
  async function importFiles() {
    if (!validImportFiles(kind, files) || (notesKind && !courseId) || (kind === 'csv' && !csvNotes.length)) return
    setBusy(true)
    setMessage('')
    setFailed(false)
    setProgress(0)
    let completed = 0
    try {
      if (kind === 'csv') {
        for (const note of csvNotes) {
          await request('/api/notes', {
            method: 'POST',
            body: JSON.stringify({ course_id: Number(courseId), resource_id: null, ...note }),
          })
          completed += 1
          setProgress(completed)
        }
      } else
        for (const file of files) {
          if (kind === 'markdown') {
            const body = await file.text()
            if (!body.trim() || body.includes('\u0000')) throw new Error('invalid markdown')
            await request('/api/notes', {
              method: 'POST',
              body: JSON.stringify({
                course_id: Number(courseId),
                resource_id: null,
                title: file.name.replace(/\.(md|markdown)$/i, '').slice(0, 200),
                body,
              }),
            })
          } else {
            const body = new FormData()
            body.append('file', file)
            await request('/api/inbox/upload', { method: 'POST', body })
          }
          completed += 1
          setProgress(completed)
        }
      setMessage(t(kind === 'csv' ? 'notesCompleted' : 'completed', { count: completed }))
      setFiles([])
      setCsvNotes([])
      setReviewing(false)
    } catch {
      setFailed(true)
      setMessage(t(kind === 'csv' ? 'notesPartial' : 'partial', { count: completed }))
      if (kind === 'csv') setCsvNotes(csvNotes.slice(completed))
      else {
        setFiles(files.slice(completed))
        setReviewing(false)
      }
    } finally {
      setBusy(false)
    }
  }
  const ready = validImportFiles(kind, files) && (!notesKind || Boolean(courseId))
  return (
    <section className="import-wizard" aria-labelledby="import-wizard-title">
      <header>
        <FileUp size={24} aria-hidden="true" />
        <div>
          <h2 id="import-wizard-title">{t('importTitle')}</h2>
          <p>{t('importIntro')}</p>
        </div>
      </header>
      <fieldset disabled={busy || !canWrite}>
        <div className="import-wizard-kinds">
          {(['markdown', 'csv', 'pdf', 'anki', 'calendar'] as const).map((item) => (
            <button
              type="button"
              key={item}
              aria-pressed={item === kind}
              onClick={() => {
                setKind(item)
                setFiles([])
                setCsvNotes([])
                setReviewing(false)
                setMessage('')
              }}
            >
              {t(item)}
            </button>
          ))}
        </div>
        <p>{t(`${kind}Hint`)}</p>
        {kind === 'anki' ? (
          <Link className="subtle-link" to="/study">
            {t('openCards')}
          </Link>
        ) : kind === 'calendar' ? (
          <Link className="subtle-link" to="/deadlines#timetable">
            {t('openCalendar')}
          </Link>
        ) : (
          <>
            {!reviewing && (
              <>
                <label htmlFor="import-wizard-files">{t('chooseFiles')}</label>
                <input
                  id="import-wizard-files"
                  type="file"
                  multiple
                  accept={kind === 'markdown' ? '.md,.markdown' : kind === 'csv' ? '.csv' : undefined}
                  onChange={(event) => {
                    const selected = Array.from(event.target.files ?? [])
                    setFiles(selected)
                    setCsvNotes([])
                    setFailed(!validImportFiles(kind, selected))
                    setMessage(validImportFiles(kind, selected) ? '' : t('invalidFiles'))
                  }}
                />
                {notesKind && (
                  <>
                    {kind === 'markdown' && <p>{t('noteLimit')}</p>}
                    <label htmlFor="import-wizard-course">{t('course')}</label>
                    <select
                      id="import-wizard-course"
                      value={courseId}
                      onChange={(event) => setCourseId(event.target.value)}
                    >
                      <option value="">{t('selectCourse')}</option>
                      {data?.courses.map((course) => (
                        <option key={course.id} value={course.id}>
                          {course.name}
                        </option>
                      ))}
                    </select>
                  </>
                )}
                <Button disabled={!ready} onClick={() => void reviewFiles()}>
                  {t('review')}
                </Button>
              </>
            )}
            {reviewing && (
              <>
                <p>{t('selected', { count: files.length })}</p>
                <ul>
                  {files.map((file, index) => (
                    <li key={`${index}-${file.name}`}>{file.name}</li>
                  ))}
                </ul>
                {kind === 'csv' && (
                  <>
                    <p>{t('csvPreview', { count: csvNotes.length })}</p>
                    <ol className="import-wizard-preview">
                      {csvNotes.slice(0, 10).map((note, index) => (
                        <li key={index}>
                          <strong>{note.title}</strong>
                          <p>
                            {note.body.slice(0, 200)}
                            {note.body.length > 200 ? ' …' : ''}
                          </p>
                        </li>
                      ))}
                    </ol>
                  </>
                )}
                <div className="import-wizard-actions">
                  <Button
                    variant="outline"
                    onClick={() => {
                      setReviewing(false)
                      if (kind === 'csv' && failed) {
                        setFiles([])
                        setCsvNotes([])
                      }
                    }}
                  >
                    {t('back')}
                  </Button>
                  <Button disabled={!ready} onClick={() => void importFiles()}>
                    {busy ? t('importing') : t('import')}
                  </Button>
                </div>
              </>
            )}
          </>
        )}
      </fieldset>
      {busy && (
        <progress
          aria-label={t('importing')}
          max={kind === 'csv' ? csvNotes.length || 1 : files.length}
          value={progress}
        />
      )}
      {message && <p role={failed ? 'alert' : 'status'}>{message}</p>}
      {message && !failed && (
        <Link className="subtle-link" to={notesKind ? '/notes' : '/inbox'}>
          {notesKind ? t('openNotes') : t('openInbox')}
        </Link>
      )}
      <p className="import-wizard-support">{t('unsupported')}</p>
    </section>
  )
}

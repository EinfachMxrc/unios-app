// SPDX-License-Identifier: AGPL-3.0-or-later

import { lazy, Suspense, useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { ArrowRight, BookOpen, FileText } from 'lucide-react'
import { localDate, useApi } from '@/api'
import { FocusTimerPanel } from '@/components/FocusTimerPanel'
import { ListPagination } from '@/components/ListPagination'
import { PracticePanel } from '@/components/PracticePanel'
import { Shell } from '@/components/Shell'
import { Empty, Failure, Loading } from '@/components/State'
import { Button } from '@/components/ui/button'
import { useT } from '@/i18n/useT'
import {
  focusApiPath,
  focusPath,
  focusQuery,
  type LearningFocusContext,
  type LearningFocusRef,
} from '@/lib/learningFocus'
import { hasMaterialView } from '@/lib/materialView'
import { useWorkspaceState, workspaceValue } from '@/lib/workspaceState'
import { rememberStudySession } from '@/lib/studyResume'
import { beginNewFreeNote } from '@/lib/sourceNoteSave'
import type { CourseDetail, NoteDetail, NotesResponse } from '@/types'
import './FocusWorkspacePage.css'

const Reader = lazy(() => import('./MaterialPage').then((module) => ({ default: module.MaterialReader })))
const Note = lazy(() => import('./notes/NoteDocument').then((module) => ({ default: module.NoteDocument })))
const NewNote = lazy(() => import('./notes/NewNote').then((module) => ({ default: module.NewNote })))
type Mode = 'source' | 'notes' | 'practice'
type View = { mode: Mode; version: number | null; note: string | null }
const emptyView: View = { mode: 'source', version: null, note: null }
const validMode = (value: unknown): value is Mode => value === 'source' || value === 'notes' || value === 'practice'
const positiveId = (value: unknown): value is number =>
  typeof value === 'number' && Number.isSafeInteger(value) && value > 0
const noteId = (value: unknown): value is string =>
  typeof value === 'string' && /^[\da-f]{8}(?:-[\da-f]{4}){3}-[\da-f]{12}$/i.test(value)

export function FocusWorkspacePage() {
  const { kind, id } = useParams()
  const { t } = useT('learning')
  const number = Number(id)
  if ((kind !== 'block' && kind !== 'cycle' && kind !== 'course') || !positiveId(number))
    return (
      <Shell title={t('focusTitle')}>
        <Failure message={t('focusContextUnavailable')} />
        <Link className="subtle-link" to="/learning">
          {t('focusBackToLearning')}
        </Link>
      </Shell>
    )
  return <FocusWorkspace key={`${kind}:${number}`} reference={{ kind, id: number }} />
}

function FocusWorkspace({ reference }: { reference: LearningFocusRef }) {
  const { t } = useT('learning')
  const [params, setParams] = useSearchParams()
  const navigate = useNavigate()
  const key = `learning-focus:${reference.kind}:${reference.id}`
  const context = useApi<LearningFocusContext>(focusApiPath(reference))
  const modeNav = useRef<HTMLElement>(null)
  const workspace = useRef<HTMLDivElement>(null)
  useLayoutEffect(() => {
    const nav = modeNav.current
    const frame = workspace.current
    if (!nav || !frame) return
    const measure = () => {
      const height = nav.getBoundingClientRect().height
      if (height > 0) frame.style.setProperty('--focus-mode-height', `${height}px`)
    }
    measure()
    if (typeof ResizeObserver === 'undefined') return
    const observer = new ResizeObserver(measure)
    observer.observe(nav)
    return () => observer.disconnect()
  }, [context.data?.id, context.data?.kind])
  const [savedView, setSavedView] = useWorkspaceState<View>(`${key}:view`, emptyView, {
    valid: (value): value is View =>
      !!value &&
      typeof value === 'object' &&
      validMode((value as View).mode) &&
      ((value as View).version === null || positiveId((value as View).version)) &&
      ((value as View).note === null || noteId((value as View).note)),
  })
  const requestedMode = params.get('mode')
  const mode = validMode(requestedMode) ? requestedMode : savedView.mode
  const version = params.has('version') ? Number(params.get('version')) : savedView.version
  const note = params.has('note') ? params.get('note') : savedView.note
  const selectedVersion = positiveId(version) ? version : null
  const selectedNote = noteId(note) ? note : null
  const requestedPage = Number(params.get('page'))
  const selectedPage = selectedVersion
    ? positiveId(requestedPage)
      ? requestedPage
      : workspaceValue(`pdf:${selectedVersion}:page`, 1, { valid: positiveId })
    : undefined
  const [visited, setVisited] = useState({ notes: mode === 'notes', practice: mode === 'practice' })
  const [creatingNote, setCreatingNote] = useState(false)
  useEffect(() => {
    if (mode === 'notes' || mode === 'practice')
      setVisited((current) => (current[mode] ? current : { ...current, [mode]: true }))
  }, [mode])
  const [sourceOffset, setSourceOffset] = useWorkspaceState(`${key}:sourceOffset`, 0)
  const [noteOffset, setNoteOffset] = useWorkspaceState(`${key}:noteOffset`, 0)
  const courseId = context.data?.course_id
  const sources = useApi<CourseDetail>(
    `/api/courses/${courseId ?? 0}${sourceOffset ? `?offset=${sourceOffset}` : ''}`,
    { enabled: !!courseId && mode === 'source' && selectedVersion === null },
  )
  const notes = useApi<NotesResponse>(
    `/api/notes?course_id=${courseId ?? 0}${noteOffset ? `&offset=${noteOffset}` : ''}`,
    { enabled: !!courseId && mode === 'notes' },
  )

  useEffect(() => {
    setSavedView((current) =>
      current.mode === mode && current.version === selectedVersion && current.note === selectedNote
        ? current
        : { mode, version: selectedVersion, note: selectedNote },
    )
  }, [mode, selectedVersion, selectedNote, setSavedView])

  function choose(next: Partial<View>) {
    const view = { mode, version: selectedVersion, note: selectedNote, ...next }
    setSavedView(view)
    const page =
      view.version === selectedVersion
        ? selectedPage
        : view.version
          ? workspaceValue(`pdf:${view.version}:page`, 1, { valid: positiveId })
          : undefined
    navigate(
      focusPath(reference, { mode: view.mode, version: view.version ?? undefined, note: view.note ?? undefined, page }),
    )
  }

  const reportPage = useCallback(
    (page: number) => {
      if (!positiveId(page) || !selectedVersion) return
      const current = new URLSearchParams(window.location.search)
      if (Number(current.get('page')) === page) return
      current.set('page', String(page))
      setParams(current, { replace: true, state: { readerPageSync: true } })
    },
    [selectedVersion, setParams],
  )

  const savedNoteHref = useCallback(
    (id: string) =>
      focusPath(reference, {
        mode: 'notes',
        note: id,
        version: selectedVersion ?? undefined,
        page: selectedPage,
      }),
    [reference, selectedVersion, selectedPage],
  )
  const reportNote = useCallback(
    (note: string | null) => {
      if (note !== null && !noteId(note)) return
      const current = new URLSearchParams(window.location.search)
      if (current.get('note') === note) return
      if (note) current.set('note', note)
      else current.delete('note')
      setParams(current, { replace: true, state: { readerNoteSync: true } })
    },
    [setParams],
  )

  const data = context.data
  const validContext =
    data?.kind === reference.kind &&
    data.id === reference.id &&
    data.status === (reference.kind === 'course' ? 'direct' : 'accepted') &&
    positiveId(data.course_id)
  useEffect(() => {
    if (!validContext || !data) return
    rememberStudySession(
      reference,
      { mode, version: selectedVersion ?? undefined, note: selectedNote ?? undefined, page: selectedPage },
      data.course_name,
      data.course_id,
    )
  }, [data, validContext, reference, mode, selectedVersion, selectedNote, selectedPage])
  const sourceData = sources.data
  const readable =
    sourceData && sourceData.course.id === courseId
      ? sourceData.resources.flatMap((resource) => {
          if (resource.group_category === 'other_group') return []
          const version = sourceData.versions[resource.id]?.find((item) =>
            hasMaterialView(resource.filename ?? resource.name, item.mime_type),
          )
          return version ? [{ resource, version }] : []
        })
      : []
  const courseNotes = notes.data?.notes.filter((item) => item.course_id === courseId) ?? []
  return (
    <Shell title={t('focusTitle')} cachedAt={context.updatedAt}>
      <Link
        className="subtle-link focus-back"
        to={reference.kind === 'course' ? `/courses/${reference.id}` : '/learning'}
      >
        {reference.kind === 'course' ? t('focusCourseLink') : t('focusBackToLearning')}
      </Link>
      {context.loading && !data ? (
        <Loading />
      ) : context.error || !validContext || !data ? (
        <Failure message={context.error ?? t('focusContextUnavailable')} retry={context.reload} />
      ) : (
        <div className="focus-workspace" ref={workspace}>
          <header className="focus-context" aria-label={t('focusContextLabel')}>
            <div>
              {reference.kind !== 'course' && <span className="focus-context-kicker">{data.label}</span>}
              <h2>{data.course_name}</h2>
              <p className="focus-topics">
                {data.topics.map((topic) => topic.name).join(' · ') || t('focusTopicsUnknown')}
              </p>
              {data.exam_title && (
                <p className="focus-exam">
                  {data.exam_title} ·{' '}
                  {data.exam_at ? t('focusExamDate', { date: localDate(data.exam_at) }) : t('focusExamDateUnknown')}
                </p>
              )}
            </div>
            {mode === 'practice' ? (
              <Button onClick={() => choose({ mode: 'source' })}>
                {t('focusReturnToSource')} <ArrowRight size={16} aria-hidden="true" />
              </Button>
            ) : (
              <Button asChild>
                <Link to={`/study?${focusQuery(reference)}`}>
                  {t('focusLearnCards')} <ArrowRight size={16} aria-hidden="true" />
                </Link>
              </Button>
            )}
          </header>
          {data.exam_changed && (
            <p className="focus-context-notice" role="status">
              {t('focusExamChanged')}
            </p>
          )}
          {data.missing_topic_ids.length > 0 && <p className="focus-context-notice">{t('focusTopicsMissing')}</p>}
          <nav className="focus-mode-nav" ref={modeNav} aria-label={t('focusModeLabel')}>
            <Button
              variant={mode === 'source' ? 'secondary' : 'ghost'}
              aria-pressed={mode === 'source'}
              onClick={() => choose({ mode: 'source' })}
            >
              {t('focusSourceMode')}
            </Button>
            <Button
              variant={mode === 'notes' ? 'secondary' : 'ghost'}
              aria-pressed={mode === 'notes'}
              onClick={() => choose({ mode: 'notes' })}
            >
              {t('focusNotesMode')}
            </Button>
            <Button asChild variant="ghost">
              <Link to={`/study?${focusQuery(reference)}`}>{t('focusCardsMode')}</Link>
            </Button>
            <Button
              variant={mode === 'practice' ? 'secondary' : 'ghost'}
              aria-pressed={mode === 'practice'}
              onClick={() => choose({ mode: 'practice' })}
            >
              {t('focusPracticeMode')}
            </Button>
          </nav>
          <p className="focus-scope-note">{t('focusCourseScope')}</p>
          {reference.kind === 'block' &&
            data.status === 'accepted' &&
            data.starts_at &&
            data.duration_minutes !== null && (
              <details className="focus-timer-details">
                <summary>{t('focusTimerContextTitle')}</summary>
                <FocusTimerPanel
                  blockId={reference.id}
                  acceptedBlock={{
                    id: data.id,
                    topic: data.topics.map((topic) => topic.name).join(' · ') || data.label,
                    course_name: data.course_name,
                    duration_minutes: data.duration_minutes,
                    starts_at: data.starts_at,
                    status: data.status,
                  }}
                />
              </details>
            )}
          <div className="focus-workarea">
            {mode === 'source' &&
              (selectedVersion ? (
                <>
                  <div className="focus-selected-heading">
                    <h2>{t('focusReaderSource')}</h2>
                    <Button variant="ghost" size="sm" onClick={() => choose({ version: null })}>
                      {t('focusChangeSource')}
                    </Button>
                  </div>
                  <Suspense fallback={<Loading />}>
                    <Reader
                      key={selectedVersion}
                      versionId={selectedVersion}
                      embedded
                      expectedCourseId={data.course_id}
                      onVersionChange={(version) => choose({ version })}
                      onPageChange={reportPage}
                      savedNoteHref={savedNoteHref}
                      onNoteChange={reportNote}
                      selectedNoteId={selectedNote ?? undefined}
                    />
                  </Suspense>
                </>
              ) : (
                <section aria-labelledby="focus-source-list-title">
                  <h2 id="focus-source-list-title">{t('focusChooseSource')}</h2>
                  {sources.loading && !sources.data ? (
                    <Loading variant="rows" />
                  ) : sources.error ? (
                    <Failure message={sources.error} retry={sources.reload} />
                  ) : readable.length ? (
                    <div className="focus-source-list">
                      {readable.map(({ resource, version }) => (
                        <button
                          className="focus-catalog-row"
                          type="button"
                          key={version.id}
                          onClick={() => choose({ version: version.id })}
                        >
                          <BookOpen size={18} aria-hidden="true" />
                          <span>
                            <strong>{resource.name}</strong>
                            <small>{t('focusSourceVersion', { version: version.version })}</small>
                          </span>
                          <span>{t('focusReadSource')}</span>
                          <ArrowRight size={16} aria-hidden="true" />
                        </button>
                      ))}
                    </div>
                  ) : (
                    <Empty
                      title={t('focusNoSources')}
                      text={t('focusNoSourcesText')}
                      action={<Link to={`/courses/${data.course_id}`}>{t('focusCourseLink')}</Link>}
                    />
                  )}
                  <ListPagination page={sources.data?.page} onPage={setSourceOffset} />
                </section>
              ))}
            {(mode === 'notes' || visited.notes) && (
              <div hidden={mode !== 'notes'}>
                <div className="focus-selected-heading">
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={creatingNote || !notes.data}
                    onClick={() => {
                      beginNewFreeNote(data.course_id)
                      setCreatingNote(true)
                    }}
                  >
                    {t('focusNewNote')}
                  </Button>
                  {creatingNote && (
                    <Button variant="ghost" size="sm" onClick={() => setCreatingNote(false)}>
                      {t('practiceCancel')}
                    </Button>
                  )}
                </div>
                {creatingNote && notes.data ? (
                  <Suspense fallback={<Loading variant="editor" />}>
                    <NewNote
                      data={{
                        ...notes.data,
                        courses: notes.data.courses.filter((course) => course.id === data.course_id),
                      }}
                      courseId={data.course_id}
                      resourceId={null}
                      suggestedTitle=""
                      onCreated={(id) => {
                        setCreatingNote(false)
                        notes.reload()
                        choose({ mode: 'notes', note: id })
                      }}
                    />
                  </Suspense>
                ) : selectedNote ? (
                  <>
                    <div className="focus-selected-heading">
                      <h2>{t('focusCurrentNote')}</h2>
                      <Button variant="ghost" size="sm" onClick={() => choose({ note: null })}>
                        {t('focusChangeNote')}
                      </Button>
                    </div>
                    <FocusNote key={selectedNote} id={selectedNote} courseId={data.course_id} onSaved={notes.reload} />
                  </>
                ) : (
                  <section aria-labelledby="focus-note-list-title">
                    <h2 id="focus-note-list-title">{t('focusChooseNote')}</h2>
                    {notes.loading && !notes.data ? (
                      <Loading variant="rows" />
                    ) : notes.error ? (
                      <Failure message={notes.error} retry={notes.reload} />
                    ) : courseNotes.length ? (
                      <div className="focus-source-list">
                        {courseNotes.map((item) => (
                          <button
                            className="focus-catalog-row"
                            type="button"
                            key={item.id}
                            onClick={() => choose({ note: item.id })}
                          >
                            <FileText size={18} aria-hidden="true" />
                            <span>
                              <strong>{item.title}</strong>
                              <small>{localDate(item.updated_at)}</small>
                            </span>
                            <span>{t('focusReadNote')}</span>
                            <ArrowRight size={16} aria-hidden="true" />
                          </button>
                        ))}
                      </div>
                    ) : (
                      <Empty
                        title={t('focusNoNotes')}
                        text={t('focusNoNotesText')}
                        action={
                          <Button variant="outline" onClick={() => choose({ mode: 'source' })}>
                            {t('focusSourceMode')}
                          </Button>
                        }
                      />
                    )}
                    <ListPagination page={notes.data?.page} onPage={setNoteOffset} />
                  </section>
                )}
              </div>
            )}
            {(mode === 'practice' || visited.practice) && (
              <div hidden={mode !== 'practice'}>
                <PracticePanel courseId={data.course_id} workspaceKey={key} />
              </div>
            )}
          </div>
        </div>
      )}
    </Shell>
  )
}

function FocusNote({ id, courseId, onSaved }: { id: string; courseId: number; onSaved: () => void }) {
  const { t } = useT('learning')
  const detail = useApi<NoteDetail>(`/api/notes/${id}`)
  const [revision, setRevision] = useState<number | null>(null)
  if (detail.loading && !detail.data) return <Loading variant="editor" />
  if (detail.error) return <Failure message={detail.error} retry={detail.reload} />
  if (!detail.data || detail.data.note.course_id !== courseId) return <Failure message={t('focusForeignNote')} />
  return (
    <div className="focus-note-document">
      <Suspense fallback={<Loading variant="editor" />}>
        <Note
          key={id}
          id={id}
          revision={revision}
          onRevision={setRevision}
          onEditing={() => setRevision(null)}
          onSaved={onSaved}
        />
      </Suspense>
    </div>
  )
}

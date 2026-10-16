// SPDX-License-Identifier: AGPL-3.0-or-later

import { AddonWidgetSlot } from '@/addons/AddonWidgetSlot'
import { localDate, useApi } from '@/api'
import { ActionFeedback } from '@/components/ActionFeedback'
import { ListPagination } from '@/components/ListPagination'
import { Shell } from '@/components/Shell'
import { Failure, ListRows, Loading } from '@/components/State'
import { TrashUndo, type Trashed } from '@/components/TrashUndo'
import { UliBuddy } from '@/components/UliBuddy'
import { Button } from '@/components/ui/button'
import { useWritableHost } from '@/hooks/host'
import { extractApiErrorMessage } from '@/hooks/useApiMutation'
import { useDebouncedValue } from '@/hooks/useDebouncedValue'
import { useT } from '@/i18n/useT'
import { useWorkspaceState } from '@/lib/workspaceState'
import { moveToTrash } from '@/lib/trash'
import { beginNewSourceNote, sourceNoteSaveState } from '@/lib/sourceNoteSave'
import type { NotesResponse } from '@/types'
import { FileText, Plus } from 'lucide-react'
import { useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { NewNote } from './notes/NewNote'
import { AssignmentNewNote } from './notes/AssignmentNewNote'
import { NoteDocument } from './notes/NoteDocument'
export function NotesPage() {
  const { t } = useT('notes')
  const { t: trash } = useT('trash')
  const [params, setParams] = useSearchParams()
  const selectedId = params.get('id')
  const newMode = params.has('new')
  const courseId = Number(params.get('course_id')) || null
  const resourceId = Number(params.get('resource_id')) || null
  const assignmentId = Number(params.get('assignment_id')) || null
  const revision = Number(params.get('revision')) || null
  const [offset, setOffset] = useWorkspaceState(`notes:${courseId ?? 'all'}:offset`, 0)
  const [query, setQuery] = useWorkspaceState(`notes:${courseId ?? 'all'}:query`, '')
  const settledQuery = useDebouncedValue(query)
  const listParams = new URLSearchParams()
  if (courseId) listParams.set('course_id', String(courseId))
  if (offset) listParams.set('offset', String(offset))
  if (settledQuery) listParams.set('q', settledQuery)
  const { data, loading, error, updatedAt, reload } = useApi<NotesResponse>(
    `/api/notes${listParams.size ? `?${listParams}` : ''}`,
    { retainScope: `notes:${courseId ?? 'all'}` },
  )
  const visible = (data?.notes ?? []).filter((note) => !courseId || note.course_id === courseId)
  const canWrite = useWritableHost()
  const [feedback, setFeedback] = useState('')
  const [trashed, setTrashed] = useState<Trashed | null>(null)
  const [trashError, setTrashError] = useState('')
  const [indexOpen, setIndexOpen] = useState(false)
  const [newIntent, setNewIntent] = useState(0)
  function choose(id: string) {
    setIndexOpen(false)
    setFeedback('')
    const next = new URLSearchParams(params)
    next.set('id', id)
    next.delete('new')
    next.delete('revision')
    next.delete('title')
    next.delete('resource_id')
    next.delete('assignment_id')
    setParams(next)
  }
  function chooseRevision(value: number | null) {
    setFeedback('')
    const next = new URLSearchParams(params)
    if (value) next.set('revision', String(value))
    else next.delete('revision')
    setParams(next)
  }
  function openNew() {
    setFeedback('')
    // This user action starts a distinct free document. Pending writes and
    // untransferred RAM text remain recoverable instead of being discarded.
    for (const course of data?.courses ?? []) {
      if (sourceNoteSaveState(course.id, null).phase === 'saved') beginNewSourceNote(course.id, null)
    }
    setNewIntent((value) => value + 1)
    const next = new URLSearchParams(params)
    next.delete('id')
    next.delete('revision')
    next.delete('resource_id')
    next.delete('assignment_id')
    next.delete('title')
    next.set('new', '1')
    setParams(next)
  }
  function created(id: string) {
    reload()
    choose(id)
    setFeedback(t('noteCreatedMessage'))
  }
  function saved() {
    reload()
  }
  async function trashNote(id: string, title: string) {
    setFeedback('')
    setTrashError('')
    try {
      await moveToTrash('note', id)
    } catch (cause) {
      setTrashError(trash('failed', { reason: extractApiErrorMessage(cause) }))
      return
    }
    setTrashed({ kind: 'note', id, title })
    const next = new URLSearchParams(params)
    next.delete('id')
    next.delete('revision')
    setParams(next)
    reload()
  }
  return (
    <Shell
      title={t('pageTitle')}
      eyebrow={t('pageEyebrow')}
      cachedAt={updatedAt}
      actions={
        <div className="page-actions">
          <Link className="subtle-link" to={courseId ? `/courses/${courseId}` : '/courses'}>
            {t('backToCourses')}
          </Link>
          {(selectedId || newMode) && (
            <Button
              size="sm"
              variant="outline"
              aria-expanded={indexOpen}
              aria-controls="note-document-index"
              onClick={() => setIndexOpen((value) => !value)}
            >
              {t('switchNote')}
            </Button>
          )}
          <Link className="subtle-link" to="/inbox">
            {t('captureInbox')}
          </Link>
          {canWrite && (
            <Button size="sm" onClick={openNew}>
              <Plus size={16} /> {t('newNoteButton')}
            </Button>
          )}
        </div>
      }
    >
      {feedback && <ActionFeedback tone="success" message={feedback} />}
      {trashError && <ActionFeedback tone="error" message={trashError} />}
      {trashed && (
        <TrashUndo
          item={trashed}
          onDismiss={() => setTrashed(null)}
          onRestored={(item) => {
            setTrashed(null)
            reload()
            choose(item.id)
          }}
        />
      )}
      <div className={`notes-layout ${selectedId || newMode ? 'has-document' : ''} ${indexOpen ? 'index-open' : ''}`}>
        <div className="note-index" id="note-document-index">
          <div className="note-index-heading">
            <strong>{t('yourPagesLabel')}</strong>
            <span>{data?.page?.total ?? visible.length}</span>
          </div>
          {data && (
            <select
              className="native-select mb-4"
              aria-label={t('filterByCourseAria')}
              value={courseId ?? ''}
              onChange={(event) => {
                setFeedback('')
                const next = new URLSearchParams(params)
                if (event.target.value) next.set('course_id', event.target.value)
                else next.delete('course_id')
                next.delete('id')
                setParams(next)
              }}
            >
              <option value="">{t('allCoursesOption')}</option>
              {data.courses.map((course) => (
                <option key={course.id} value={course.id}>
                  {course.name}
                </option>
              ))}
            </select>
          )}
          <input
            type="search"
            className="course-material-search"
            aria-label={t('searchNotes')}
            placeholder={t('searchNotes')}
            value={query}
            maxLength={200}
            onChange={(event) => {
              setOffset(0)
              setQuery(event.target.value)
            }}
          />
          {loading && !data ? (
            <Loading />
          ) : error ? (
            <Failure message={error} />
          ) : visible.length ? (
            <ListRows>
              {visible.map((note) => (
                <button
                  type="button"
                  className={`note-list-item ${selectedId === note.id ? 'is-selected' : ''}`}
                  key={note.id}
                  onClick={() => choose(note.id)}
                >
                  <FileText size={18} />
                  <span>
                    <strong>{note.title}</strong>
                    <small>
                      {note.course_name} · {localDate(note.updated_at)}
                    </small>
                  </span>
                </button>
              ))}
            </ListRows>
          ) : (
            // The canvas next to the list already offers the first note; the list only says it is empty.
            <p className="note-list-empty">
              <strong>{t('noNotesTitle')}</strong>
              <span>{t('noNotesText')}</span>
            </p>
          )}
          <ListPagination page={data?.page} onPage={setOffset} />
        </div>
        {newMode && data ? (
          assignmentId && courseId ? (
            <AssignmentNewNote
              key={`assignment-${courseId}-${assignmentId}-${newIntent}`}
              data={data}
              courseId={courseId}
              assignmentId={assignmentId}
              onCreated={created}
            />
          ) : (
            <NewNote
              key={`${courseId}-${resourceId}-${params.get('title') ?? ''}-${newIntent}`}
              data={data}
              courseId={courseId}
              resourceId={resourceId}
              suggestedTitle={params.get('title') ?? ''}
              onCreated={created}
            />
          )
        ) : selectedId ? (
          <NoteDocument
            key={selectedId}
            id={selectedId}
            revision={revision}
            notes={data?.notes ?? []}
            onRevision={chooseRevision}
            onEditing={() => setFeedback('')}
            onSaved={saved}
            onTrash={(title) => void trashNote(selectedId, title)}
          />
        ) : (
          <div className="note-canvas note-welcome">
            <UliBuddy mood="awake" size={72} />
            <h2>{t('welcomeTitle')}</h2>
            <p>{t('welcomeText')}</p>
            {canWrite && (
              <Button variant="outline" onClick={openNew}>
                <Plus size={16} /> {t('newNoteButton')}
              </Button>
            )}
          </div>
        )}
      </div>
      <AddonWidgetSlot slot="note.toolbar" />
    </Shell>
  )
}

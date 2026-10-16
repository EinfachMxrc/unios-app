// SPDX-License-Identifier: AGPL-3.0-or-later

import { ActionFeedback } from '@/components/ActionFeedback'
import { FormField } from '@/components/FormField'
import { SaveIndicator } from '@/components/SaveIndicator'
import { Failure } from '@/components/State'
import { NoteEditor } from '@/editor/NoteEditor'
import { docText, parseBody } from '@/editor/doc'
import { markdownToBody } from '@/editor/markdownImport'
import { withDraftBody } from '@/lib/noteBody'
import { NoteTemplates } from './NoteTemplates'
import { rememberPageParentIntent } from '@/lib/notePages'
import { Button } from '@/components/ui/button'
import { useWritableHost } from '@/hooks/host'
import { useT } from '@/i18n/useT'
import {
  clearSourceWorkingDraft,
  rememberSourceWorkingDraft,
  saveSourceNote,
  sourceNoteSaveState,
  sourceWorkingDraft,
  subscribeSourceNoteSave,
  type SourceNoteSaveState,
  type SourceWorkingDraft,
} from '@/lib/sourceNoteSave'
import { clearNewNoteDraft, keepDraft, keepNewNoteDraft, newNoteDraftFor } from '@/noteDraft'
import { queryClient } from '@/offlineCache'
import { chooseSourceNoteTarget } from '@/lib/sourceNoteTarget'
import { CourseLectureCoveragePanel } from '@/components/CourseLectureCoveragePanel'
import type { NotesResponse } from '@/types'
import { LoaderCircle } from 'lucide-react'
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react'

const NOTE_BODY_LIMIT = 100_000
/** The limit counts readable characters, not the stored block lines. */
const textLength = (body: string) => docText(parseBody(body)).length
/** Template blocks get fresh ids each time, so "untouched" is judged by their readable text. */
const isUntouchedTemplate = (body: string, template: string) =>
  !!body.trim() && docText(parseBody(body)).trim() === docText(parseBody(markdownToBody(template))).trim()
export function NewNote({
  data,
  courseId,
  resourceId,
  suggestedTitle,
  initialBody,
  parentId,
  onCreated,
}: {
  data: NotesResponse
  courseId: number | null
  resourceId: number | null
  suggestedTitle: string
  initialBody?: string
  parentId?: string
  onCreated: (id: string) => void
}) {
  const [selectedCourse, setSelectedCourse] = useState(courseId ?? data.courses[0]?.id ?? 0)
  return (
    <NewNoteForm
      key={`${selectedCourse}:${resourceId ?? 'none'}`}
      data={data}
      selectedCourse={selectedCourse}
      onCourseChange={setSelectedCourse}
      resourceId={resourceId}
      suggestedTitle={suggestedTitle}
      initialBody={initialBody}
      parentId={parentId}
      onCreated={onCreated}
    />
  )
}

function NewNoteForm({
  data,
  selectedCourse,
  onCourseChange,
  resourceId,
  suggestedTitle,
  initialBody,
  parentId,
  onCreated,
}: {
  data: NotesResponse
  selectedCourse: number
  onCourseChange: (course: number) => void
  resourceId: number | null
  suggestedTitle: string
  initialBody?: string
  parentId?: string
  onCreated: (id: string) => void
}) {
  const { t } = useT('notes')
  const { t: material } = useT('material')
  const { t: editorText } = useT('editor')
  const canWrite = useWritableHost()
  const [editor, setEditor] = useState<SourceWorkingDraft>(() => {
    const persisted = newNoteDraftFor(selectedCourse, resourceId)
    const working = sourceWorkingDraft(selectedCourse, resourceId)
    if (working && (!persisted || persisted.writeId === working.persisted?.writeId)) {
      return {
        ...working,
        status:
          persisted && persisted.title === working.title && persisted.body === working.body
            ? 'restored'
            : working.body
              ? 'error'
              : 'idle',
      }
    }
    return {
      title: persisted?.title ?? suggestedTitle,
      body: persisted?.body ?? initialBody ?? (resourceId === null ? '' : markdownToBody(t('lectureTemplate'))),
      persisted,
      status: persisted ? 'restored' : 'idle',
    }
  })
  const current = useRef(editor)
  const { title, body } = editor
  const [saveError, setSaveError] = useState('')
  const subscribe = useCallback(
    (listener: () => void) => subscribeSourceNoteSave(selectedCourse, resourceId, listener),
    [selectedCourse, resourceId],
  )
  const getSaveState = useCallback(() => sourceNoteSaveState(selectedCourse, resourceId), [selectedCourse, resourceId])
  const save = useSyncExternalStore(subscribe, getSaveState, getSaveState)
  const busy = save.phase === 'pending'
  const saved = save.phase === 'saved' ? save : null
  const appliedSave = useRef<typeof save | null>(null)

  useEffect(() => {
    rememberSourceWorkingDraft(selectedCourse, resourceId, current.current)
  }, [selectedCourse, resourceId])

  useEffect(() => {
    if (save.phase !== 'saved' || appliedSave.current === save) return
    appliedSave.current = save
    const latest = current.current
    if (save.localCleanupFailed) {
      const next: SourceWorkingDraft = { ...latest, status: 'error' }
      current.current = next
      rememberSourceWorkingDraft(selectedCourse, resourceId, next)
      setEditor(next)
    } else {
      try {
        continueCreated(save, latest)
      } catch {
        const next: SourceWorkingDraft = { ...latest, status: 'error' }
        current.current = next
        rememberSourceWorkingDraft(selectedCourse, resourceId, next)
        setEditor(next)
      }
    }
    // Newer text becomes a draft against this exact acknowledged document.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [save, selectedCourse, resourceId, onCreated])

  function continueCreated(ack: Extract<SourceNoteSaveState, { phase: 'saved' }>, latest: SourceWorkingDraft) {
    if (latest.title !== ack.snapshot.title || latest.body !== ack.snapshot.body) {
      keepDraft({
        noteId: ack.noteId,
        baseRevision: ack.created.note.current_revision,
        baseTitle: ack.created.note.title,
        baseBody: withDraftBody(ack.created).body,
        title: latest.title,
        body: latest.body,
      })
    }
    if (latest.persisted) clearNewNoteDraft(latest.persisted)
    queryClient.setQueryData(['api', `/api/notes/${ack.noteId}`], ack.created)
    if (resourceId !== null) chooseSourceNoteTarget(selectedCourse, resourceId, ack.noteId)
    clearSourceWorkingDraft(selectedCourse, resourceId, latest)
    onCreated(ack.noteId)
  }

  function changeNewDraft(nextTitle: string, nextBody: string) {
    let next: SourceWorkingDraft = {
      title: nextTitle,
      body: nextBody,
      persisted: current.current.persisted,
      status: 'error',
    }
    try {
      next = { ...next, persisted: keepNewNoteDraft(selectedCourse, resourceId, nextTitle, nextBody), status: 'local' }
    } catch {
      // RAM recovery survives remounts for both free and source-bound notes.
    }
    current.current = next
    rememberSourceWorkingDraft(selectedCourse, resourceId, next)
    setEditor(next)
  }
  async function create() {
    const snapshot = current.current
    if (saved) {
      try {
        continueCreated(saved, snapshot)
      } catch {
        setSaveError(t('localSaveFailed'))
      }
      return
    }
    if (
      !canWrite ||
      busy ||
      !selectedCourse ||
      !snapshot.title.trim() ||
      snapshot.title.length > 200 ||
      textLength(snapshot.body) > NOTE_BODY_LIMIT
    )
      return
    setSaveError('')
    rememberSourceWorkingDraft(selectedCourse, resourceId, snapshot)
    rememberPageParentIntent(selectedCourse, parentId)
    void saveSourceNote({
      courseId: selectedCourse,
      resourceId,
      title: snapshot.title,
      body: snapshot.body,
      draft: snapshot.persisted,
    })
  }
  return (
    <article className="note-canvas note-new-canvas">
      <div className="note-canvas-toolbar">
        <span>{t('newNoteLabel')}</span>
      </div>
      <fieldset className="note-form-fieldset" aria-label={t('newNoteAria')} disabled={busy}>
        <div className="note-form note-canvas-content">
          <label className="note-course-picker">
            {t('courseLabel')}
            <select
              className="native-select"
              aria-label={t('courseForNoteAria')}
              value={selectedCourse}
              onChange={(event) => onCourseChange(Number(event.target.value))}
            >
              {data.courses.map((course) => (
                <option key={course.id} value={course.id}>
                  {course.name}
                </option>
              ))}
            </select>
          </label>
          <FormField label={t('noteTitleAria')} required>
            {(control) => (
              <input
                {...control}
                className="note-title-input"
                aria-label={t('noteTitleAria')}
                maxLength={200}
                placeholder={t('noTitlePlaceholder')}
                value={title}
                onChange={(event) => changeNewDraft(event.target.value, body)}
              />
            )}
          </FormField>
          {isUntouchedTemplate(body, t('lectureTemplate')) && !saved && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              disabled={!canWrite || busy}
              onClick={() => changeNewDraft(title, '')}
            >
              {t('emptyNoteButton')}
            </Button>
          )}
          {!body.trim() && <p className="hint">{t('emptyNoteHint')}</p>}
          <CourseLectureCoveragePanel
            courseId={selectedCourse}
            resourceId={resourceId}
            body={body}
            onChange={(next) => changeNewDraft(title, next)}
            disabled={!canWrite || busy}
          />
          <NoteTemplates title={title} body={body} disabled={!canWrite || busy} onChoose={changeNewDraft} />
          <NoteEditor
            workspaceKey={`new:${selectedCourse}:${resourceId ?? 'none'}`}
            id="new-note-body"
            value={body}
            onChange={(next) => changeNewDraft(title, next)}
          />
          {editor.status !== 'idle' && (
            <SaveIndicator
              phase={editor.status === 'error' ? 'error' : 'local'}
              message={
                editor.status === 'error'
                  ? t('localSaveFailed')
                  : editor.status === 'restored'
                    ? t('draftRestoredLocally')
                    : t('draftSavedLocally')
              }
            />
          )}
          {textLength(body) > NOTE_BODY_LIMIT && <Failure message={editorText('tooLong')} />}
          {saveError && <Failure message={saveError} />}
          {save.phase === 'error' && <Failure message={save.message} />}
          {saved && (
            <>
              <ActionFeedback tone="success" message={t('noteCreatedMessage')} />
              <Button type="button" variant="ghost" size="sm" onClick={() => void create()}>
                {material('readerOpenNote')}
              </Button>
            </>
          )}
          <Button
            aria-busy={busy}
            disabled={
              !canWrite ||
              !selectedCourse ||
              !title.trim() ||
              busy ||
              title.length > 200 ||
              textLength(body) > NOTE_BODY_LIMIT
            }
            onClick={() => void create()}
          >
            {busy && <LoaderCircle className="action-feedback-spinner" aria-hidden="true" />}
            {busy ? t('saving') : saved ? material('readerContinueNote') : t('createNoteButton')}
          </Button>
          {busy && <ActionFeedback tone="pending" message={t('creatingNoteMessage')} />}
        </div>
      </fieldset>
    </article>
  )
}

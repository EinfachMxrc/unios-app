// SPDX-License-Identifier: AGPL-3.0-or-later

import { SaveIndicator } from '@/components/SaveIndicator'
import { StudyInsertTools } from '@/components/editor/StudyInsertTools'
import { Empty, Failure, Loading } from '@/components/State'
import { Button } from '@/components/ui/button'
import { useT } from '@/i18n/useT'
import { clearNewNoteDraft, keepDraft, keepNewNoteDraft, newNoteDraftFor } from '@/noteDraft'
import type { Material, MaterialAnnotation, NoteDetail, NotesResponse } from '@/types'
import { useApi } from '@/api'
import { queryClient } from '@/offlineCache'
import { NoteDocument } from '@/pages/notes/NoteDocument'
import { useSourceNoteTarget, validSourceNoteTarget } from '@/lib/sourceNoteTarget'
import { useDebouncedValue } from '@/hooks/useDebouncedValue'
import { LectureCoveragePanel, type LectureSource } from '@/components/LectureCoveragePanel'
import { Brain, ChevronLeft, ChevronRight, ExternalLink } from 'lucide-react'
import { Tabs } from 'radix-ui'
import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type FormEvent,
  type ReactNode,
} from 'react'
import { Link } from 'react-router-dom'
import { useWorkspaceState } from '@/lib/workspaceState'
import { READER_NOTE_BODY_LIMIT, READER_NOTE_TITLE_LIMIT, readerNoteTitle } from './readerExcerpt'
import {
  beginNewSourceNote,
  sourceNoteSaveState,
  sourceWorkingDraft,
  rememberSourceWorkingDraft,
  saveSourceNote,
  clearSourceWorkingDraft,
  subscribeSourceNoteSave,
  type SourceWorkingDraft,
} from '@/lib/sourceNoteSave'
import './ReaderStudyTools.css'

export type ReaderStudyTab = 'annotations' | 'notes' | 'recall'

export function ReaderStudyTools({
  material,
  tab,
  onTabChange,
  excerptRevision,
  onPage,
  canWrite,
  onCreateCard,
  savedNoteHref,
  onNoteChange,
  selectedNoteId,
  currentPage,
  pageCount,
  children,
}: {
  material: Material
  tab: ReaderStudyTab
  onTabChange: (tab: ReaderStudyTab) => void
  excerptRevision: number
  onPage: (page: number) => void
  canWrite: boolean
  onCreateCard?: (item: MaterialAnnotation) => void
  savedNoteHref?: (noteId: string) => string
  onNoteChange?: (noteId: string | null) => void
  selectedNoteId?: string
  currentPage?: number
  pageCount?: number
  children: ReactNode
}) {
  const { t } = useT('material')
  return (
    <Tabs.Root
      className="reader-study-tools"
      value={tab}
      onValueChange={(next) => {
        if (next === 'annotations' || next === 'notes' || next === 'recall') onTabChange(next)
      }}
    >
      <Tabs.List className="reader-study-tabs" aria-label={t('studyToolsTabsAria')}>
        <Tabs.Trigger value="annotations">{t('studyAnnotationsTab')}</Tabs.Trigger>
        <Tabs.Trigger value="notes">{t('studyNotesTab')}</Tabs.Trigger>
        <Tabs.Trigger value="recall">{t('studyRecallTab')}</Tabs.Trigger>
      </Tabs.List>
      <Tabs.Content value="annotations">{children}</Tabs.Content>
      <Tabs.Content value="notes" forceMount>
        <ReaderSourceNotes
          key={`${material.course_id}:${material.resource_id}`}
          material={material}
          excerptRevision={excerptRevision}
          canWrite={canWrite}
          savedNoteHref={savedNoteHref}
          onNoteChange={onNoteChange}
          selectedNoteId={selectedNoteId}
          currentPage={currentPage}
          pageCount={pageCount}
        />
      </Tabs.Content>
      <Tabs.Content value="recall">
        <ReaderRecall material={material} onPage={onPage} onCreateCard={onCreateCard} />
      </Tabs.Content>
    </Tabs.Root>
  )
}

type DraftState = SourceWorkingDraft

function ReaderSourceNotes(props: {
  material: Material
  excerptRevision: number
  canWrite: boolean
  savedNoteHref?: (noteId: string) => string
  onNoteChange?: (noteId: string | null) => void
  selectedNoteId?: string
  currentPage?: number
  pageCount?: number
}) {
  const { t } = useT('material')
  const { t: picker } = useT('readerNotePicker')
  const { material } = props
  const {
    target,
    choose: setTarget,
    resumeError,
    restoring,
  } = useSourceNoteTarget(material.course_id, material.resource_id)
  const [pickerOpen, setPickerOpen] = useState(false)
  const pickerToggle = useRef<HTMLButtonElement>(null)
  const [creation, setCreation] = useState(0)
  const appliedSelection = useRef<string | undefined>(undefined)
  const subscribe = useCallback(
    (listener: () => void) => subscribeSourceNoteSave(material.course_id, material.resource_id, listener),
    [material.course_id, material.resource_id],
  )
  const snapshot = useCallback(
    () => sourceNoteSaveState(material.course_id, material.resource_id),
    [material.course_id, material.resource_id],
  )
  const save = useSyncExternalStore(subscribe, snapshot, snapshot)
  const busy = save.phase === 'pending'
  const lectureSource: LectureSource = {
    versionId: material.version_id,
    resourceId: material.resource_id,
    resourceName: material.resource_name,
    courseId: material.course_id,
    version: material.version,
    currentPage: props.currentPage,
    pageCount: props.pageCount,
  }
  useEffect(() => {
    if (
      !busy &&
      props.selectedNoteId &&
      validSourceNoteTarget(props.selectedNoteId) &&
      props.selectedNoteId !== appliedSelection.current
    ) {
      appliedSelection.current = props.selectedNoteId
      setTarget(props.selectedNoteId)
    }
  }, [props.selectedNoteId, setTarget, busy])
  function created(id: string) {
    setTarget(id)
    props.onNoteChange?.(id)
  }
  function choose(id: string) {
    if (busy) return
    setTarget(id)
    props.onNoteChange?.(id)
    setPickerOpen(false)
    pickerToggle.current?.focus()
  }
  function newNote() {
    if (busy) return
    // Returning to a source's unfinished composition must preserve even RAM-only edits.
    if (
      !newNoteDraftFor(material.course_id, material.resource_id) &&
      !sourceWorkingDraft(material.course_id, material.resource_id)
    )
      beginNewSourceNote(material.course_id, material.resource_id)
    setTarget(null)
    props.onNoteChange?.(null)
    setCreation((value) => value + 1)
  }
  return (
    <div className="reader-continuous-note">
      <div className="reader-note-target-actions">
        <Button
          ref={pickerToggle}
          variant="outline"
          size="sm"
          aria-expanded={pickerOpen}
          disabled={busy}
          onClick={() => setPickerOpen((value) => !value)}
        >
          {picker('open')}
        </Button>
        {target && (
          <Button variant="ghost" size="sm" disabled={busy} onClick={newNote}>
            {t('readerNewNote')}
          </Button>
        )}
        {target && (
          <Link
            className="subtle-link reader-note-full-link"
            aria-label={t('readerOpenNote')}
            title={t('readerOpenNote')}
            to={props.savedNoteHref?.(target) ?? `/notes?id=${target}`}
          >
            <ExternalLink size={16} aria-hidden="true" />
          </Link>
        )}
      </div>
      {resumeError && (
        <p className="muted-text reader-study-hint" role="status">
          {picker('resumeUnavailable')}
        </p>
      )}
      {busy && (
        <p className="muted-text reader-study-hint" role="status">
          {picker('savingBeforeSwitch')}
        </p>
      )}
      {pickerOpen && <ReaderNotePicker material={material} target={target} disabled={busy} onChoose={choose} />}
      {target ? (
        <>
          <SavedReaderNote key={target} {...props} lectureSource={lectureSource} id={target} />
        </>
      ) : restoring ? (
        <Loading variant="editor" />
      ) : (
        <ReaderNoteDraft key={creation} {...props} lectureSource={lectureSource} onCreated={created} />
      )}
    </div>
  )
}

function ReaderNotePicker({
  material,
  target,
  disabled,
  onChoose,
}: {
  material: Material
  target: string | null
  disabled: boolean
  onChoose: (id: string) => void
}) {
  const { t } = useT('readerNotePicker')
  const searchId = useId()
  const [query, setQuery] = useState('')
  const settledQuery = useDebouncedValue(query)
  const [offset, setOffset] = useState(0)
  const params = new URLSearchParams({ course_id: String(material.course_id), limit: '20' })
  if (offset) params.set('offset', String(offset))
  if (settledQuery.trim()) params.set('q', settledQuery.trim())
  const list = useApi<NotesResponse>(`/api/notes?${params}`)
  const notes = useMemo(
    () =>
      (list.data?.notes ?? [])
        .filter((note) => note.course_id === material.course_id && validSourceNoteTarget(note.id))
        .sort(
          (a, b) =>
            Number(b.resource_id === material.resource_id) - Number(a.resource_id === material.resource_id) ||
            b.updated_at.localeCompare(a.updated_at) ||
            a.id.localeCompare(b.id),
        ),
    [list.data, material.course_id, material.resource_id],
  )
  const stale = query !== settledQuery
  return (
    <section className="reader-note-picker" aria-label={t('title')}>
      <label htmlFor={searchId}>{t('search')}</label>
      <input
        id={searchId}
        type="search"
        value={query}
        maxLength={200}
        placeholder={t('searchPlaceholder')}
        onChange={(event) => {
          setQuery(event.target.value)
          setOffset(0)
        }}
      />
      <p className="muted-text reader-study-hint">{t('scopeHint')}</p>
      {list.loading && !list.data && <Loading variant="rows" />}
      {list.error && <Failure message={list.error} retry={list.reload} />}
      {list.data && notes.length === 0 && (
        <p role="status" className="muted-text">
          {t('empty')}
        </p>
      )}
      {notes.length > 0 && (
        <ul className="reader-note-picker-list">
          {notes.map((note) => (
            <li key={note.id}>
              <button
                type="button"
                disabled={disabled || stale}
                aria-pressed={target === note.id}
                onClick={() => onChoose(note.id)}
              >
                <span className="reader-note-picker-name">{note.title}</span>
                <span className="reader-note-picker-meta">
                  {note.resource_id === material.resource_id ? t('linked') : t('courseNote')}
                  {target === note.id && ` · ${t('selected')}`}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
      {(offset > 0 || list.data?.page?.has_more) && (
        <div className="reader-note-picker-pages">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            disabled={disabled || stale || list.loading || offset === 0}
            onClick={() => setOffset((value) => Math.max(0, value - 20))}
          >
            {t('previous')}
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            disabled={disabled || stale || list.loading || !list.data?.page?.has_more}
            onClick={() => setOffset((value) => value + (list.data?.page?.limit ?? 20))}
          >
            {t('next')}
          </Button>
        </div>
      )}
    </section>
  )
}

function SavedReaderNote({
  id,
  material,
  excerptRevision,
  lectureSource,
}: {
  id: string
  material: Material
  excerptRevision: number
  lectureSource: LectureSource
}) {
  const { t } = useT('learning')
  const detail = useApi<NoteDetail>(`/api/notes/${id}`)
  const [revision, setRevision] = useState<number | null>(null)
  if (detail.loading && !detail.data) return <Loading variant="editor" />
  if (detail.error && !detail.data) return <Failure message={detail.error} retry={detail.reload} />
  if (!detail.data || detail.data.note.id !== id || detail.data.note.course_id !== material.course_id)
    return <Failure message={t('focusForeignNote')} />
  return (
    <NoteDocument
      key={id}
      id={id}
      revision={revision}
      notes={[]}
      startEditing
      externalDraftRevision={excerptRevision}
      onRevision={setRevision}
      onEditing={() => setRevision(null)}
      onSaved={detail.reload}
      lectureSource={lectureSource}
    />
  )
}

function ReaderNoteDraft({
  material,
  excerptRevision,
  canWrite,
  savedNoteHref,
  onCreated,
  lectureSource,
}: {
  material: Material
  excerptRevision: number
  canWrite: boolean
  savedNoteHref?: (noteId: string) => string
  onCreated: (noteId: string) => void
  lectureSource: LectureSource
}) {
  const { t } = useT('material')
  const { t: notes } = useT('notes')
  const titleId = useId()
  const bodyId = useId()
  const bodyField = useRef<HTMLTextAreaElement>(null)
  const hintId = useId()
  const [editor, setEditor] = useState<DraftState>(() => {
    const persisted = newNoteDraftFor(material.course_id, material.resource_id)
    const working = sourceWorkingDraft(material.course_id, material.resource_id)
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
      title: persisted?.title ?? readerNoteTitle(material),
      body: persisted?.body ?? '',
      persisted,
      status: persisted ? 'restored' : 'idle',
    }
  })
  const current = useRef(editor)
  const subscribe = useCallback(
    (listener: () => void) => subscribeSourceNoteSave(material.course_id, material.resource_id, listener),
    [material.course_id, material.resource_id],
  )
  const getSaveState = useCallback(
    () => sourceNoteSaveState(material.course_id, material.resource_id),
    [material.course_id, material.resource_id],
  )
  const save = useSyncExternalStore(subscribe, getSaveState, getSaveState)
  const busy = save.phase === 'pending'
  const saved = save.phase === 'saved' ? save : null
  const [localActionError, setLocalActionError] = useState('')
  const appliedSave = useRef<typeof save | null>(null)

  useEffect(() => {
    rememberSourceWorkingDraft(material.course_id, material.resource_id, current.current)
  }, [material.course_id, material.resource_id])

  function change(title: string, body: string) {
    let next: DraftState = { title, body, persisted: current.current.persisted, status: 'error' }
    try {
      next = {
        title,
        body,
        persisted: keepNewNoteDraft(material.course_id, material.resource_id, title, body),
        status: 'local',
      }
    } catch {
      // The text stays editable in memory; report local failure instead of safety.
    }
    current.current = next
    rememberSourceWorkingDraft(material.course_id, material.resource_id, next)
    setEditor(next)
    setLocalActionError('')
  }

  useEffect(() => {
    const incoming = newNoteDraftFor(material.course_id, material.resource_id)
    const before = current.current
    if (!incoming || incoming.writeId === before.persisted?.writeId) return
    const unsaved = before.status === 'error'
    let next: DraftState
    if (unsaved) {
      const baseBody = before.persisted?.body ?? ''
      // An excerpt may arrive after quota recovers. Add only its new suffix to
      // the current in-memory text, preserving edits that failed local storage.
      if (!incoming.body.startsWith(baseBody)) return
      const suffix = incoming.body.slice(baseBody.length)
      const separator =
        before.body && !suffix.startsWith('\n') && !before.body.endsWith('\n\n')
          ? before.body.endsWith('\n')
            ? '\n'
            : '\n\n'
          : ''
      const body = before.body + separator + suffix
      if (body.length > READER_NOTE_BODY_LIMIT) {
        setLocalActionError(notes('studio.tooLong'))
        return
      }
      next = { ...before, body }
      try {
        next = {
          ...next,
          persisted: keepNewNoteDraft(material.course_id, material.resource_id, before.title, body),
          status: 'local',
        }
      } catch {
        // Keep the combined draft in memory until a later edit can persist it.
      }
    } else {
      next = { title: incoming.title, body: incoming.body, persisted: incoming, status: 'local' }
    }
    current.current = next
    rememberSourceWorkingDraft(material.course_id, material.resource_id, next)
    setEditor(next)
  }, [excerptRevision, material.course_id, material.resource_id, notes])

  useEffect(() => {
    if (save.phase !== 'saved' || appliedSave.current === save) return
    appliedSave.current = save
    const latest = current.current
    const snapshot = save.snapshot
    let next: DraftState | null = null
    if (save.localCleanupFailed) {
      next = { ...latest, status: 'error' }
    } else {
      // Continue in the normal revisioned editor. A newer draft is transferred
      // against the acknowledged version before the create form may disappear.
      try {
        if (latest.title !== snapshot.title || latest.body !== snapshot.body) {
          keepDraft({
            noteId: save.noteId,
            baseRevision: save.created.note.current_revision,
            baseTitle: save.created.note.title,
            baseBody: save.created.body,
            title: latest.title,
            body: latest.body,
          })
          if (latest.persisted) clearNewNoteDraft(latest.persisted)
        }
        queryClient.setQueryData(['api', `/api/notes/${save.noteId}`], save.created)
        clearSourceWorkingDraft(material.course_id, material.resource_id, latest)
        onCreated(save.noteId)
      } catch {
        next = { ...latest, status: 'error' }
      }
    }
    if (next) {
      current.current = next
      rememberSourceWorkingDraft(material.course_id, material.resource_id, next)
      setEditor(next)
    }
  }, [save, material, onCreated])

  function create(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const snapshot = current.current
    if (saved) {
      try {
        if (snapshot.title !== saved.snapshot.title || snapshot.body !== saved.snapshot.body) {
          keepDraft({
            noteId: saved.noteId,
            baseRevision: saved.created.note.current_revision,
            baseTitle: saved.created.note.title,
            baseBody: saved.created.body,
            title: snapshot.title,
            body: snapshot.body,
          })
        }
        if (snapshot.persisted) clearNewNoteDraft(snapshot.persisted)
        queryClient.setQueryData(['api', `/api/notes/${saved.noteId}`], saved.created)
        clearSourceWorkingDraft(material.course_id, material.resource_id, snapshot)
        onCreated(saved.noteId)
      } catch {
        setLocalActionError(notes('localSaveFailed'))
      }
      return
    }
    if (
      !canWrite ||
      busy ||
      !snapshot.title.trim() ||
      snapshot.title.length > READER_NOTE_TITLE_LIMIT ||
      snapshot.body.length > READER_NOTE_BODY_LIMIT
    )
      return
    setLocalActionError('')
    rememberSourceWorkingDraft(material.course_id, material.resource_id, snapshot)
    void saveSourceNote({
      courseId: material.course_id,
      resourceId: material.resource_id,
      title: snapshot.title,
      body: snapshot.body,
      draft: snapshot.persisted,
    })
  }

  const statusMessage =
    editor.status === 'error'
      ? notes('localSaveFailed')
      : editor.status === 'restored'
        ? notes('draftRestoredLocally')
        : notes('draftSavedLocally')
  return (
    <form className="reader-note-draft" onSubmit={create}>
      <label htmlFor={titleId}>{notes('noteTitleAria')}</label>
      <input
        id={titleId}
        value={editor.title}
        maxLength={READER_NOTE_TITLE_LIMIT}
        onChange={(event) => change(event.target.value, editor.body)}
        required
      />
      <LectureCoveragePanel
        body={editor.body}
        onChange={(body) => change(current.current.title, body)}
        source={lectureSource}
        disabled={busy}
      />
      <label htmlFor={bodyId}>{notes('noteContentAria')}</label>
      <StudyInsertTools
        field={bodyField}
        value={editor.body}
        maxLength={READER_NOTE_BODY_LIMIT}
        onChange={(body) => change(editor.title, body)}
        disabled={busy}
        compact
      >
        <textarea
          ref={bodyField}
          id={bodyId}
          value={editor.body}
          maxLength={READER_NOTE_BODY_LIMIT}
          aria-describedby={hintId}
          placeholder={t('readerNotesPlaceholder')}
          onChange={(event) => change(editor.title, event.target.value)}
          rows={15}
        />
      </StudyInsertTools>
      <p className="muted-text reader-study-hint" id={hintId}>
        {t('readerNotesHint')}
      </p>
      {editor.status !== 'idle' && (
        <SaveIndicator phase={editor.status === 'error' ? 'error' : 'local'} message={statusMessage} />
      )}
      {localActionError && <Failure message={localActionError} />}
      {editor.body.length > READER_NOTE_BODY_LIMIT && <Failure message={notes('studio.tooLong')} />}
      {save.phase === 'error' && <Failure message={save.message} />}
      {saved && (
        <div className="reader-note-saved" role="status">
          <span>{t('readerNoteSaved')}</span>
          <Link
            className="subtle-link"
            to={savedNoteHref?.(saved.noteId) ?? `/notes?id=${encodeURIComponent(saved.noteId)}`}
          >
            {t('readerOpenNote')} <ExternalLink size={14} aria-hidden="true" />
          </Link>
        </div>
      )}
      <div className="reader-note-actions">
        <Button
          type="submit"
          aria-busy={busy}
          disabled={
            !canWrite ||
            busy ||
            !editor.title.trim() ||
            editor.title.length > READER_NOTE_TITLE_LIMIT ||
            editor.body.length > READER_NOTE_BODY_LIMIT
          }
        >
          {busy ? notes('saving') : saved ? t('readerContinueNote') : notes('createNoteButton')}
        </Button>
        {!canWrite && <p className="muted-text reader-study-hint">{t('readerNotesReadOnly')}</p>}
      </div>
    </form>
  )
}

function ReaderRecall({
  material,
  onPage,
  onCreateCard,
}: {
  material: Material
  onPage: (page: number) => void
  onCreateCard?: (item: MaterialAnnotation) => void
}) {
  const { t } = useT('material')
  const cards = useMemo(
    () =>
      material.annotations.filter(
        (item) =>
          item.anchor.status === 'matched' &&
          Number.isSafeInteger(item.anchor.page) &&
          (item.anchor.page ?? 0) > 0 &&
          item.quote.trim(),
      ),
    [material.annotations],
  )
  const [index, setIndex] = useWorkspaceState(`reader:recall:${material.version_id}:index`, 0, {
    persist: false,
    valid: (value): value is number => Number.isSafeInteger(value) && (value as number) >= 0,
  })
  const currentIndex = Math.min(index, Math.max(0, cards.length - 1))
  const card = cards[currentIndex]
  const cardKey = card ? `${card.id}:${card.revision}` : ''
  const [answer, setAnswer] = useWorkspaceState(
    `reader:recall:${material.version_id}:answer`,
    { cardKey, revealed: false },
    {
      persist: false,
      valid: (value): value is { cardKey: string; revealed: boolean } =>
        !!value &&
        typeof value === 'object' &&
        'cardKey' in value &&
        typeof value.cardKey === 'string' &&
        'revealed' in value &&
        typeof value.revealed === 'boolean',
    },
  )
  useEffect(() => {
    if (answer.cardKey !== cardKey) setAnswer({ cardKey, revealed: false })
  }, [answer.cardKey, cardKey, setAnswer])
  if (!card) return <Empty icon={Brain} title={t('recallEmptyTitle')} text={t('recallEmptyText')} />
  return (
    <section className="reader-recall">
      <p className="muted-text reader-study-hint">{t('recallHint')}</p>
      <div className="reader-recall-navigation">
        <Button
          type="button"
          variant="outline"
          size="icon"
          aria-label={t('recallPrevious')}
          disabled={currentIndex === 0}
          onClick={() => setIndex(currentIndex - 1)}
        >
          <ChevronLeft size={16} aria-hidden="true" />
        </Button>
        <span>{t('recallProgress', { current: currentIndex + 1, total: cards.length })}</span>
        <Button
          type="button"
          variant="outline"
          size="icon"
          aria-label={t('recallNext')}
          disabled={currentIndex === cards.length - 1}
          onClick={() => setIndex(currentIndex + 1)}
        >
          <ChevronRight size={16} aria-hidden="true" />
        </Button>
      </div>
      <RecallCard
        key={cardKey}
        card={card}
        onPage={onPage}
        onCreateCard={onCreateCard}
        revealed={answer.cardKey === cardKey && answer.revealed}
        onReveal={() => setAnswer({ cardKey, revealed: !(answer.cardKey === cardKey && answer.revealed) })}
      />
    </section>
  )
}

function RecallCard({
  card,
  onPage,
  onCreateCard,
  revealed,
  onReveal,
}: {
  card: MaterialAnnotation
  onPage: (page: number) => void
  onCreateCard?: (item: MaterialAnnotation) => void
  revealed: boolean
  onReveal: () => void
}) {
  const { t } = useT('material')
  const { t: study } = useT('study')
  const answerId = useId()
  return (
    <article className="reader-recall-card">
      <span className="reader-recall-source muted-text">{t('pageLabel', { page: card.anchor.page })}</span>
      <h3>{card.comment.trim() || t('recallPrompt', { page: card.anchor.page })}</h3>
      <Button
        type="button"
        variant={revealed ? 'outline' : 'default'}
        aria-expanded={revealed}
        aria-controls={answerId}
        onClick={onReveal}
      >
        {revealed ? t('recallHide') : t('recallReveal')}
      </Button>
      <div id={answerId} hidden={!revealed} className="reader-recall-answer-slot">
        {revealed && <blockquote className="reader-recall-answer">{card.quote}</blockquote>}
      </div>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        onClick={() => {
          if (card.anchor.page) onPage(card.anchor.page)
        }}
      >
        {t('showLocation')}
      </Button>
      {onCreateCard && (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          data-manual-card-source={card.id}
          onClick={() => onCreateCard(card)}
        >
          {study('manual.createAction')}
        </Button>
      )}
    </article>
  )
}

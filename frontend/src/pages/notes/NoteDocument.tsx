// SPDX-License-Identifier: AGPL-3.0-or-later

import { ApiError, localDate, request, useApi } from '@/api'
import { LocalActions } from '@/components/LocalActions'
import { NoteMarkdownDocument } from '@/components/NoteMarkdownDocument'
import { SaveIndicator } from '@/components/SaveIndicator'
import { Failure, Loading } from '@/components/State'
import { NoteStudio } from '@/components/editor/NoteStudio'
import { Button } from '@/components/ui/button'
import { HostContext, useWritableHost } from '@/hooks/host'
import { useT } from '@/i18n/useT'
import { useWorkspaceState } from '@/lib/workspaceState'
import { rememberObject } from '@/lib/recentObjects'
import {
  archiveDraft,
  archivedDraftsFor,
  clearDraft,
  draftFor,
  keepDraft,
  rememberVolatileNoteDraft,
  workingNoteDraftFor,
  type NoteDraft,
} from '@/noteDraft'
import { mergeNoteText, mergeNoteTitle } from '@/noteMerge'
import { queryClient } from '@/offlineCache'
import type { HostStatus, NoteDetail, NotesResponse } from '@/types'
import { useCallback, useContext, useEffect, useRef, useState } from 'react'
import { NoteConflict, NoteHistory, NoteSidePanel, type ArchivedDraft } from './NoteParts'
import { Link } from 'react-router-dom'
import { Trash2 } from 'lucide-react'
import { LectureCoveragePanel, type LectureSource } from '@/components/LectureCoveragePanel'
import { CourseLectureCoveragePanel } from '@/components/CourseLectureCoveragePanel'
export function NoteDocument({
  id,
  revision,
  notes,
  onRevision,
  onEditing,
  onSaved,
  externalDraftRevision = 0,
  startEditing = false,
  onTrash,
  lectureSource,
}: {
  id: string
  revision: number | null
  notes: NotesResponse['notes']
  onRevision: (value: number | null) => void
  onEditing: () => void
  onSaved: () => void
  externalDraftRevision?: number
  startEditing?: boolean
  /** Offered where leaving the note is fine (the notes page); not beside the PDF. */
  onTrash?: (title: string) => void
  lectureSource?: LectureSource
}) {
  const { t } = useT('notes')
  const { t: trash } = useT('trash')
  const path = `/api/notes/${id}${revision ? `?revision=${revision}` : ''}`
  const { data, loading, error: initialError, refreshError, reload } = useApi<NoteDetail>(path)
  const error = initialError ?? refreshError
  useEffect(() => {
    if (data && !error && data.note.id === id) rememberObject(`/notes?id=${id}`, data.note.title)
  }, [data, error, id])
  const host = useContext(HostContext)
  const canWrite = useWritableHost()
  const [editing, setEditing] = useWorkspaceState(`note:${id}:editing`, startEditing, { persist: false })
  useEffect(() => {
    if (startEditing) setEditing(true)
  }, [startEditing, setEditing])
  const [title, setTitle] = useState('')
  const [body, setBody] = useState('')
  const [status, setStatus] = useState('')
  const [conflict, setConflict] = useState<{ local: NoteDraft; remote: NoteDetail } | null>(null)
  const [manualResolution, setManualResolution] = useState(false)
  const [archived, setArchived] = useState(() => archivedDraftsFor(id))
  const draftRef = useRef<NoteDraft | null>(null)
  const baseRef = useRef<NoteDetail | null>(null)
  const syncingRef = useRef(false)
  const pausedRef = useRef(false)
  const syncRef = useRef<() => Promise<void>>(async () => {})
  // Read synchronously inside the reload effect below: title/body themselves
  // can't be dependencies there without re-running it on every keystroke.
  const liveRef = useRef({ title, body })
  liveRef.current = { title, body }
  const showDraft = useCallback(
    (draft: NoteDraft) => {
      draftRef.current = draft
      setTitle(draft.title)
      setBody(draft.body)
      setEditing(true)
      setStatus(t(draftFor(id)?.writeId === draft.writeId ? 'savedLocallyPendingSync' : 'localSaveFailed'))
    },
    [t, setEditing, id],
  )
  useEffect(() => {
    if (data && data.note.id === id) {
      const firstLoad = !baseRef.current
      const older = !revision && !!baseRef.current && data.note.current_revision < baseRef.current.note.current_revision
      const priorBase = baseRef.current
      if (!revision && (!baseRef.current || data.note.current_revision >= baseRef.current.note.current_revision)) {
        baseRef.current = data
      }
      if (revision && editing) setEditing(false)
      const savedDraft = !revision ? workingNoteDraftFor(id) : null
      if (savedDraft) showDraft(savedDraft)
      // A sync clears draftRef before its reload() resolves. If a keystroke lands in
      // that gap before this effect runs, draftRef may already be null again while
      // the live title/body have moved past what the server just echoed back; only
      // treat the draft as absent when the editor still matches the prior base.
      else if (
        !older &&
        (!editing ||
          firstLoad ||
          (!draftRef.current &&
            (!priorBase ||
              (liveRef.current.title ===
                (priorBase.versions.find((item) => item.revision === priorBase.selected_revision)?.title ??
                  priorBase.note.title) &&
                liveRef.current.body === priorBase.body))))
      ) {
        setTitle(data.versions.find((item) => item.revision === data.selected_revision)?.title ?? data.note.title)
        setBody(data.body)
      }
    }
  }, [data, editing, id, revision, showDraft, setEditing, externalDraftRevision])
  function changeDraft(nextTitle: string, nextBody: string) {
    if (!data) return
    const previous = draftRef.current
    const base = baseRef.current ?? data
    try {
      const saved = keepDraft({
        noteId: id,
        baseRevision: previous?.baseRevision ?? base.note.current_revision,
        baseTitle: previous?.baseTitle ?? base.note.title,
        baseBody: previous?.baseBody ?? base.body,
        title: nextTitle,
        body: nextBody,
      })
      draftRef.current = saved
      if (conflict) setConflict({ ...conflict, local: saved })
      setTitle(nextTitle)
      setBody(nextBody)
      setStatus(t('savedLocallyPendingSync'))
    } catch {
      draftRef.current = rememberVolatileNoteDraft({
        noteId: id,
        baseRevision: previous?.baseRevision ?? base.note.current_revision,
        baseTitle: previous?.baseTitle ?? base.note.title,
        baseBody: previous?.baseBody ?? base.body,
        title: nextTitle,
        body: nextBody,
      })
      setTitle(nextTitle)
      setBody(nextBody)
      setStatus(t('localSaveFailed'))
    }
  }
  const sync = useCallback(async () => {
    const starting = draftRef.current
    if (!starting || syncingRef.current || conflict || manualResolution || !starting.title.trim()) return
    if (document.visibilityState === 'hidden' || pausedRef.current) return
    syncingRef.current = true
    try {
      // A cached host status is insufficient after a laptop wakes or changes networks.
      const activeHost = await request<HostStatus>('/api/host', { cache: 'no-store' })
      if (!activeHost || activeHost.mode !== 'host' || activeHost.generation === null) {
        setStatus(t('savedLocallyWaitingForHost'))
        return
      }
      const latest = await request<NoteDetail>(`/api/notes/${id}`, { cache: 'no-store' })
      baseRef.current = latest
      const current = draftRef.current
      if (!current || current.writeId !== starting.writeId) return
      if (latest.note.current_revision < current.baseRevision) {
        setStatus(t('savedLocallyMissingNewerState'))
        return
      }
      if (
        latest.note.current_revision === current.baseRevision &&
        (latest.note.title !== current.baseTitle || latest.body !== current.baseBody)
      ) {
        setConflict({ local: current, remote: latest })
        setStatus(t('conflictSameVersion'))
        return
      }
      let candidate = current
      if (latest.note.current_revision !== current.baseRevision) {
        const mergedTitle = mergeNoteTitle(current.baseTitle, current.title, latest.note.title)
        const mergedBody = mergeNoteText(current.baseBody, current.body, latest.body)
        if (!mergedTitle.clean || !mergedBody.clean) {
          setConflict({ local: current, remote: latest })
          setStatus(t('conflictBothKept'))
          return
        }
        candidate = keepDraft({
          noteId: id,
          baseRevision: latest.note.current_revision,
          baseTitle: latest.note.title,
          baseBody: latest.body,
          title: mergedTitle.value,
          body: mergedBody.value,
        })
        showDraft(candidate)
      }
      if (candidate.title === latest.note.title && candidate.body === latest.body) {
        clearDraft(id, candidate.writeId)
        draftRef.current = null
        setStatus(t('savedOnHost'))
        reload()
        return
      }
      if (draftRef.current?.writeId !== candidate.writeId) return
      setStatus(t('savingOnHost'))
      const saved = await request<NoteDetail>(`/api/notes/${id}`, {
        method: 'PUT',
        body: JSON.stringify({
          expected_revision: candidate.baseRevision,
          title: candidate.title.trim(),
          body: candidate.body,
        }),
      })
      baseRef.current = saved
      const newer = draftRef.current
      if (newer?.writeId === candidate.writeId) {
        clearDraft(id, candidate.writeId)
        draftRef.current = null
        setStatus(t('savedOnHost'))
      } else if (newer) {
        const rebased = keepDraft({
          noteId: id,
          baseRevision: saved.note.current_revision,
          baseTitle: saved.note.title,
          baseBody: saved.body,
          title: newer.title,
          body: newer.body,
        })
        draftRef.current = rebased
        setStatus(t('savedLocallySyncingMore'))
      }
      reload()
      onSaved()
    } catch (cause) {
      if (cause instanceof ApiError && cause.status === 409) {
        setStatus(t('savedLocallyRecheckingState'))
        reload()
      } else {
        setStatus(t('savedLocallyHostUnreachable'))
      }
    } finally {
      syncingRef.current = false
    }
  }, [conflict, id, manualResolution, onSaved, reload, showDraft, t])
  syncRef.current = sync
  useEffect(() => {
    if (!draftRef.current || conflict || manualResolution) return
    const timer = window.setTimeout(() => void syncRef.current(), 1200)
    return () => window.clearTimeout(timer)
  }, [title, body, conflict, manualResolution, host])
  useEffect(() => {
    const timer = window.setInterval(() => {
      if (draftRef.current) void syncRef.current()
    }, 15_000)
    return () => window.clearInterval(timer)
  }, [])
  useEffect(() => {
    const pause = () => {
      pausedRef.current = true
    }
    const resume = () => {
      pausedRef.current = true
      void Promise.all([
        queryClient.invalidateQueries({ queryKey: ['api', '/api/host'] }),
        queryClient.invalidateQueries({ queryKey: ['api', `/api/notes/${id}`] }),
      ]).finally(() => {
        pausedRef.current = false
        void syncRef.current()
      })
    }
    const visibility = () => (document.visibilityState === 'hidden' ? pause() : resume())
    document.addEventListener('visibilitychange', visibility)
    window.addEventListener('pageshow', resume)
    window.addEventListener('online', resume)
    return () => {
      document.removeEventListener('visibilitychange', visibility)
      window.removeEventListener('pageshow', resume)
      window.removeEventListener('online', resume)
    }
  }, [id])
  function resolveConflict(choice: 'both' | 'local' | 'remote' | 'manual') {
    if (!conflict) return
    const { local, remote } = conflict
    if (choice === 'remote') {
      try {
        archiveDraft(local)
        setArchived(archivedDraftsFor(id))
      } catch {
        setStatus(t('archiveFailedKeepDraft'))
        return
      }
      clearDraft(id, local.writeId)
      draftRef.current = null
      setTitle(remote.note.title)
      setBody(remote.body)
      setEditing(false)
      setStatus(t('adoptedHostVersion'))
      setConflict(null)
      reload()
      return
    }
    const combined = choice === 'both' ? `${remote.body}\n\n---\n\n${local.body}` : local.body
    let resolved: NoteDraft
    try {
      resolved = keepDraft({
        noteId: id,
        baseRevision: remote.note.current_revision,
        baseTitle: remote.note.title,
        baseBody: remote.body,
        title: local.title,
        body: combined,
      })
    } catch {
      setStatus(t('conflictDecisionSaveFailed'))
      return
    }
    showDraft(resolved)
    setConflict(null)
    setManualResolution(choice === 'manual')
  }
  function restoreArchivedDraft(item: ArchivedDraft) {
    if (!data || revision) return
    const base = baseRef.current ?? data
    try {
      showDraft(
        keepDraft({
          noteId: id,
          baseRevision: base.note.current_revision,
          baseTitle: base.note.title,
          baseBody: base.body,
          title: item.title,
          body: item.body,
        }),
      )
    } catch {
      setStatus(t('draftRestoreFailed'))
    }
  }
  const canEditInPlace = canWrite && !!data && !revision && !editing
  function beginEditing() {
    onEditing()
    setEditing(true)
    setStatus(t('changesAutoSavedLocally'))
  }
  return (
    <article className="note-canvas">
      <div className="note-canvas-toolbar">
        <span>{data?.note.course_name ?? t('defaultNoteLabel')}</span>
        {data && !revision && !editing && (
          <Link className="subtle-link" to={`/assessment?course=${data.note.course_id}&note=${id}`}>
            {t('checkNote')} →
          </Link>
        )}
        {canWrite && data && !revision && (
          <LocalActions
            kind="note"
            entityId={id}
            compact
            disabled={!!draftRef.current || syncingRef.current || !!conflict}
            onRestored={async () => {
              const latest = await request<NoteDetail>(`/api/notes/${id}`)
              baseRef.current = latest
              setTitle(latest.note.title)
              setBody(latest.body)
              reload()
              onSaved()
            }}
          />
        )}
        {canWrite && data && !revision && !editing && (
          <Button variant="outline" size="sm" onClick={beginEditing}>
            {t('editButton')}
          </Button>
        )}
        {onTrash && canWrite && data && !revision && !editing && (
          <Button
            variant="ghost"
            size="sm"
            className="note-trash-button"
            disabled={!!draftRef.current || syncingRef.current || !!conflict}
            aria-label={trash('moveToTrashLabel', { title: data.note.title })}
            onClick={() => onTrash(data.note.title)}
          >
            <Trash2 size={15} /> {trash('moveToTrash')}
          </Button>
        )}
      </div>
      {loading && !data ? (
        <Loading />
      ) : error && !data ? (
        <Failure message={error} />
      ) : (
        data && (
          <>
            {error && <Failure message={error} retry={reload} />}
            <div className="note-content-grid">
              <div className="note-main">
                {editing ? (
                  <fieldset className="note-form note-canvas-content note-form-fieldset" aria-label={t('editNoteAria')}>
                    <input
                      className="note-title-input"
                      aria-label={t('noteTitleAria')}
                      maxLength={200}
                      value={title}
                      onChange={(event) => changeDraft(event.target.value, body)}
                    />
                    {lectureSource ? (
                      <LectureCoveragePanel
                        body={body}
                        onChange={(next) => changeDraft(title, next)}
                        source={lectureSource}
                        disabled={!canWrite || !!conflict}
                      />
                    ) : (
                      <CourseLectureCoveragePanel
                        courseId={data.note.course_id}
                        resourceId={data.note.resource_id}
                        body={body}
                        onChange={(next) => changeDraft(title, next)}
                        disabled={!canWrite || !!conflict}
                      />
                    )}
                    <NoteStudio
                      workspaceKey={`note:${id}`}
                      id="note-edit-body"
                      value={body}
                      onChange={(next) => changeDraft(title, next)}
                      notes={notes}
                      cardSource={{
                        noteId: id,
                        revision: data.selected_revision,
                        title: data.note.title,
                        courseId: data.note.course_id,
                        courseName: data.note.course_name,
                      }}
                      canCreateCard={
                        canWrite && !conflict && !draftRef.current && body === data.body && title === data.note.title
                      }
                    />
                    {status && (
                      <SaveIndicator
                        phase={
                          conflict
                            ? 'conflict'
                            : status === t('savedOnHost')
                              ? 'saved'
                              : status === t('savingOnHost')
                                ? 'saving'
                                : 'local'
                        }
                        message={status}
                      />
                    )}
                    {conflict && (
                      <NoteConflict local={conflict.local} remote={conflict.remote} onResolve={resolveConflict} />
                    )}
                    <div className="note-editor-actions">
                      {manualResolution && (
                        <Button
                          onClick={() => {
                            setManualResolution(false)
                            void syncRef.current()
                          }}
                        >
                          {t('applyEditButton')}
                        </Button>
                      )}
                      <Button variant="ghost" disabled={!!draftRef.current} onClick={() => setEditing(false)}>
                        {t('closeButton')}
                      </Button>
                    </div>
                  </fieldset>
                ) : (
                  // The page is the canvas: clicking into the text starts writing, as the button does.
                  // Links, controls and a running text selection keep their own behaviour.
                  <div
                    className={`note-document ${canEditInPlace ? 'is-editable' : ''}`}
                    onClick={
                      canEditInPlace
                        ? (event) => {
                            const target = event.target instanceof Element ? event.target : null
                            if (
                              target?.closest('a, button, input, textarea, select, summary, details, [role="button"]')
                            )
                              return
                            if (window.getSelection()?.toString()) return
                            beginEditing()
                          }
                        : undefined
                    }
                  >
                    <h2>
                      {data.versions.find((item) => item.revision === data.selected_revision)?.title ?? data.note.title}
                    </h2>
                    <p className="muted-text note-meta">
                      {t('editedMeta', { date: localDate(data.note.updated_at), revision: data.selected_revision })}
                    </p>
                    <NoteMarkdownDocument body={data.body} notes={notes} />
                  </div>
                )}
                <NoteHistory data={data} archived={archived} onRevision={onRevision} onRestore={restoreArchivedDraft} />
              </div>
              <NoteSidePanel data={data} id={id} onSaved={onSaved} />
            </div>
          </>
        )
      )}
    </article>
  )
}

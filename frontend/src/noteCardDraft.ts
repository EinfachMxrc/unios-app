// SPDX-License-Identifier: AGPL-3.0-or-later
import { useCallback, useEffect, useSyncExternalStore } from 'react'
import { ApiError, request } from '@/api'
import i18n from '@/i18n'
import { newManualDraftId } from '@/lib/manualDraftId'
import { manualWebLocksAvailable, withManualBinding, withManualStorageLock } from '@/lib/manualDraftCoordination'
import { assertManualWorkspace, readManualWorkspace } from '@/lib/manualDraftPersistence'
import type { DraftWorkspace } from '@/manualDraftTypes'
import { invalidateManualCardReads } from '@/manualCardDraft'
import type { NoteCardContext, NoteCardInput, NoteCardResponse } from '@/noteCardTypes'

export type NoteCardDraft = {
  schema: 1
  context: NoteCardContext
  mutationId: string
  writeId: string
  front: string
  back: string
  topic: string
  sent: NoteCardInput | null
  result: NoteCardResponse | null
  rejection?: boolean
}
type DraftState = {
  draft: NoteCardDraft
  phase: 'loading' | 'editing' | 'sending' | 'unconfirmed' | 'saved' | 'blocked'
  localSaved: boolean
  error: string | null
}
type Session = { workspace: DraftWorkspace; key: string; expected: string }
const entries = new Map<string, DraftState>(),
  sessions = new Map<string, Session>()
const listeners = new Set<() => void>(),
  loading = new Map<string, Promise<void>>(),
  writes = new Map<string, Promise<void>>()
let epoch = 0
const notify = () => listeners.forEach((listener) => listener())
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const contextKey = (context: NoteCardContext) => `${context.noteId}:${context.revision}:${context.quote}`
function quoteHash(quote: string) {
  let hash = 2166136261
  for (const character of quote) hash = Math.imul(hash ^ character.charCodeAt(0), 16777619)
  return (hash >>> 0).toString(16)
}
function fresh(context: NoteCardContext): NoteCardDraft {
  return {
    schema: 1,
    context: { ...context },
    mutationId: newManualDraftId(),
    writeId: newManualDraftId(),
    front: '',
    back: context.quote,
    topic: context.title.slice(0, 200).trim(),
    sent: null,
    result: null,
  }
}
function valid(value: unknown, context: NoteCardContext): value is NoteCardDraft {
  const draft = value as NoteCardDraft | null
  return (
    !!draft &&
    draft.schema === 1 &&
    uuid.test(draft.mutationId) &&
    uuid.test(draft.writeId) &&
    !!draft.context &&
    contextKey(draft.context) === contextKey(context) &&
    typeof draft.front === 'string' &&
    typeof draft.back === 'string' &&
    typeof draft.topic === 'string' &&
    (draft.sent === null ||
      (draft.sent.mutation_id === draft.mutationId &&
        draft.sent.front === draft.front &&
        draft.sent.back === draft.back &&
        draft.sent.topic === draft.topic &&
        draft.sent.source?.note_id === context.noteId &&
        draft.sent.source.revision === context.revision &&
        draft.sent.source.quote === context.quote)) &&
    (draft.result === null || (!!draft.sent && validResult(draft.result, draft.sent)))
  )
}
function validResult(result: NoteCardResponse, sent: NoteCardInput) {
  return (
    !!result &&
    Number.isSafeInteger(result.queue_id) &&
    result.queue_id > 0 &&
    (result.status === 'approved' || result.status === 'pushed') &&
    result.source?.kind === 'note' &&
    result.source.note_id === sent.source.note_id &&
    result.source.revision === sent.source.revision &&
    result.source.quote === sent.source.quote &&
    result.card?.front === sent.front.trim() &&
    result.card?.back === sent.back.trim()
  )
}
function state(draft: NoteCardDraft): DraftState {
  return {
    draft,
    phase: draft.result ? 'saved' : draft.rejection ? 'blocked' : draft.sent ? 'unconfirmed' : 'editing',
    localSaved: true,
    error: draft.rejection ? i18n.t('noteCards:sourceChanged') : null,
  }
}
export function noteCardState(context: NoteCardContext): DraftState {
  const key = contextKey(context)
  if (!entries.has(key)) entries.set(key, { draft: fresh(context), phase: 'loading', localSaved: false, error: null })
  return entries.get(key)!
}
function stored(session: Session, context: NoteCardContext) {
  const raw = localStorage.getItem(session.key)
  if (raw === null) return null
  const draft: unknown = JSON.parse(raw)
  if (!valid(draft, context)) throw new Error(i18n.t('noteCards:storageFailure'))
  return draft
}
export function openNoteCardDraft(context: NoteCardContext): Promise<void> {
  const key = contextKey(context)
  const captured = epoch
  if (loading.has(key)) return loading.get(key)!
  if (noteCardState(context).phase !== 'loading') return Promise.resolve()
  const work = (async () => {
    try {
      const workspace = await readManualWorkspace()
      const storageKey = `unios:note-card-draft:v1:${workspace.id}:${context.noteId}:${context.revision}:${quoteHash(context.quote)}`
      await withManualStorageLock(storageKey, async () => {
        await assertManualWorkspace(workspace)
        if (captured !== epoch) return
        const session = { workspace, key: storageKey, expected: '' }
        const draft = stored(session, context) ?? noteCardState(context).draft
        localStorage.setItem(storageKey, JSON.stringify(draft))
        sessions.set(key, { ...session, expected: draft.writeId })
        entries.set(key, state(draft))
        notify()
      })
    } catch {
      if (captured !== epoch) return
      const previous = noteCardState(context)
      entries.set(key, { ...previous, phase: 'blocked', localSaved: false, error: i18n.t('noteCards:storageFailure') })
      notify()
    }
  })().finally(() => loading.delete(key))
  loading.set(key, work)
  return work
}
async function persist(context: NoteCardContext, draft: NoteCardDraft) {
  const key = contextKey(context),
    session = sessions.get(key)
  if (!session) throw new Error(i18n.t('noteCards:storageFailure'))
  await withManualStorageLock(session.key, async () => {
    await assertManualWorkspace(session.workspace)
    const current = stored(session, context)
    if (!current || current.writeId !== session.expected) throw new Error(i18n.t('noteCards:conflict'))
    localStorage.setItem(session.key, JSON.stringify(draft))
    session.expected = draft.writeId
  })
}
function enqueue(context: NoteCardContext, work: () => Promise<void>) {
  const key = contextKey(context)
  const promise = (writes.get(key) ?? Promise.resolve()).then(work).finally(() => {
    if (writes.get(key) === promise) writes.delete(key)
  })
  writes.set(key, promise)
  return promise
}
export function updateNoteCardDraft(
  context: NoteCardContext,
  fields: Partial<Pick<NoteCardDraft, 'front' | 'back' | 'topic'>>,
) {
  return enqueue(context, async () => {
    const key = contextKey(context),
      previous = noteCardState(context)
    if (previous.phase !== 'editing') return
    const draft = { ...previous.draft, ...fields, writeId: newManualDraftId() }
    entries.set(key, { ...previous, draft, localSaved: false })
    notify()
    try {
      await persist(context, draft)
      entries.set(key, state(draft))
    } catch (cause) {
      entries.set(key, {
        ...previous,
        draft,
        phase: 'blocked',
        localSaved: false,
        error: cause instanceof Error ? cause.message : i18n.t('noteCards:storageFailure'),
      })
    }
    notify()
  })
}
export function saveNoteCardDraft(context: NoteCardContext) {
  return enqueue(context, async () => {
    const key = contextKey(context),
      previous = noteCardState(context),
      session = sessions.get(key)
    if (
      !session ||
      !previous.localSaved ||
      !manualWebLocksAvailable() ||
      !['editing', 'unconfirmed'].includes(previous.phase)
    )
      return
    let draft = previous.draft
    const captured = epoch
    if (
      !draft.front.trim() ||
      !draft.back.trim() ||
      !draft.topic.trim() ||
      draft.front.length > 4000 ||
      draft.back.length > 8000 ||
      draft.topic.length > 200
    )
      return
    const abort = new AbortController()
    const timer = window.setTimeout(() => abort.abort(), 20_000)
    let intentStored = false,
      receiptStored = false
    try {
      await withManualBinding(async () => {
        await assertManualWorkspace(session.workspace)
        if (captured !== epoch) return
        const sent: NoteCardInput = draft.sent ?? {
          mutation_id: draft.mutationId,
          front: draft.front,
          back: draft.back,
          topic: draft.topic,
          source: { note_id: context.noteId, revision: context.revision, quote: context.quote },
        }
        // Store the exact send intent before the first POST; every retry reuses it.
        draft = { ...draft, sent, writeId: newManualDraftId() }
        await persist(context, draft)
        intentStored = true
        entries.set(key, { ...state(draft), phase: 'sending' })
        notify()
        const result = await request<NoteCardResponse>('/api/anki/note-cards', {
          method: 'POST',
          body: JSON.stringify(sent),
          signal: abort.signal,
        })
        if (captured !== epoch) return
        if (!validResult(result, sent)) throw new Error(i18n.t('noteCards:invalidResponse'))
        draft = { ...draft, result, writeId: newManualDraftId() }
        await persist(context, draft)
        receiptStored = true
        entries.set(key, state(draft))
        invalidateManualCardReads()
        notify()
      }, abort.signal)
    } catch (cause) {
      if (captured !== epoch) return
      if (!intentStored) {
        entries.set(key, {
          ...previous,
          phase: 'blocked',
          localSaved: false,
          error: cause instanceof Error ? cause.message : i18n.t('noteCards:storageFailure'),
        })
        notify()
        return
      }
      if (cause instanceof ApiError && cause.code === 'MANUAL_SOURCE_CHANGED') {
        draft = { ...draft, rejection: true, writeId: newManualDraftId() }
        try {
          await persist(context, draft)
        } catch {
          /* The original intent remains recoverable. */
        }
      }
      const next = state(draft)
      entries.set(key, {
        ...next,
        localSaved: draft.result ? receiptStored : intentStored,
        phase: draft.result ? 'saved' : draft.rejection ? 'blocked' : draft.sent ? 'unconfirmed' : 'blocked',
        error:
          cause instanceof ApiError && cause.status === 404
            ? i18n.t('noteCards:serverUpdate')
            : draft.rejection
              ? i18n.t('noteCards:sourceChanged')
              : cause instanceof Error
                ? cause.message
                : i18n.t('noteCards:unconfirmed'),
      })
      notify()
    } finally {
      window.clearTimeout(timer)
    }
  })
}
export function startAnotherNoteCardDraft(context: NoteCardContext) {
  return enqueue(context, async () => {
    const key = contextKey(context),
      previous = noteCardState(context)
    if (previous.phase !== 'saved' || !previous.localSaved || !previous.draft.result) return
    const draft = fresh(context)
    try {
      await persist(context, draft)
      entries.set(key, state(draft))
    } catch (cause) {
      entries.set(key, {
        ...previous,
        error: cause instanceof Error ? cause.message : i18n.t('noteCards:storageFailure'),
      })
    }
    notify()
  })
}
if (typeof window !== 'undefined') {
  const clear = () => {
    epoch += 1
    entries.clear()
    sessions.clear()
    notify()
  }
  window.addEventListener('unios:workspace-cleared', clear)
  window.addEventListener('unios:manual-workspace-changed', clear)
}
export function useNoteCardDraft(context: NoteCardContext) {
  const snapshot = useCallback(() => noteCardState(context), [context])
  const result = useSyncExternalStore(
    (listener) => {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    snapshot,
    snapshot,
  )
  useEffect(() => {
    void openNoteCardDraft(context)
  }, [context])
  return result
}

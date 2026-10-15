// SPDX-License-Identifier: AGPL-3.0-or-later

import { request } from '@/api'
import { clearNewNoteDraft, type NewNoteDraft } from '@/noteDraft'
import type { NoteDetail } from '@/types'
import { extractApiErrorMessage } from '@/hooks/useApiMutation'

export type SourceNoteSnapshot = {
  courseId: number
  resourceId: number | null
  title: string
  body: string
  draft: NewNoteDraft | null
}

/** Temporary recovery through UI remounts; only persisted proves a device copy. */
export type SourceWorkingDraft = {
  title: string
  body: string
  persisted: NewNoteDraft | null
  status: 'idle' | 'local' | 'restored' | 'error'
}

export type SourceNoteSaveState =
  | { phase: 'idle' }
  | { phase: 'pending'; snapshot: SourceNoteSnapshot }
  | { phase: 'saved'; snapshot: SourceNoteSnapshot; noteId: string; created: NoteDetail; localCleanupFailed: boolean }
  | { phase: 'error'; snapshot: SourceNoteSnapshot; message: string }

type Entry = {
  state: SourceNoteSaveState
  promise: Promise<SourceNoteSaveState>
  abort: AbortController
}

const IDLE: SourceNoteSaveState = { phase: 'idle' }
const entries = new Map<string, Entry>()
const workingDrafts = new Map<string, SourceWorkingDraft>()
const listeners = new Map<string, Set<() => void>>()
const SETTLED_LIMIT = 32
let epoch = 0

const scopeFor = (courseId: number, resourceId: number | null) => `${courseId}:${resourceId ?? 'none'}`

function notify(scope: string) {
  listeners.get(scope)?.forEach((listener) => listener())
}

export function sourceNoteSaveState(courseId: number, resourceId: number | null): SourceNoteSaveState {
  return entries.get(scopeFor(courseId, resourceId))?.state ?? IDLE
}

export function sourceWorkingDraft(courseId: number, resourceId: number | null): SourceWorkingDraft | null {
  return workingDrafts.get(scopeFor(courseId, resourceId)) ?? null
}

export function rememberSourceWorkingDraft(
  courseId: number,
  resourceId: number | null,
  draft: SourceWorkingDraft,
): void {
  const scope = scopeFor(courseId, resourceId)
  workingDrafts.delete(scope)
  workingDrafts.set(scope, draft)
  for (const [key, value] of workingDrafts) {
    if (workingDrafts.size <= SETTLED_LIMIT) break
    // Unpersisted text must not be discarded to enforce a cache-size budget.
    const phase = entries.get(key)?.state.phase
    if (value.status !== 'error' && !listeners.get(key)?.size && phase !== 'pending' && phase !== 'saved')
      workingDrafts.delete(key)
  }
}

/** Release only the exact composition already transferred to its existing UUID. */
export function clearSourceWorkingDraft(
  courseId: number,
  resourceId: number | null,
  expected: SourceWorkingDraft,
): void {
  const scope = scopeFor(courseId, resourceId)
  const current = workingDrafts.get(scope)
  if (
    current?.title === expected.title &&
    current.body === expected.body &&
    current.persisted?.writeId === expected.persisted?.writeId
  )
    workingDrafts.delete(scope)
}

export function subscribeSourceNoteSave(courseId: number, resourceId: number | null, listener: () => void): () => void {
  const scope = scopeFor(courseId, resourceId)
  const group = listeners.get(scope) ?? new Set<() => void>()
  group.add(listener)
  listeners.set(scope, group)
  return () => {
    group.delete(listener)
    if (!group.size) listeners.delete(scope)
  }
}

/** Pairing/reset invalidates every completion before it can clear device drafts. */
export function resetSourceNoteSaves(): void {
  epoch += 1
  const previous = [...entries.values()]
  entries.clear()
  workingDrafts.clear()
  previous.forEach((entry) => entry.abort.abort())
  listeners.forEach((group) => group.forEach((listener) => listener()))
}

/** Only the explicit new-document action ends a settled source create. */
export function beginNewSourceNote(courseId: number, resourceId: number | null): void {
  const scope = scopeFor(courseId, resourceId)
  if (entries.get(scope)?.state.phase === 'pending') return
  // Explicit free-note navigation must not discard text still awaiting a safe
  // transfer to the acknowledged document after a device-storage failure.
  if (resourceId === null && workingDrafts.has(scope)) return
  entries.delete(scope)
  workingDrafts.delete(scope)
  notify(scope)
}

/** An explicit creation command may release only fully transferred free notes. */
export function beginNewFreeNote(courseId?: number): void {
  for (const entry of entries.values()) {
    if (
      entry.state.phase === 'saved' &&
      entry.state.snapshot.resourceId === null &&
      (courseId === undefined || entry.state.snapshot.courseId === courseId)
    )
      beginNewSourceNote(entry.state.snapshot.courseId, null)
  }
}

if (typeof window !== 'undefined') window.addEventListener('unios:workspace-cleared', resetSourceNoteSaves)

function trimSettled() {
  const settled = [...entries].filter(([, entry]) => entry.state.phase !== 'pending')
  for (const [scope] of settled.slice(0, Math.max(0, settled.length - SETTLED_LIMIT))) {
    // Mounted editors retain their visible error or acknowledgement.
    // Any later composition still awaiting transfer needs the confirmed UUID,
    // even when its text has a successful device copy.
    if (!listeners.get(scope)?.size && !workingDrafts.has(scope)) entries.delete(scope)
  }
}

/**
 * One in-flight create per course/source (including free notes) in this window.
 * Empty bodies are valid explicit creations; merely remembering a working
 * draft or opening a reader never calls this function.
 * Pending promises and status remain in RAM; they are never recovery copies or
 * backend idempotency guarantees after reload/ambiguous network failures.
 */
export function saveSourceNote(snapshot: SourceNoteSnapshot): Promise<SourceNoteSaveState> {
  const scope = scopeFor(snapshot.courseId, snapshot.resourceId)
  const previous = entries.get(scope)
  if (previous?.state.phase === 'pending') return previous.promise
  // Later text belongs to the acknowledged UUID. Only an explicit new-document
  // action may replace this receipt, never changed text or a failed cleanup.
  if (previous?.state.phase === 'saved') return previous.promise

  const startedEpoch = epoch
  const abort = new AbortController()
  let settle!: (result: SourceNoteSaveState) => void
  const promise = new Promise<SourceNoteSaveState>((resolve) => {
    settle = resolve
  })
  const entry: Entry = { state: { phase: 'pending', snapshot }, promise, abort }
  if (!workingDrafts.has(scope))
    rememberSourceWorkingDraft(snapshot.courseId, snapshot.resourceId, {
      title: snapshot.title,
      body: snapshot.body,
      persisted: snapshot.draft,
      status: snapshot.draft?.title === snapshot.title && snapshot.draft.body === snapshot.body ? 'local' : 'error',
    })
  entries.delete(scope)
  entries.set(scope, entry)
  notify(scope)
  void (async () => {
    let result: SourceNoteSaveState
    try {
      const created = await request<NoteDetail>('/api/notes', {
        method: 'POST',
        signal: abort.signal,
        body: JSON.stringify({
          course_id: snapshot.courseId,
          resource_id: snapshot.resourceId,
          title: snapshot.title.trim(),
          body: snapshot.body,
        }),
      })
      if (epoch !== startedEpoch || entries.get(scope) !== entry) {
        settle(IDLE)
        return
      }
      let localCleanupFailed = false
      try {
        if (snapshot.draft) clearNewNoteDraft(snapshot.draft)
      } catch {
        // Server acknowledgement stays successful; a failed local cleanup does
        // not permit another identical create or claim device persistence.
        localCleanupFailed = true
      }
      result = { phase: 'saved', snapshot, noteId: created.note.id, created, localCleanupFailed }
      const working = workingDrafts.get(scope)
      if (
        working?.title === snapshot.title &&
        working.body === snapshot.body &&
        working.persisted?.writeId === snapshot.draft?.writeId
      ) {
        if (localCleanupFailed) workingDrafts.set(scope, { ...working, status: 'error' })
        else workingDrafts.delete(scope)
      }
    } catch (cause) {
      if (epoch !== startedEpoch || entries.get(scope) !== entry) {
        settle(IDLE)
        return
      }
      result = { phase: 'error', snapshot, message: extractApiErrorMessage(cause) }
    }
    entry.state = result
    notify(scope)
    settle(result)
    trimSettled()
  })()
  return promise
}

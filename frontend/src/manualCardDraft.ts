// SPDX-License-Identifier: AGPL-3.0-or-later
import { useCallback, useEffect, useSyncExternalStore } from 'react'
import { newManualDraftId } from '@/lib/manualDraftId'
import { request } from '@/api'
import { queryClient } from '@/offlineCache'
import { invalidateStudyReads } from '@/studyQueries'
import i18n from '@/i18n'
import type { Material } from '@/types'
import { manualCardContext, type ManualCardContext, type ManualCardInput, type ManualCardResponse } from '@/manualCardTypes'
import { sameManualPayload, validManualResult, type DraftBranch, type DraftEnvelope, type DraftWorkspace,
  type ManualCardDraft } from '@/manualDraftTypes'
import { assertManualWorkspace, mutateManualEnvelope, readLegacyManualDrafts, readManualEnvelope,
  readManualWorkspace, rotateManualWorkspace, readManualRecoveryPreview } from '@/lib/manualDraftPersistence'
import { manualWriterInstanceId, subscribeManualChanges, withManualBinding } from '@/lib/manualDraftCoordination'
import { extractApiErrorMessage } from '@/hooks/useApiMutation'
export type { ManualCardDraft } from '@/manualDraftTypes'

export type ManualDraftState = {
  draft: ManualCardDraft
  phase: 'loading' | 'unavailable' | 'editing' | 'conflict' | 'sending' | 'unconfirmed' | 'sourceChanged' | 'checkingSource' | 'saved'
  localSaved: boolean; storageError: boolean; error: string | null
  reviewedSource?: ManualCardContext | null
  recoveryCopies: DraftBranch[]
  unresolvedCount: number
  currentDraft?: ManualCardDraft
}
type Session = { workspace: DraftWorkspace; envelope: DraftEnvelope; expected: string }
const entries = new Map<string, ManualDraftState>()
const sessions = new Map<string, Session>()
const listeners = new Set<() => void>()
const loading = new Map<string, Promise<void>>()
const writes = new Map<string, Promise<void>>()
const pending = new Map<string, { promise: Promise<void>; abort: AbortController }>()
const sourceReads = new Map<string, AbortController>()
let epoch = 0
let resetting: Promise<void> = Promise.resolve()
let resetFailed = false
const keyFor = (context: ManualCardContext) => `${context.version_id}:${context.annotation_id}`
const notify = () => listeners.forEach(listener => listener())
const changed = (draft: ManualCardDraft) => ({ ...draft, writeId: newManualDraftId(), updatedAt: Math.max(Date.now(), draft.updatedAt + 1) })
const sameText = (a: ManualCardDraft, b: ManualCardDraft) => a.front === b.front && a.back === b.back && a.topic === b.topic &&
  a.context.page === b.context.page && a.context.annotation_revision === b.context.annotation_revision && a.context.quote === b.context.quote
function freshDraft(context: ManualCardContext): ManualCardDraft {
  return { context: { ...context }, mutationId: newManualDraftId(), writeId: newManualDraftId(), updatedAt: Date.now(),
    front: context.comment, back: context.quote,
    topic: context.resource_name.replace(/\.[^.]+$/, '').slice(0, 200).trim() || context.course_name.slice(0, 200), sent: null, result: null }
}
function phase(draft: ManualCardDraft): ManualDraftState['phase'] {
  return draft.result ? 'saved' : draft.rejection ? 'sourceChanged' : draft.sent ? 'unconfirmed' : 'editing'
}
function copies(envelope: DraftEnvelope) {
  return Object.values(envelope.branches).map(copy => {
    const intent = copy.draft.sent && envelope.intents[copy.draft.mutationId]
    return intent ? { ...copy, draft: { ...copy.draft, result: intent.result, rejection: intent.result ? undefined : intent.rejection } } : copy
  }).filter(branch => !sameText(branch.draft, envelope.head.draft) ||
    (branch.draft.mutationId !== envelope.head.draft.mutationId && branch.draft.sent && !envelope.intents[branch.draft.mutationId]?.result))
}
const unresolved = (envelope: DraftEnvelope) => Object.values(envelope.intents).filter(intent => !intent.result && !intent.rejection).length
function stateFor(envelope: DraftEnvelope): ManualDraftState {
  return { draft: envelope.head.draft, phase: phase(envelope.head.draft), localSaved: true, storageError: false,
    error: null, recoveryCopies: copies(envelope), unresolvedCount: unresolved(envelope) }
}
function head(envelope: DraftEnvelope, draft: ManualCardDraft): DraftEnvelope {
  return { ...envelope, head: { revision: envelope.head.revision + 1, writerInstanceId: manualWriterInstanceId, draft } }
}
function branch(envelope: DraftEnvelope, draft: ManualCardDraft, id = manualWriterInstanceId): DraftEnvelope {
  return { ...envelope, branches: { ...envelope.branches, [id]: { id, writerInstanceId: manualWriterInstanceId, draft } } }
}
function install(key: string, envelope: DraftEnvelope, retainConflict = false) {
  const session = sessions.get(key)!
  if (envelope.revision < session.envelope.revision) return
  const previous = entries.get(key)
  if (!retainConflict && previous?.storageError && !previous.localSaved && !previous.draft.sent &&
      previous.phase !== 'loading' && !sameText(previous.draft, envelope.head.draft)) {
    sessions.set(key, { ...session, envelope })
    entries.set(key, { ...previous, phase: session.expected === envelope.head.draft.writeId ? 'editing' : 'conflict',
      recoveryCopies: copies(envelope), unresolvedCount: unresolved(envelope), currentDraft: envelope.head.draft })
    notify(); return
  }
  sessions.set(key, { ...session, envelope, expected: retainConflict ? session.expected : envelope.head.draft.writeId })
  entries.set(key, retainConflict && previous ? { ...previous, phase: 'conflict', localSaved: true,
    storageError: false, recoveryCopies: copies(envelope), unresolvedCount: unresolved(envelope), currentDraft: envelope.head.draft } : stateFor(envelope))
  notify()
}
function fail(key: string, cause?: unknown) {
  const state = entries.get(key)
  if (!state) return
  entries.set(key, { ...state, storageError: true, localSaved: false,
    ...(cause instanceof Error && cause.message === 'MANUAL_WORKSPACE_CHANGED' ? { phase: 'unavailable' as const } : {}) })
  notify()
}
export function subscribeManualDraft(listener: () => void) { listeners.add(listener); return () => { listeners.delete(listener) } }
export function manualDraftState(context: ManualCardContext): ManualDraftState {
  const key = keyFor(context)
  if (!entries.has(key)) entries.set(key, { draft: freshDraft(context), phase: 'loading', localSaved: false,
    storageError: false, error: null, recoveryCopies: [], unresolvedCount: 0 })
  return entries.get(key)!
}
export async function openManualDraft(context: ManualCardContext): Promise<void> {
  const key = keyFor(context)
  if (manualDraftState(context).phase !== 'loading') return
  if (loading.has(key)) return loading.get(key)
  const captured = epoch
  const memory = manualDraftState(context)
  const recoverOwn = sessions.has(key) && memory.storageError && !memory.localSaved && !memory.draft.sent
  const operation = (async () => {
    try {
      await resetting
      const workspace = await readManualWorkspace()
      const legacy = await readLegacyManualDrafts(workspace, context)
      const envelope = await mutateManualEnvelope(workspace, context, existing => {
        if (existing) return recoverOwn && !sameText(memory.draft, existing.head.draft) ? branch(existing, memory.draft) : existing
        const ordered = [...legacy].sort((a, b) => Number(!!b.sent && !b.result && !b.rejection) - Number(!!a.sent && !a.result && !a.rejection) ||
          Number(!!b.sent) - Number(!!a.sent) || b.updatedAt - a.updatedAt)
        const draft = ordered[0] ?? entries.get(key)!.draft
        const envelope: DraftEnvelope = { schema: 2, revision: 1, head: { revision: 1, writerInstanceId: manualWriterInstanceId, draft }, branches: {}, intents: {} }
        for (const candidate of ordered) {
          const id = newManualDraftId()
          envelope.branches[id] = { id, writerInstanceId: manualWriterInstanceId, draft: candidate }
          if (candidate.sent) {
            const prior = envelope.intents[candidate.mutationId]
            if (prior && !sameManualPayload(prior.payload, candidate.sent)) throw new Error('MANUAL_MUTATION_CONFLICT')
            envelope.intents[candidate.mutationId] = { payload: candidate.sent,
              result: prior?.result?.status === 'pushed' ? prior.result : candidate.result, rejection: candidate.rejection }
          }
        }
        if (draft.sent) {
          const intent = envelope.intents[draft.mutationId]
          envelope.head.draft = { ...draft, result: intent.result, rejection: intent.result ? undefined : intent.rejection }
        }
        return envelope
      })
      if (captured !== epoch) return
      sessions.set(key, { workspace, envelope, expected: envelope.head.draft.writeId })
      install(key, envelope, recoverOwn && !sameText(memory.draft, envelope.head.draft))
    } catch (cause) {
      if (captured !== epoch) return
      entries.set(key, { ...manualDraftState(context), phase: 'unavailable', localSaved: false, storageError: true,
        recoveryCopies: readManualRecoveryPreview(context),
        error: cause instanceof Error && cause.message === 'MANUAL_BINDING_UNCONFIRMED' ? i18n.t('study:manual.bindingUnconfirmed') : null }); notify()
    }
  })().finally(() => { if (captured === epoch) loading.delete(key) })
  loading.set(key, operation)
  return operation
}
export async function updateManualDraft(context: ManualCardContext, fields: Partial<Pick<ManualCardDraft, 'front' | 'back' | 'topic'>>): Promise<void> {
  const key = keyFor(context), state = manualDraftState(context), session = sessions.get(key)
  if (state.phase !== 'editing' || state.draft.sent || state.unresolvedCount > 0 || !session) return
  const draft = changed({ ...state.draft, ...fields }), captured = epoch
  entries.set(key, { ...state, draft, localSaved: false, error: null }); notify()
  const operation = (writes.get(key) ?? Promise.resolve()).then(async () => {
    if (captured !== epoch) return
    try {
      const currentSession = sessions.get(key)!
      let conflict = false
      const envelope = await mutateManualEnvelope(session.workspace, context, current => {
        if (!current) throw new Error('MANUAL_STORAGE_INVALID')
        conflict = entries.get(key)?.phase === 'conflict' || current.head.draft.writeId !== currentSession.expected || !!current.head.draft.sent
        const preserved = branch(current, draft)
        return conflict ? preserved : head(preserved, draft)
      })
      if (captured !== epoch) return
      const latest = entries.get(key)!
      sessions.set(key, { workspace: session.workspace, envelope,
        expected: conflict ? currentSession.expected : envelope.head.draft.writeId })
      if (latest.draft.writeId === draft.writeId || conflict) {
        entries.set(key, { ...latest, phase: conflict ? 'conflict' : 'editing', localSaved: latest.draft.writeId === draft.writeId,
          storageError: false, recoveryCopies: copies(envelope), unresolvedCount: unresolved(envelope), currentDraft: conflict ? envelope.head.draft : undefined }); notify()
      }
    } catch (cause) { if (captured === epoch) fail(key, cause) }
  }).finally(() => { if (writes.get(key) === operation) writes.delete(key) })
  writes.set(key, operation)
  return operation
}
export function invalidateManualCardReads() {
  void invalidateStudyReads(queryClient)
  void queryClient.invalidateQueries({ predicate: query => query.queryKey[0] === 'api' &&
    typeof query.queryKey[1] === 'string' && /^\/api\/anki\/(?:queue|study\/cards|manual-cards)(?:\/|\?|$)/.test(query.queryKey[1]) })
}
async function acknowledge(key: string, context: ManualCardContext, mutationId: string, result: ManualCardResponse) {
  const session = sessions.get(key)!
  return mutateManualEnvelope(session.workspace, context, current => {
    if (!current || !current.intents[mutationId]) throw new Error('MANUAL_STORAGE_INVALID')
    const intent = current.intents[mutationId]
    const confirmed = intent.result?.status === 'pushed' ? intent.result : result
    let envelope = { ...current, intents: { ...current.intents, [mutationId]: { ...intent, result: confirmed } } }
    if (current.head.draft.mutationId === mutationId) envelope = head(envelope, changed({ ...current.head.draft, result: confirmed }))
    return envelope
  })
}
/** A bounded unresolved request releases the binding lock; its durable intent remains exact. */
async function boundedPost(payload: ManualCardInput, abort: AbortController) {
  let timer!: ReturnType<typeof setTimeout>
  let onAbort!: () => void
  const cancelled = new Promise<never>((_, reject) => {
    onAbort = () => reject(new DOMException('Aborted', 'AbortError'))
    abort.signal.addEventListener('abort', onAbort, { once: true })
  })
  const timeout = new Promise<never>((_, reject) => { timer = setTimeout(() => {
    reject(new Error(i18n.t('study:manual.requestTimeout'))); abort.abort()
  }, 30_000) })
  try { return await Promise.race([request<ManualCardResponse>('/api/anki/manual-cards', {
    method: 'POST', body: JSON.stringify(payload), signal: abort.signal,
  }), timeout, cancelled]) } finally { clearTimeout(timer); abort.signal.removeEventListener('abort', onAbort) }
}
export function saveManualDraft(context: ManualCardContext): Promise<void> {
  const key = keyFor(context)
  if (pending.has(key)) return pending.get(key)!.promise
  const state = manualDraftState(context), session = sessions.get(key)
  if (!session || !['editing', 'unconfirmed'].includes(state.phase) || state.draft.result || !state.draft.front.trim() ||
      !state.draft.back.trim() || !state.draft.topic.trim() || state.draft.front.length > 4000 || state.draft.back.length > 8000 || state.draft.topic.length > 200) return Promise.resolve()
  const captured = epoch, abort = new AbortController(), retry = state.phase === 'unconfirmed'
  entries.set(key, { ...state, phase: 'sending', error: null }); notify()
  const operation = (async () => {
    await writes.get(key)
    if (captured !== epoch) return
    try {
      await withManualBinding(async () => {
        if (captured !== epoch || abort.signal.aborted) return
        await assertManualWorkspace(session.workspace)
        let send: ManualCardInput | null = null
        let conflict = false
        const envelope = await mutateManualEnvelope(session.workspace, context, current => {
          if (!current) throw new Error('MANUAL_STORAGE_INVALID')
          const latest = entries.get(key)!.draft, currentDraft = current.head.draft
          if (retry) {
            if (currentDraft.mutationId === latest.mutationId && currentDraft.sent && !currentDraft.result && !currentDraft.rejection)
              send = current.intents[currentDraft.mutationId].payload
            return current
          }
          if (currentDraft.writeId !== sessions.get(key)!.expected || currentDraft.sent) {
            conflict = !sameText(latest, currentDraft)
            return conflict ? branch(current, latest) : current
          }
          if (unresolved(current) > 0) return current
          const payload: ManualCardInput = { mutation_id: latest.mutationId, front: latest.front, back: latest.back, topic: latest.topic,
            source: { version_id: latest.context.version_id, annotation_id: latest.context.annotation_id,
              expected_revision: latest.context.annotation_revision, page: latest.context.page } }
          send = payload
          return head({ ...current, intents: { ...current.intents, [payload.mutation_id]: { payload, result: null } } }, changed({ ...latest, sent: payload }))
        })
        if (captured !== epoch) return
        install(key, envelope, conflict)
        if (!send) return
        const payload: ManualCardInput = send
        entries.set(key, { ...entries.get(key)!, phase: 'sending' }); notify()
        await assertManualWorkspace(session.workspace)
        if (captured !== epoch || abort.signal.aborted) return
        try {
          const result = await boundedPost(payload, abort)
          if (captured !== epoch || abort.signal.aborted) return
          await assertManualWorkspace(session.workspace)
          if (!validManualResult(result)) throw new Error(i18n.t('study:manual.invalidResponse'))
          try {
            const confirmed = await acknowledge(key, context, payload.mutation_id, result)
            if (captured === epoch) install(key, confirmed)
          } catch (cause) {
            if (captured !== epoch) return
            await assertManualWorkspace(session.workspace)
            const latest = entries.get(key)!
            if (latest.draft.mutationId === payload.mutation_id) entries.set(key, { ...latest,
              draft: { ...latest.draft, result }, phase: 'saved', storageError: true, localSaved: false })
            else fail(key, cause)
            notify()
          }
          invalidateManualCardReads()
        } catch (cause) {
          if (captured !== epoch) return
          const sourceChanged = cause instanceof Error && 'status' in cause && cause.status === 409 &&
            'code' in cause && cause.code === 'MANUAL_SOURCE_CHANGED'
          if (sourceChanged) {
            const rejected = await mutateManualEnvelope(session.workspace, context, current => {
              if (!current) throw new Error('MANUAL_STORAGE_INVALID')
              const intent = current.intents[payload.mutation_id]
              if (!intent || intent.result) return current
              let envelope = { ...current, intents: { ...current.intents, [payload.mutation_id]: { ...intent, rejection: 'MANUAL_SOURCE_CHANGED' as const } } }
              if (current.head.draft.mutationId === payload.mutation_id) envelope = head(envelope, changed({ ...current.head.draft, rejection: 'MANUAL_SOURCE_CHANGED' }))
              return envelope
            })
            if (captured === epoch) install(key, rejected)
          } else {
            const current = await readManualEnvelope(session.workspace, context)
            if (captured === epoch) install(key, current)
          }
          if (captured === epoch && entries.get(key)?.draft.mutationId === payload.mutation_id) {
            entries.set(key, { ...entries.get(key)!, error: extractApiErrorMessage(cause) }); notify()
          }
        }
      }, abort.signal)
    } catch (cause) {
      if (captured !== epoch) return
      const latest = entries.get(key)!
      entries.set(key, { ...latest, phase: phase(latest.draft), localSaved: false, storageError: true,
        error: cause instanceof Error && cause.message === 'MANUAL_COORDINATION_UNAVAILABLE' ? i18n.t('study:manual.coordinationUnavailable') : null }); notify()
    }
  })().finally(() => { if (pending.get(key)?.abort === abort) pending.delete(key) })
  pending.set(key, { promise: operation, abort })
  return operation
}
export async function checkManualDraftSource(context: ManualCardContext): Promise<void> {
  const key = keyFor(context), state = manualDraftState(context), session = sessions.get(key)
  if (!session || state.phase !== 'sourceChanged' || !state.draft.rejection) return
  const captured = epoch, abort = new AbortController()
  sourceReads.get(key)?.abort(); sourceReads.set(key, abort)
  entries.set(key, { ...state, phase: 'checkingSource', reviewedSource: null, error: null }); notify()
  try {
    const material = await request<Material>(`/api/material/${state.draft.context.version_id}`, { signal: abort.signal })
    await assertManualWorkspace(session.workspace)
    if (captured !== epoch || abort.signal.aborted || entries.get(key)?.draft.writeId !== state.draft.writeId) return
    const annotation = material.annotations.find(item => item.id === state.draft.context.annotation_id)
    const reviewedSource = annotation && material.version_id === state.draft.context.version_id && material.resource_id === state.draft.context.resource_id
      ? manualCardContext(material, annotation) : null
    entries.set(key, { ...state, reviewedSource, error: reviewedSource ? null : i18n.t('study:manual.sourceUnavailable') })
  } catch (cause) {
    if (captured === epoch && !abort.signal.aborted) entries.set(key, { ...state, reviewedSource: null,
      error: extractApiErrorMessage(cause) })
  } finally { if (sourceReads.get(key) === abort) { sourceReads.delete(key); notify() } }
}
async function replaceDraft(context: ManualCardContext, draft: ManualCardDraft) {
  const key = keyFor(context), session = sessions.get(key)!, previous = manualDraftState(context), captured = epoch
  entries.set(key, { ...previous, phase: 'sending' }); notify()
  try {
    let conflict = false
    const envelope = await mutateManualEnvelope(session.workspace, context, current => {
      if (!current) throw new Error('MANUAL_STORAGE_INVALID')
      conflict = current.head.draft.writeId !== session.expected
      if (conflict) return branch(current, previous.draft)
      return head(branch(current, current.head.draft, newManualDraftId()), draft)
    })
    if (captured === epoch) install(key, envelope, conflict)
  } catch (cause) { if (captured === epoch) { entries.set(key, previous); fail(key, cause) } }
}
export async function acceptManualDraftSource(context: ManualCardContext) {
  const state = manualDraftState(context)
  if (state.phase !== 'sourceChanged' || !state.draft.rejection || !state.reviewedSource || state.unresolvedCount > 0) return
  await replaceDraft(context, changed({ ...state.draft, context: { ...state.reviewedSource }, mutationId: newManualDraftId(),
    sent: null, result: null, rejection: undefined }))
}
export async function refreshManualDraftResult(context: ManualCardContext) {
  const key = keyFor(context), state = manualDraftState(context), session = sessions.get(key), captured = epoch
  if (!session || state.phase !== 'saved' || !state.draft.result) return
  try {
    const result = await request<ManualCardResponse>(`/api/anki/manual-cards/${state.draft.result.queue_id}`)
    if (captured !== epoch || !validManualResult(result)) return
    await assertManualWorkspace(session.workspace)
    const envelope = await acknowledge(key, context, state.draft.mutationId, result)
    if (captured === epoch && !writes.has(key)) install(key, envelope, entries.get(key)?.phase === 'conflict')
  } catch { /* A confirmed creation remains true when status refresh is unavailable. */ }
}
export async function startAnotherManualDraft(context: ManualCardContext) {
  const state = manualDraftState(context)
  if (pending.has(keyFor(context)) || state.phase !== 'saved' || !state.localSaved || state.unresolvedCount > 0) return
  await replaceDraft(context, freshDraft(context))
}
export async function openCurrentManualDraft(context: ManualCardContext) {
  const key = keyFor(context), session = sessions.get(key), captured = epoch
  if (!session || writes.has(key) || !manualDraftState(context).localSaved) return
  try {
    const envelope = await readManualEnvelope(session.workspace, context)
    if (captured === epoch) install(key, envelope)
  } catch (cause) { if (captured === epoch) fail(key, cause) }
}
export async function retryManualConflictCopy(context: ManualCardContext) {
  const key = keyFor(context), session = sessions.get(key), state = manualDraftState(context), captured = epoch
  if (!session || state.phase !== 'conflict' || state.localSaved || writes.has(key)) return
  try {
    const envelope = await mutateManualEnvelope(session.workspace, context, current => {
      if (!current) throw new Error('MANUAL_STORAGE_INVALID')
      return branch(current, state.draft)
    })
    if (captured === epoch) install(key, envelope, true)
  } catch (cause) { if (captured === epoch) fail(key, cause) }
}
export async function adoptManualDraftCopy(context: ManualCardContext, branchId: string) {
  const key = keyFor(context), session = sessions.get(key), captured = epoch
  if (!session || writes.has(key) || pending.has(key)) return
  try {
    const envelope = await mutateManualEnvelope(session.workspace, context, current => {
      if (!current) throw new Error('MANUAL_STORAGE_INVALID')
      const candidate = current.branches[branchId]
      if (!candidate || unresolved(current) > 0 || (current.head.draft.sent && !current.head.draft.result)) return current
      if (candidate.draft.writeId !== session.envelope.branches[branchId]?.draft.writeId ||
          current.head.draft.writeId !== session.envelope.head.draft.writeId) return current
      const draft = changed({ ...candidate.draft, mutationId: newManualDraftId(), sent: null, result: null, rejection: undefined })
      return head(branch(current, current.head.draft, newManualDraftId()), draft)
    })
    if (captured === epoch) install(key, envelope)
  } catch (cause) { if (captured === epoch) fail(key, cause) }
}
/** Legacy unresolved copies reopen only their immutable, already reserved UUID. */
export async function openManualSentCopy(context: ManualCardContext, branchId: string) {
  const key = keyFor(context), session = sessions.get(key), captured = epoch
  if (!session || writes.has(key) || pending.has(key)) return
  try {
    const envelope = await mutateManualEnvelope(session.workspace, context, current => {
      if (!current) throw new Error('MANUAL_STORAGE_INVALID')
      const copy = current.branches[branchId], intent = copy && current.intents[copy.draft.mutationId]
      if (!copy?.draft.sent || !intent || intent.result || copy.draft.writeId !== session.envelope.branches[branchId]?.draft.writeId ||
          current.head.draft.writeId !== session.envelope.head.draft.writeId) return current
      return head(branch(current, current.head.draft, newManualDraftId()), changed({ ...copy.draft, sent: intent.payload,
        result: null, rejection: intent.rejection }))
    })
    if (captured === epoch) install(key, envelope)
  } catch (cause) { if (captured === epoch) fail(key, cause) }
}
export function retryManualDraftRecovery(context: ManualCardContext) {
  if (manualDraftState(context).phase !== 'unavailable') return
  if (resetFailed) beginRotation()
  entries.set(keyFor(context), { ...manualDraftState(context), phase: 'loading' }); notify(); void openManualDraft(context)
}
function clearMemory() {
  epoch += 1
  pending.forEach(entry => entry.abort.abort()); sourceReads.forEach(abort => abort.abort())
  entries.clear(); sessions.clear(); loading.clear(); writes.clear(); pending.clear(); sourceReads.clear(); notify()
}
function remoteReset() {
  clearMemory()
  window.dispatchEvent(new Event('unios:manual-workspace-changed'))
}
export function resetManualDraftWorkspace() {
  clearMemory()
  beginRotation()
}
function beginRotation() {
  resetFailed = false
  resetting = resetting.catch(() => {}).then(async () => { await rotateManualWorkspace() }).catch(cause => {
    resetFailed = true; throw cause
  })
  void resetting.catch(() => {})
}
export function settleManualWorkspaceReset() { return resetting }
if (typeof window !== 'undefined') window.addEventListener('unios:workspace-cleared', resetManualDraftWorkspace)
subscribeManualChanges(() => {
  for (const [key, session] of sessions) {
    if (writes.has(key) || loading.has(key) || pending.has(key)) continue
    const captured = epoch
    void readManualEnvelope(session.workspace, session.envelope.head.draft.context).then(envelope => {
      if (captured !== epoch || writes.has(key) || pending.has(key)) return
      const state = entries.get(key)!
      if (state.storageError) {
        if (state.phase === 'unavailable' && state.draft.writeId === envelope.head.draft.writeId) install(key, envelope)
        return
      }
      if (state.phase === 'checkingSource') return
      if (envelope.revision > session.envelope.revision)
        install(key, envelope, state.phase === 'conflict')
    }).catch(cause => {
      if (captured !== epoch) return
      if (cause instanceof Error && cause.message === 'MANUAL_WORKSPACE_CHANGED') remoteReset()
      else { fail(key, cause); entries.set(key, { ...entries.get(key)!, phase: 'unavailable',
        error: cause instanceof Error && cause.message === 'MANUAL_BINDING_UNCONFIRMED' ? i18n.t('study:manual.bindingUnconfirmed') : null }); notify() }
    })
  }
})
export function useManualCardDraft(context: ManualCardContext) {
  const snapshot = useCallback(() => manualDraftState(context), [context])
  const state = useSyncExternalStore(subscribeManualDraft, snapshot, snapshot)
  useEffect(() => { void openManualDraft(context) }, [context, state.phase])
  return state
}

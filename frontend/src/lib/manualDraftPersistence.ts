// SPDX-License-Identifier: AGPL-3.0-or-later
import { createStore, get, update } from 'idb-keyval'
import { newManualDraftId } from './manualDraftId'
import type { ManualCardContext } from '@/manualCardTypes'
import { validDraftEnvelope, validDraftWorkspace, validManualDraft, sameManualPayload,
  type DraftBranch, type DraftEnvelope, type DraftWorkspace, type ManualCardDraft } from '@/manualDraftTypes'
import { manualWorkspaceMarker, withManualStorageLock, publishManualChange, manualWebLocksAvailable } from './manualDraftCoordination'

const store = typeof indexedDB === 'undefined' ? null : createStore('marc-uni-os-manual-cards', 'drafts')
const manifestKey = 'workspace:v2'
export function manualEnvelopeKey(workspace: DraftWorkspace, context: ManualCardContext) {
  return `unios:manual-card-draft:v2:${workspace.id}:${context.version_id}:${context.annotation_id}`
}
function localManifest(): DraftWorkspace | null {
  const raw = localStorage.getItem(manualWorkspaceMarker)
  if (raw === null) return null
  const parsed: unknown = JSON.parse(raw)
  if (!validDraftWorkspace(parsed)) throw new Error('MANUAL_STORAGE_INVALID')
  return parsed
}
function announceWorkspace(workspace: DraftWorkspace) {
  // A durable declaration precedes any draft; unreadable IDB never selects an older LS copy.
  const value = JSON.stringify(workspace)
  if (localStorage.getItem(manualWorkspaceMarker) !== value) localStorage.setItem(manualWorkspaceMarker, value)
}
export async function readManualWorkspace(allowChanging = false): Promise<DraftWorkspace> {
  const marker = localManifest()
  const checked = (workspace: DraftWorkspace) => {
    if (!allowChanging && workspace.binding === 'changing') throw new Error('MANUAL_BINDING_UNCONFIRMED')
    return workspace
  }
  if (marker?.backend === 'local') return checked(marker)
  if (!store) {
    if (marker) throw new Error('MANUAL_STORAGE_UNAVAILABLE')
    return withManualStorageLock('unios:manual-cards:workspace:v2', async () => {
      const current = localManifest()
      if (current) return checked(current)
      // Legacy installations may have a newer sent UUID only in IDB.
      if (localStorage.getItem('unios:manual-card-workspace:v1')) throw new Error('MANUAL_STORAGE_UNAVAILABLE')
      const created: DraftWorkspace = { schema: 2, id: newManualDraftId(), backend: 'local', generation: 1, binding: 'ready' }
      announceWorkspace(created)
      return created
    })
  }
  const existing: unknown = await get(manifestKey, store)
  if (existing !== undefined && !validDraftWorkspace(existing)) throw new Error('MANUAL_STORAGE_INVALID')
  if (existing) { announceWorkspace(existing); return checked(existing) }
  if (marker) throw new Error('MANUAL_STORAGE_UNAVAILABLE')
  const initialize = async () => {
    const freshMarker = localManifest()
    if (freshMarker?.backend === 'local') return checked(freshMarker)
    let created!: DraftWorkspace
    const legacyNamespace = localStorage.getItem('unios:manual-card-workspace:v1') || undefined
    await update<DraftWorkspace>(manifestKey, previous => {
      if (previous && !validDraftWorkspace(previous)) throw new Error('MANUAL_STORAGE_INVALID')
      created = previous ?? { schema: 2, id: newManualDraftId(), backend: 'idb', generation: 1, binding: 'ready', legacyNamespace }
      return created
    }, store)
    announceWorkspace(created)
    return checked(created)
  }
  return manualWebLocksAvailable() ? withManualStorageLock('unios:manual-cards:workspace:v2', initialize) : initialize()
}
export async function rotateManualWorkspace(): Promise<DraftWorkspace> {
  const before = await readManualWorkspace(true)
  let next!: DraftWorkspace
  if (before.backend === 'local') await withManualStorageLock('unios:manual-cards:workspace:v2', async () => {
    const current = localManifest()
    if (!current) throw new Error('MANUAL_STORAGE_UNAVAILABLE')
    next = { schema: 2, id: newManualDraftId(), backend: 'local', generation: current.generation + 1, binding: 'ready' }
    announceWorkspace(next)
  })
  else {
    if (!store) throw new Error('MANUAL_STORAGE_UNAVAILABLE')
    await update<DraftWorkspace>(manifestKey, previous => {
      if (!validDraftWorkspace(previous)) throw new Error('MANUAL_STORAGE_INVALID')
      next = { schema: 2, id: newManualDraftId(), backend: 'idb', generation: previous.generation + 1, binding: 'ready' }
      return next
    }, store)
    announceWorkspace(next)
  }
  publishManualChange()
  return next
}
/** Commit before the native pairing request, including its ambiguous-response failure cut. */
export async function prepareManualBindingChange() {
  const workspace = await readManualWorkspace(true)
  let changing!: DraftWorkspace
  if (workspace.backend === 'local') await withManualStorageLock('unios:manual-cards:workspace:v2', async () => {
    const current = localManifest()
    if (!current) throw new Error('MANUAL_STORAGE_UNAVAILABLE')
    changing = { ...current, binding: 'changing', generation: current.generation + 1 }
    announceWorkspace(changing)
  })
  else {
    if (!store) throw new Error('MANUAL_STORAGE_UNAVAILABLE')
    await update<DraftWorkspace>(manifestKey, previous => {
      if (!validDraftWorkspace(previous)) throw new Error('MANUAL_STORAGE_INVALID')
      changing = { ...previous, binding: 'changing', generation: previous.generation + 1 }
      return changing
    }, store)
    announceWorkspace(changing)
  }
  publishManualChange()
  return changing
}
/** Only a proven pre-write pairing rejection may release the same workspace fence. */
export async function cancelRejectedManualBindingChange(fence: DraftWorkspace) {
  let restored!: DraftWorkspace
  const restore = (current: unknown) => {
    if (!validDraftWorkspace(current)) throw new Error('MANUAL_STORAGE_INVALID')
    restored = current.id === fence.id && current.generation === fence.generation && current.binding === 'changing'
      ? { ...current, binding: 'ready', generation: current.generation + 1 } : current
    return restored
  }
  if (fence.backend === 'local') await withManualStorageLock('unios:manual-cards:workspace:v2', async () => {
    announceWorkspace(restore(localManifest()))
  })
  else {
    if (!store) throw new Error('MANUAL_STORAGE_UNAVAILABLE')
    await update<unknown>(manifestKey, restore, store)
    announceWorkspace(restored)
  }
  publishManualChange()
}
export async function assertManualWorkspace(workspace: DraftWorkspace) {
  const latest = await readManualWorkspace()
  if (latest.id !== workspace.id || latest.backend !== workspace.backend) throw new Error('MANUAL_WORKSPACE_CHANGED')
}
export async function readManualEnvelope(workspace: DraftWorkspace, context: ManualCardContext) {
  await assertManualWorkspace(workspace)
  const key = manualEnvelopeKey(workspace, context)
  const raw: unknown = workspace.backend === 'idb' ? await get(key, store!) : JSON.parse(localStorage.getItem(key) ?? 'null')
  if (!validDraftEnvelope(raw, context)) throw new Error('MANUAL_STORAGE_INVALID')
  await assertManualWorkspace(workspace)
  return raw
}
export async function mutateManualEnvelope(workspace: DraftWorkspace, context: ManualCardContext,
  reducer: (current: DraftEnvelope | null) => DraftEnvelope) {
  await assertManualWorkspace(workspace)
  const key = manualEnvelopeKey(workspace, context)
  let result!: DraftEnvelope
  const reduce = (previous: unknown) => {
    if (previous !== undefined && previous !== null && !validDraftEnvelope(previous, context)) throw new Error('MANUAL_STORAGE_INVALID')
    result = { ...reducer((previous as DraftEnvelope | null) ?? null), revision: ((previous as DraftEnvelope | null)?.revision ?? 0) + 1 }
    if (!validDraftEnvelope(result, context)) throw new Error('MANUAL_STORAGE_INVALID')
    // Every already reserved UUID must survive exactly, with monotone receipts.
    if (previous) for (const [id, intent] of Object.entries((previous as DraftEnvelope).intents)) {
      const newer = result.intents[id]
      if (!newer || !sameManualPayload(intent.payload, newer.payload) ||
          (intent.result?.status === 'pushed' && newer.result?.status !== 'pushed')) throw new Error('MANUAL_MUTATION_CONFLICT')
    }
    return result
  }
  if (workspace.backend === 'idb') {
    if (!store) throw new Error('MANUAL_STORAGE_UNAVAILABLE')
    await update<unknown>(key, reduce, store)
  } else await withManualStorageLock(key, async () => {
    await assertManualWorkspace(workspace)
    localStorage.setItem(key, JSON.stringify(reduce(JSON.parse(localStorage.getItem(key) ?? 'null'))))
  })
  await assertManualWorkspace(workspace)
  publishManualChange()
  return result
}
export async function readLegacyManualDrafts(workspace: DraftWorkspace, context: ManualCardContext): Promise<ManualCardDraft[]> {
  if (!workspace.legacyNamespace) return []
  const key = `unios:manual-card-draft:v1:${workspace.legacyNamespace}:${context.version_id}:${context.annotation_id}`
  if (!store) throw new Error('MANUAL_STORAGE_UNAVAILABLE')
  const idb: unknown = await get(key, store)
  const raw = localStorage.getItem(key)
  const local: unknown = raw === null ? null : JSON.parse(raw)
  const result: ManualCardDraft[] = []
  for (const candidate of [idb, local]) {
    if (candidate === undefined || candidate === null) continue
    if (!validManualDraft(candidate, context)) throw new Error('MANUAL_STORAGE_INVALID')
    if (!result.some(draft => draft.writeId === candidate.writeId)) result.push(candidate)
  }
  return result
}
/** Display-only recovery text. It must never select an authority or unlock a mutation. */
export function readManualRecoveryPreview(context: ManualCardContext): DraftBranch[] {
  const recovered: ManualCardDraft[] = []
  try {
    const workspace = localManifest()
    if (workspace) {
      const local: unknown = JSON.parse(localStorage.getItem(manualEnvelopeKey(workspace, context)) ?? 'null')
      if (validDraftEnvelope(local, context)) recovered.push(local.head.draft, ...Object.values(local.branches).map(copy => copy.draft))
    }
    const legacy = workspace?.legacyNamespace ?? localStorage.getItem('unios:manual-card-workspace:v1')
    if (legacy) {
      const local: unknown = JSON.parse(localStorage.getItem(`unios:manual-card-draft:v1:${legacy}:${context.version_id}:${context.annotation_id}`) ?? 'null')
      if (validManualDraft(local, context)) recovered.push(local)
    }
  } catch { /* Unverified recovery text is optional; authoritative access remains closed. */ }
  return recovered.map(draft => ({ id: draft.writeId, writerInstanceId: draft.writeId, draft }))
    .filter((copy, index, all) => all.findIndex(other => other.id === copy.id) === index)
}

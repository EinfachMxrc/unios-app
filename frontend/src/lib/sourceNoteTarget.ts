// SPDX-License-Identifier: AGPL-3.0-or-later
import { useCallback, useEffect, useState } from 'react'
import { rememberWorkspace, useWorkspaceState, workspaceValue } from '@/lib/workspaceState'
import { readManualWorkspace } from './manualDraftPersistence'
import { subscribeManualChanges } from './manualDraftCoordination'

const STORAGE_KEY = 'unios-source-note-targets-v1'
const MAX_TARGETS = 160
const known = new Set<string>()
const choices = new Map<string, number>()
let epoch = 0
let activeWorkspace: string | null = null
let writes = Promise.resolve()
type Targets = { schema: 1; workspaceId: string; targets: [number, number, string | null][] }

export const sourceNoteTargetKey = (courseId: number, resourceId: number) =>
  `source-note:${courseId}:${resourceId}:target`
export const validSourceNoteTarget = (value: unknown): value is string | null =>
  value === null || (typeof value === 'string' && /^[\da-f]{8}(?:-[\da-f]{4}){3}-[\da-f]{12}$/i.test(value))
const errorKey = (key: string) => `${key}:resume-error`

function readTargets(workspaceId: string): Targets {
  const empty: Targets = { schema: 1, workspaceId, targets: [] }
  const raw = localStorage.getItem(STORAGE_KEY)
  if (!raw) return empty
  if (raw.length > 32 * 1024) {
    localStorage.removeItem(STORAGE_KEY)
    return empty
  }
  let value: unknown
  try {
    value = JSON.parse(raw)
  } catch {
    localStorage.removeItem(STORAGE_KEY)
    return empty
  }
  const valid =
    value &&
    typeof value === 'object' &&
    'schema' in value &&
    value.schema === 1 &&
    'workspaceId' in value &&
    value.workspaceId === workspaceId &&
    'targets' in value &&
    Array.isArray(value.targets) &&
    value.targets.length <= MAX_TARGETS &&
    value.targets.every(
      (item) =>
        Array.isArray(item) &&
        item.length === 3 &&
        Number.isSafeInteger(item[0]) &&
        item[0] > 0 &&
        Number.isSafeInteger(item[1]) &&
        item[1] > 0 &&
        validSourceNoteTarget(item[2]),
    )
  if (!valid) {
    localStorage.removeItem(STORAGE_KEY)
    return empty
  }
  return value as Targets
}

function clearTargets() {
  epoch += 1
  activeWorkspace = null
  choices.clear()
  try {
    localStorage.removeItem(STORAGE_KEY)
  } catch {
    /* Bound UUID checks reject any surviving old copy. */
  }
  known.forEach((key) => rememberWorkspace(key, null))
}

if (typeof window !== 'undefined') {
  window.addEventListener('unios:workspace-cleared', clearTargets)
  subscribeManualChanges(() => {
    if (!activeWorkspace) return
    const previous = activeWorkspace
    void readManualWorkspace()
      .then((workspace) => {
        if (activeWorkspace === previous && workspace.id !== previous) clearTargets()
      })
      .catch(() => {
        if (activeWorkspace === previous) clearTargets()
      })
  })
}

export function sourceNoteTarget(courseId: number, resourceId: number): string | null {
  return workspaceValue<string | null>(sourceNoteTargetKey(courseId, resourceId), null, {
    valid: validSourceNoteTarget,
  })
}

export function chooseSourceNoteTarget(courseId: number, resourceId: number, noteId: string | null) {
  if (
    !Number.isSafeInteger(courseId) ||
    courseId <= 0 ||
    !Number.isSafeInteger(resourceId) ||
    resourceId <= 0 ||
    !validSourceNoteTarget(noteId)
  )
    throw new Error('Invalid source note target')
  const key = sourceNoteTargetKey(courseId, resourceId)
  known.add(key)
  choices.set(key, (choices.get(key) ?? 0) + 1)
  rememberWorkspace(key, noteId)
  const started = epoch
  // Serialize this window's bounded metadata updates; text drafts have their own stores.
  writes = writes
    .catch(() => undefined)
    .then(async () => {
      try {
        if (started !== epoch) return
        const workspace = await readManualWorkspace()
        if (started !== epoch) return
        activeWorkspace = workspace.id
        const saved = readTargets(workspace.id)
        saved.targets = saved.targets.filter(([course, resource]) => course !== courseId || resource !== resourceId)
        saved.targets.push([courseId, resourceId, noteId])
        saved.targets = saved.targets.slice(-MAX_TARGETS)
        localStorage.setItem(STORAGE_KEY, JSON.stringify(saved))
        rememberWorkspace(errorKey(key), false, false)
      } catch {
        if (started === epoch) rememberWorkspace(errorKey(key), true, false)
      }
    })
}

/** Restore only a handle belonging to the currently confirmed pairing workspace. */
export async function restoreSourceNoteTarget(courseId: number, resourceId: number): Promise<void> {
  const key = sourceNoteTargetKey(courseId, resourceId)
  known.add(key)
  const started = epoch
  const choice = choices.get(key) ?? 0
  const workspace = await readManualWorkspace()
  if (started !== epoch || choice !== (choices.get(key) ?? 0)) return
  activeWorkspace = workspace.id
  const saved = readTargets(workspace.id)
  // A current explicit URL/session selection wins over an older durable handle.
  if (choice || sourceNoteTarget(courseId, resourceId)) return
  const target = saved.targets.find(([course, resource]) => course === courseId && resource === resourceId)
  if (target) rememberWorkspace(key, target[2])
}

export function useSourceNoteTarget(courseId: number, resourceId: number) {
  const key = sourceNoteTargetKey(courseId, resourceId)
  const [target] = useWorkspaceState<string | null>(key, null, { valid: validSourceNoteTarget })
  const [resumeError] = useWorkspaceState(errorKey(key), false, { persist: false })
  const [restoring, setRestoring] = useState(() => {
    try {
      return localStorage.getItem(STORAGE_KEY) !== null
    } catch {
      return false
    }
  })
  useEffect(() => {
    let alive = true
    void restoreSourceNoteTarget(courseId, resourceId)
      .catch(() => {
        if (alive) rememberWorkspace(errorKey(key), true, false)
      })
      .finally(() => {
        if (alive) setRestoring(false)
      })
    return () => {
      alive = false
    }
  }, [courseId, resourceId, key])
  const choose = useCallback(
    (value: string | null) => chooseSourceNoteTarget(courseId, resourceId, value),
    [courseId, resourceId],
  )
  return { target, choose, resumeError, restoring }
}

/** Testing/flush boundary; no document content is stored in this metadata queue. */
export function sourceNoteTargetsSettled(): Promise<void> {
  return writes
}

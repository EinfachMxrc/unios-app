// SPDX-License-Identifier: AGPL-3.0-or-later

import { randomId } from '@/lib/uuid'

/** A device-local recovery copy, separate from authoritative note versions. */
export type NoteDraft = {
  noteId: string
  baseRevision: number
  baseTitle: string
  baseBody: string
  title: string
  body: string
  updatedAt: number
  deviceId: string
  writeId: string
}

const prefix = 'unios:note-draft:v1:'
const deviceKey = 'unios:note-draft-device:v1'
const archivedPrefix = 'unios:note-draft-archive:v1:'
const newPrefix = 'unios:new-note-draft:v1:'
const workingDrafts = new Map<string, NoteDraft>()

export function workingNoteDraftFor(noteId: string): NoteDraft | null {
  return workingDrafts.get(noteId) ?? draftFor(noteId)
}

/** Failed disk writes retain the current text in this window, without claiming persistence. */
export function rememberVolatileNoteDraft(draft: Omit<NoteDraft, 'updatedAt' | 'deviceId' | 'writeId'>): NoteDraft {
  const saved = {
    ...draft,
    updatedAt: Date.now(),
    deviceId: workingDrafts.get(draft.noteId)?.deviceId ?? 'memory-only',
    writeId: randomId(),
  }
  workingDrafts.set(draft.noteId, saved)
  return saved
}

if (typeof window !== 'undefined') window.addEventListener('unios:workspace-cleared', () => workingDrafts.clear())

export type NewNoteDraft = {
  courseId: number
  resourceId: number | null
  title: string
  body: string
  writeId: string
  updatedAt: number
}

function deviceId(): string {
  let value = localStorage.getItem(deviceKey)
  if (!value) {
    value = randomId()
    localStorage.setItem(deviceKey, value)
  }
  return value
}

export function draftFor(noteId: string): NoteDraft | null {
  try {
    const stored = localStorage.getItem(`${prefix}${noteId}`)
    if (!stored) return null
    const draft: NoteDraft = JSON.parse(stored)
    if (
      draft.noteId !== noteId ||
      !Number.isInteger(draft.baseRevision) ||
      draft.baseRevision < 1 ||
      typeof draft.baseTitle !== 'string' ||
      typeof draft.baseBody !== 'string' ||
      typeof draft.title !== 'string' ||
      typeof draft.body !== 'string' ||
      typeof draft.updatedAt !== 'number' ||
      typeof draft.deviceId !== 'string' ||
      typeof draft.writeId !== 'string'
    )
      return null
    return draft
  } catch {
    return null
  }
}

/** localStorage completes synchronously before the editor reports local safety. */
export function keepDraft(draft: Omit<NoteDraft, 'updatedAt' | 'deviceId' | 'writeId'>): NoteDraft {
  const saved = { ...draft, updatedAt: Date.now(), deviceId: deviceId(), writeId: randomId() }
  localStorage.setItem(`${prefix}${draft.noteId}`, JSON.stringify(saved))
  workingDrafts.delete(draft.noteId)
  return saved
}

export function clearDraft(noteId: string, expectedWriteId: string): void {
  if (draftFor(noteId)?.writeId === expectedWriteId) {
    localStorage.removeItem(`${prefix}${noteId}`)
  }
  if (workingDrafts.get(noteId)?.writeId === expectedWriteId) workingDrafts.delete(noteId)
}

/** Keep a local recovery copy when the user explicitly chooses the host version. */
export function archiveDraft(draft: NoteDraft): void {
  localStorage.setItem(`${archivedPrefix}${draft.noteId}:${draft.writeId}`, JSON.stringify(draft))
}

export function archivedDraftsFor(noteId: string): NoteDraft[] {
  try {
    const drafts: NoteDraft[] = []
    for (let index = 0; index < localStorage.length; index += 1) {
      const key = localStorage.key(index)
      if (!key?.startsWith(`${archivedPrefix}${noteId}:`)) continue
      try {
        const draft = JSON.parse(localStorage.getItem(key) ?? 'null') as NoteDraft | null
        if (
          draft?.noteId === noteId &&
          typeof draft.title === 'string' &&
          typeof draft.body === 'string' &&
          Number.isInteger(draft.baseRevision)
        )
          drafts.push(draft)
      } catch {
        // One damaged copy must not hide the other recovery copies.
      }
    }
    return drafts.sort((a, b) => b.updatedAt - a.updatedAt)
  } catch {
    return []
  }
}

function newKey(courseId: number, resourceId: number | null): string {
  return `${newPrefix}${courseId}:${resourceId ?? 'none'}`
}

export function newNoteDraftFor(courseId: number, resourceId: number | null): NewNoteDraft | null {
  try {
    const raw = localStorage.getItem(newKey(courseId, resourceId))
    if (!raw) return null
    const draft: NewNoteDraft = JSON.parse(raw)
    return draft.courseId === courseId &&
      draft.resourceId === resourceId &&
      typeof draft.title === 'string' &&
      typeof draft.body === 'string' &&
      typeof draft.writeId === 'string'
      ? draft
      : null
  } catch {
    return null
  }
}

export function keepNewNoteDraft(
  courseId: number,
  resourceId: number | null,
  title: string,
  body: string,
): NewNoteDraft {
  const draft = { courseId, resourceId, title, body, updatedAt: Date.now(), writeId: randomId() }
  localStorage.setItem(newKey(courseId, resourceId), JSON.stringify(draft))
  return draft
}

export function clearNewNoteDraft(draft: NewNoteDraft): void {
  if (newNoteDraftFor(draft.courseId, draft.resourceId)?.writeId === draft.writeId) {
    localStorage.removeItem(newKey(draft.courseId, draft.resourceId))
  }
}

// SPDX-License-Identifier: AGPL-3.0-or-later
import { rememberWorkspace, workspaceValue } from './workspaceState'

export const validPageId = (value: unknown): value is string =>
  typeof value === 'string' && /^[\da-f]{8}(?:-[\da-f]{4}){3}-[\da-f]{12}$/i.test(value)
const intentKey = (courseId: number) => `note-parent-intent:${courseId}`
export const pendingPageParentKey = (noteId: string) => `note:${noteId}:pending-parent`

/** Capture only an explicit save's parent, so a later route cannot retarget its ACK. */
export function rememberPageParentIntent(courseId: number, parent: string | undefined) {
  rememberWorkspace(intentKey(courseId), validPageId(parent) ? parent : null, false)
}

export function transferPageParentIntent(courseId: number, noteId: string) {
  const parent = workspaceValue<string | null>(intentKey(courseId), null, {
    persist: false,
    valid: (value): value is string | null => value === null || validPageId(value),
  })
  if (parent && validPageId(noteId) && parent !== noteId) rememberWorkspace(pendingPageParentKey(noteId), parent)
  rememberWorkspace(intentKey(courseId), null, false)
}

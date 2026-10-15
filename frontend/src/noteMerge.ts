// SPDX-License-Identifier: AGPL-3.0-or-later

import { diffArrays } from 'diff'

type Change = { start: number; end: number; replacement: string[] }

function changes(base: string[], updated: string[]): Change[] {
  const result: Change[] = []
  let position = 0
  let pending: Change | null = null
  const finish = () => {
    if (pending) result.push(pending)
    pending = null
  }
  for (const part of diffArrays(base, updated)) {
    if (!part.added && !part.removed) {
      finish()
      position += part.value.length
    } else if (part.removed) {
      pending ??= { start: position, end: position, replacement: [] }
      pending.end += part.value.length
      position += part.value.length
    } else {
      pending ??= { start: position, end: position, replacement: [] }
      pending.replacement.push(...part.value)
    }
  }
  finish()
  return result
}

function overlaps(left: Change, right: Change): boolean {
  if (left.start === right.start) return true
  if (left.start === left.end) return left.start > right.start && left.start < right.end
  if (right.start === right.end) return right.start > left.start && right.start < left.end
  return left.start < right.end && right.start < left.end
}

export type MergeResult = { clean: true; value: string } | { clean: false }

/** Only combine independent line edits; uncertain edits stay available for review. */
export function mergeNoteText(base: string, local: string, remote: string): MergeResult {
  if (local === remote) return { clean: true, value: local }
  if (local === base) return { clean: true, value: remote }
  if (remote === base) return { clean: true, value: local }
  const original = base.split('\n')
  const localChanges = changes(original, local.split('\n'))
  const remoteChanges = changes(original, remote.split('\n'))
  for (const left of localChanges) {
    for (const right of remoteChanges) {
      if (!overlaps(left, right)) continue
      if (
        left.start === right.start &&
        left.end === right.end &&
        left.replacement.join('\n') === right.replacement.join('\n')
      )
        continue
      return { clean: false }
    }
  }
  const all = [...localChanges]
  for (const remoteChange of remoteChanges) {
    if (
      !all.some(
        (localChange) =>
          localChange.start === remoteChange.start &&
          localChange.end === remoteChange.end &&
          localChange.replacement.join('\n') === remoteChange.replacement.join('\n'),
      )
    ) {
      all.push(remoteChange)
    }
  }
  all.sort((a, b) => a.start - b.start || a.end - b.end)
  const merged: string[] = []
  let position = 0
  for (const change of all) {
    merged.push(...original.slice(position, change.start), ...change.replacement)
    position = change.end
  }
  merged.push(...original.slice(position))
  return { clean: true, value: merged.join('\n') }
}

export function mergeNoteTitle(base: string, local: string, remote: string): MergeResult {
  if (local === remote || remote === base) return { clean: true, value: local }
  if (local === base) return { clean: true, value: remote }
  return { clean: false }
}

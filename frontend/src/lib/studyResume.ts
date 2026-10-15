// SPDX-License-Identifier: AGPL-3.0-or-later
import { focusPath, type LearningFocusRef, type LearningFocusOptions } from './learningFocus'
import { useEffect } from 'react'
import { rememberWorkspace, useWorkspaceState, workspaceValue } from './workspaceState'

export type StudyResume = { reference: LearningFocusRef; options: LearningFocusOptions; title: string }
const KEY = 'study:last-session'
const STORAGE_KEY = 'unios-last-study-v1'
const positive = (value: unknown): value is number =>
  typeof value === 'number' && Number.isSafeInteger(value) && value > 0
function valid(value: unknown): value is StudyResume | null {
  if (value === null) return true
  if (!value || typeof value !== 'object') return false
  const entry = value as StudyResume
  return (
    !!entry.reference &&
    ['course', 'block', 'cycle'].includes(entry.reference.kind) &&
    positive(entry.reference.id) &&
    typeof entry.title === 'string' &&
    entry.title.length > 0 &&
    entry.title.length <= 200 &&
    !!entry.options &&
    typeof entry.options === 'object' &&
    (entry.options.mode === undefined || ['source', 'notes', 'practice'].includes(entry.options.mode)) &&
    (entry.options.version === undefined || positive(entry.options.version)) &&
    (entry.options.page === undefined || positive(entry.options.page)) &&
    (entry.options.note === undefined || /^[\da-f]{8}(?:-[\da-f]{4}){3}-[\da-f]{12}$/i.test(entry.options.note))
  )
}

/** Store only bounded resource handles. No note text, arbitrary URL or session token. */
export function rememberStudySession(reference: LearningFocusRef, options: LearningFocusOptions, title: string) {
  const entry = {
    reference: { kind: reference.kind, id: reference.id },
    options: {
      mode: options.mode,
      version: options.version,
      page: options.page,
      note: options.note,
    },
    title: title.slice(0, 200),
  }
  if (valid(entry)) {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(entry))
    } catch {
      /* Session resume still works without disk storage. */
    }
    rememberWorkspace(KEY, entry)
  }
}

function storedResume(): StudyResume | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw || raw.length > 4096) return null
    const value: unknown = JSON.parse(raw)
    return valid(value) ? value : null
  } catch {
    return null
  }
}

export function useStudyResume() {
  const [entry] = useWorkspaceState<StudyResume | null>(KEY, null, { valid })
  useEffect(() => {
    const restored = storedResume()
    if (restored && workspaceValue<StudyResume | null>(KEY, null, { valid }) === null) rememberWorkspace(KEY, restored)
  }, [])
  return entry ? { title: entry.title, to: focusPath(entry.reference, entry.options) } : null
}

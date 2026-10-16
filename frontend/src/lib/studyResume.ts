// SPDX-License-Identifier: AGPL-3.0-or-later
import { focusPath, type LearningFocusRef, type LearningFocusOptions } from './learningFocus'
import { useEffect } from 'react'
import { rememberWorkspace, useWorkspaceState, workspaceValue } from './workspaceState'

export type StudyResume = { reference: LearningFocusRef; options: LearningFocusOptions; title: string }
const KEY = 'study:last-session'
const STORAGE_KEY = 'unios-last-study-v1'
const COURSE_STORAGE_KEY = 'unios-course-study-v1'
const courseKey = (id: number) => `study:course:${id}`
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
export function rememberStudySession(
  reference: LearningFocusRef,
  options: LearningFocusOptions,
  title: string,
  courseId = reference.kind === 'course' ? reference.id : undefined,
) {
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
    if (positive(courseId) && options.version) {
      const courseEntry: StudyResume = { ...entry, reference: { kind: 'course', id: courseId } }
      const previous = storedCourses().filter((item) => item.reference.id !== courseId)
      try {
        localStorage.setItem(COURSE_STORAGE_KEY, JSON.stringify([courseEntry, ...previous].slice(0, 80)))
      } catch {
        /* The current window can still resume without durable storage. */
      }
      rememberWorkspace(courseKey(courseId), courseEntry)
    }
  }
}

function storedCourses(): StudyResume[] {
  try {
    const raw = localStorage.getItem(COURSE_STORAGE_KEY)
    if (!raw || raw.length > 80 * 4096) return []
    const values: unknown = JSON.parse(raw)
    return Array.isArray(values)
      ? values
          .filter((value): value is StudyResume => valid(value) && value !== null && value.reference.kind === 'course')
          .slice(0, 80)
      : []
  } catch {
    return []
  }
}

/** Per-course continuation keeps only validated handles, never the note's text. */
export function useCourseStudyResume(courseId: number) {
  const key = courseKey(courseId)
  const [entry] = useWorkspaceState<StudyResume | null>(key, null, { valid })
  useEffect(() => {
    const restored = storedCourses().find((item) => item.reference.id === courseId)
    if (restored && workspaceValue<StudyResume | null>(key, null, { valid }) === null) rememberWorkspace(key, restored)
  }, [courseId, key])
  return entry?.reference.kind === 'course' && entry.reference.id === courseId ? entry : null
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

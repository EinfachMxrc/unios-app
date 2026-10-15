// SPDX-License-Identifier: AGPL-3.0-or-later

import type { Overview, WeeklyOverview } from '@/types'
import { nextDeadline } from './deadlineOverview'

type Deadline = Overview['deadlines'][number]
type Resume = { title: string; to: string }
type StudyStatus = { mode: string; due: number }
type PeekTarget = { kind: 'assignment' | 'deadline'; id: number }

export type NextLearningAction =
  | { kind: 'resume'; title: string; to: string }
  | { kind: 'cards'; count: number; to: '/study' }
  | { kind: 'deadline'; deadline: Deadline; courseName: string | null; target: PeekTarget; to?: string }
  | { kind: 'practice'; count: number; to: '/learning?practice=all#learning-practice' }
  | { kind: 'choose'; to: '/learning' }

type Input = {
  resume: Resume | null
  cardStatus?: StudyStatus | null
  deadlines: Deadline[]
  courses: Overview['courses']
  weekly?: WeeklyOverview | null
  deadlinesEnabled: boolean
}

const positiveId = (value: unknown): value is number =>
  typeof value === 'number' && Number.isSafeInteger(value) && value > 0

/** Recommend one real destination from the data already loaded by Today.
 * Topic names alone do not identify a course or measure mastery, so they
 * never become a guessed topic link or a ranked "weakest" recommendation.
 */
export function nextLearningAction(input: Input, now = Date.now()): NextLearningAction {
  if (input.resume) return { kind: 'resume', ...input.resume }
  if (input.cardStatus?.mode === 'integrated' && positiveId(input.cardStatus.due)) {
    return { kind: 'cards', count: input.cardStatus.due, to: '/study' }
  }
  const deadline = input.deadlinesEnabled
    ? nextDeadline(
        input.deadlines.filter((item) => positiveId(item.id) && item.title.trim()).sort((a, b) => a.id - b.id),
        now,
      )
    : undefined
  if (deadline) {
    const assignmentId = positiveId(deadline.assignment_id) ? deadline.assignment_id : null
    return {
      kind: 'deadline',
      deadline,
      courseName: positiveId(deadline.course_id) ? (input.courses[deadline.course_id] ?? null) : null,
      target: assignmentId ? { kind: 'assignment', id: assignmentId } : { kind: 'deadline', id: deadline.id },
      ...(assignmentId && positiveId(deadline.course_id)
        ? { to: `/courses/${deadline.course_id}#assignment-${assignmentId}` }
        : {}),
    }
  }
  if (positiveId(input.weekly?.open_exercises)) {
    return { kind: 'practice', count: input.weekly.open_exercises, to: '/learning?practice=all#learning-practice' }
  }
  return { kind: 'choose', to: '/learning' }
}

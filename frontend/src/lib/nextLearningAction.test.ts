// SPDX-License-Identifier: AGPL-3.0-or-later

import { describe, expect, it } from 'vitest'
import type { Overview, WeeklyOverview } from '@/types'
import { nextLearningAction } from './nextLearningAction'

const now = Date.parse('2026-10-14T10:00:00Z')
const deadline = (values: Partial<Overview['deadlines'][number]> = {}): Overview['deadlines'][number] => ({
  id: 4,
  title: 'Schleifen üben',
  course_id: 3,
  assignment_id: 7,
  due_at: '2026-10-15T21:59:00Z',
  url: 'https://example.invalid/external',
  ...values,
})
const weekly = (open_exercises = 0): WeeklyOverview => ({
  reviews_this_week: 4,
  attempts_this_week: 2,
  open_exercises,
  weak_topics: ['Grenzwerte'],
})
const input = (values: Partial<Parameters<typeof nextLearningAction>[0]> = {}) => ({
  resume: null,
  deadlines: [],
  courses: { 3: 'Programmieren' },
  deadlinesEnabled: true,
  ...values,
})

describe('one concrete next learning action', () => {
  it('prioritizes the exact saved session over due cards and deadlines', () => {
    const resume = { title: 'Seite 12 weiterbearbeiten', to: '/learning/focus/block/2?mode=source&version=8&page=12' }
    expect(
      nextLearningAction(
        input({ resume, cardStatus: { mode: 'integrated', due: 5 }, deadlines: [deadline()], weekly: weekly(3) }),
        now,
      ),
    ).toEqual({ kind: 'resume', ...resume })
  })

  it('opens actual integrated daily cards before the next deadline', () => {
    expect(
      nextLearningAction(input({ cardStatus: { mode: 'integrated', due: 5 }, deadlines: [deadline()] }), now),
    ).toEqual({ kind: 'cards', count: 5, to: '/study' })
  })

  it('opens the nearest future assignment with its course, independent of API ordering', () => {
    const near = deadline()
    const deadlines = [deadline({ id: 9, due_at: '2026-11-01T10:00:00Z' }), near]
    expect(nextLearningAction(input({ deadlines }), now)).toEqual({
      kind: 'deadline',
      deadline: near,
      courseName: 'Programmieren',
      target: { kind: 'assignment', id: 7 },
      to: '/courses/3#assignment-7',
    })
    expect(deadlines.map((item) => item.id)).toEqual([9, 4])
  })

  it('uses the existing quick view for a standalone deadline without guessing a course', () => {
    const standalone = deadline({ course_id: null, assignment_id: null })
    expect(nextLearningAction(input({ deadlines: [standalone] }), now)).toEqual({
      kind: 'deadline',
      deadline: standalone,
      courseName: null,
      target: { kind: 'deadline', id: 4 },
    })
  })

  it('still opens an assignment quick view when its course is unavailable', () => {
    expect(nextLearningAction(input({ deadlines: [deadline({ course_id: null })] }), now)).toMatchObject({
      kind: 'deadline',
      target: { kind: 'assignment', id: 7 },
      courseName: null,
    })
    expect(nextLearningAction(input({ deadlines: [deadline({ course_id: null })] }), now)).not.toHaveProperty('to')
  })

  it('does not recommend elapsed, malformed or unbounded deadlines', () => {
    const deadlines = [
      deadline({ id: -1 }),
      deadline({ title: ' ' }),
      deadline({ due_at: 'not-a-date' }),
      deadline({ due_at: '2026-10-13T10:00:00Z' }),
    ]
    expect(nextLearningAction(input({ deadlines }), now)).toEqual({ kind: 'choose', to: '/learning' })
  })

  it('interprets an API timestamp without an offset as UTC and uses stable IDs for tied deadlines', () => {
    const first = deadline({ id: 2, due_at: '2026-10-14T10:30:00' })
    const second = deadline({ id: 9, due_at: '2026-10-14T10:30:00Z' })
    expect(nextLearningAction(input({ deadlines: [second, first] }), now)).toMatchObject({ deadline: first })
  })

  it('does not recommend a disabled deadline module', () => {
    expect(
      nextLearningAction(input({ deadlines: [deadline()], deadlinesEnabled: false, weekly: weekly(2) }), now),
    ).toEqual({ kind: 'practice', count: 2, to: '/learning?practice=all#learning-practice' })
  })

  it('opens the available exercise section when there is no session, daily queue or deadline', () => {
    expect(nextLearningAction(input({ weekly: weekly(3) }), now)).toEqual({
      kind: 'practice',
      count: 3,
      to: '/learning?practice=all#learning-practice',
    })
  })

  it.each([
    { mode: 'external', due: 5 },
    { mode: 'integrated', due: 0 },
    { mode: 'integrated', due: -1 },
    { mode: 'integrated', due: NaN },
    { mode: 'integrated', due: 1.5 },
  ])('does not send unavailable card queues to the integrated reader: %j', (cardStatus) => {
    expect(nextLearningAction(input({ cardStatus, weekly: weekly() }), now)).toEqual({
      kind: 'choose',
      to: '/learning',
    })
  })

  it('never infers mastery or a topic destination from unscoped weak-topic names', () => {
    expect(nextLearningAction(input({ weekly: weekly() }), now)).toEqual({ kind: 'choose', to: '/learning' })
  })
})

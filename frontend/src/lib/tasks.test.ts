// SPDX-License-Identifier: AGPL-3.0-or-later

import { describe, expect, test } from 'vitest'
import { dueLabel, groupTasks, nextStatus, type Task } from './tasks'

const task = (id: string, due_on: string | null, status: Task['status'] = 'open'): Task => ({
  id,
  title: id,
  notes: '',
  status,
  due_on,
  course_id: null,
  course_name: null,
  revision: 1,
  created_at: '2026-11-01T00:00:00Z',
  updated_at: '2026-11-01T00:00:00Z',
  completed_at: null,
})

describe('groupTasks', () => {
  test('sorts unfinished tasks by their day and keeps finished ones apart', () => {
    const groups = groupTasks(
      [
        task('late', '2026-11-24'),
        task('now', '2026-11-25', 'doing'),
        task('next', '2026-11-26'),
        task('someday', null),
        task('finished-late', '2026-11-01', 'done'),
      ],
      '2026-11-25',
    )
    expect(Object.fromEntries(Object.entries(groups).map(([key, list]) => [key, list.map((item) => item.id)]))).toEqual(
      {
        overdue: ['late'],
        today: ['now'],
        upcoming: ['next'],
        undated: ['someday'],
        done: ['finished-late'],
      },
    )
  })
})

describe('dueLabel', () => {
  test('names near days and the coming week, and dates everything else', () => {
    expect(dueLabel('2026-11-25', '2026-11-25', 'de-DE')).toEqual({ kind: 'today' })
    expect(dueLabel('2026-11-26', '2026-11-25', 'de-DE')).toEqual({ kind: 'tomorrow' })
    expect(dueLabel('2026-11-24', '2026-11-25', 'de-DE')).toEqual({ kind: 'yesterday' })
    expect(dueLabel('2026-11-30', '2026-11-25', 'de-DE')).toEqual({ kind: 'weekday', value: 'Montag' })
    expect(dueLabel('2026-12-24', '2026-11-25', 'de-DE')).toEqual({ kind: 'date', value: '24. Dez.' })
    expect(dueLabel('2027-01-05', '2026-11-25', 'de-DE')).toEqual({ kind: 'date', value: '5. Jan. 2027' })
  })
})

describe('nextStatus', () => {
  test('cycles through all three states', () => {
    expect(nextStatus('open')).toBe('doing')
    expect(nextStatus('doing')).toBe('done')
    expect(nextStatus('done')).toBe('open')
  })
})

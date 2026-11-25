// SPDX-License-Identifier: AGPL-3.0-or-later

import { request } from '@/api'
import { queryClient } from '@/offlineCache'
import { shiftMenuDay } from '@/lib/mensa'
import type { components } from '@/generated/api'

export type Task = components['schemas']['TaskView']
export type TasksResponse = components['schemas']['TasksView']
export type TaskStatus = Task['status']
export type TaskChanges = Partial<Pick<Task, 'title' | 'notes' | 'status' | 'due_on' | 'course_id'>>

export const TASKS_PATH = '/api/tasks'

export type TaskGroups = {
  overdue: Task[]
  today: Task[]
  upcoming: Task[]
  undated: Task[]
  done: Task[]
}

/** Split by the campus day (`YYYY-MM-DD`); the server already orders each group. */
export function groupTasks(tasks: readonly Task[], today: string): TaskGroups {
  const groups: TaskGroups = { overdue: [], today: [], upcoming: [], undated: [], done: [] }
  for (const task of tasks) {
    if (task.status === 'done') groups.done.push(task)
    else if (!task.due_on) groups.undated.push(task)
    else if (task.due_on < today) groups.overdue.push(task)
    else if (task.due_on === today) groups.today.push(task)
    else groups.upcoming.push(task)
  }
  return groups
}

export type DueLabel = { kind: 'today' | 'tomorrow' | 'yesterday' } | { kind: 'weekday' | 'date'; value: string }

/** Near days read as words, this week as a weekday, everything else as a date. */
export function dueLabel(due: string, today: string, locale: string): DueLabel {
  if (due === today) return { kind: 'today' }
  if (due === shiftMenuDay(today, 1)) return { kind: 'tomorrow' }
  if (due === shiftMenuDay(today, -1)) return { kind: 'yesterday' }
  const date = new Date(`${due}T12:00:00Z`)
  const soon = due > today && due <= shiftMenuDay(today, 6)
  return {
    kind: soon ? 'weekday' : 'date',
    value: new Intl.DateTimeFormat(locale, {
      timeZone: 'UTC',
      ...(soon ? { weekday: 'long' } : { day: 'numeric', month: 'short' }),
      ...(!soon && due.slice(0, 4) !== today.slice(0, 4) ? { year: 'numeric' } : {}),
    }).format(date),
  }
}

/** The circle on a row walks open → in progress → done → open. */
export function nextStatus(status: TaskStatus): TaskStatus {
  return status === 'open' ? 'doing' : status === 'doing' ? 'done' : 'open'
}

function refresh() {
  return Promise.all(
    [TASKS_PATH, '/api/trash'].map((path) => queryClient.invalidateQueries({ queryKey: ['api', path] })),
  )
}

export async function createTask(input: {
  id: string
  title: string
  due_on: string | null
  course_id: number | null
}) {
  const task = await request<Task>(TASKS_PATH, { method: 'POST', body: JSON.stringify(input) })
  await refresh()
  return task
}

/** A 409 means another window saved first; the list reloads either way so the next try uses fresh data. */
export async function changeTask(task: Pick<Task, 'id' | 'revision'>, changes: TaskChanges) {
  try {
    return await request<Task>(`${TASKS_PATH}/${encodeURIComponent(task.id)}`, {
      method: 'PATCH',
      body: JSON.stringify({ ...changes, expected_revision: task.revision }),
    })
  } finally {
    await refresh()
  }
}

export async function trashTask(id: string) {
  await request(`${TASKS_PATH}/${encodeURIComponent(id)}/trash`, { method: 'POST' })
  await refresh()
}

export async function restoreTask(id: string) {
  await request(`/api/trash/task/${encodeURIComponent(id)}/restore`, { method: 'POST' })
  await refresh()
}

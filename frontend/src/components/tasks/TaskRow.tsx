// SPDX-License-Identifier: AGPL-3.0-or-later

import { Check } from 'lucide-react'
import { activeIntlLocale } from '@/api'
import { CourseChip } from '@/components/CourseChip'
import { useT } from '@/i18n/useT'
import { dueLabel, nextStatus, type Task, type TaskStatus } from '@/lib/tasks'
import './Tasks.css'

const STATUS_KEY = { open: 'statusOpen', doing: 'statusDoing', done: 'statusDone' } as const

export function useStatusName() {
  const { t } = useT('tasks')
  return (status: TaskStatus) => t(STATUS_KEY[status])
}

export function TaskRow({
  task,
  today,
  disabled,
  onStatus,
  onOpen,
}: {
  task: Task
  today: string
  disabled: boolean
  onStatus: (task: Task, status: TaskStatus) => void
  onOpen: (task: Task) => void
}) {
  const { t } = useT('tasks')
  const statusName = useStatusName()
  const due = task.due_on ? dueLabel(task.due_on, today, activeIntlLocale()) : null
  const dueText = !due
    ? ''
    : due.kind === 'today'
      ? t('dueToday')
      : due.kind === 'tomorrow'
        ? t('dueTomorrow')
        : due.kind === 'yesterday'
          ? t('dueYesterday')
          : 'value' in due
            ? due.value
            : ''
  const late = task.status !== 'done' && !!task.due_on && task.due_on < today
  return (
    <li className="task-row" data-status={task.status}>
      <button
        type="button"
        className="task-status"
        disabled={disabled}
        aria-label={t('statusButton', {
          title: task.title,
          status: statusName(task.status),
          next: statusName(nextStatus(task.status)),
        })}
        title={statusName(task.status)}
        onClick={() => onStatus(task, nextStatus(task.status))}
      >
        <span aria-hidden="true">{task.status === 'done' && <Check size={11} strokeWidth={3.5} />}</span>
      </button>
      <button
        type="button"
        className="task-title"
        aria-label={t('editLabel', { title: task.title })}
        onClick={() => onOpen(task)}
      >
        {task.title}
      </button>
      {task.course_id !== null && task.course_name && <CourseChip id={task.course_id} name={task.course_name} />}
      {due && (
        <time className={`task-due ${late ? 'is-late' : ''}`} dateTime={task.due_on ?? undefined}>
          {dueText}
        </time>
      )}
    </li>
  )
}

// SPDX-License-Identifier: AGPL-3.0-or-later

import { useEffect } from 'react'
import { useLocation } from 'react-router-dom'
import { ListChecks } from 'lucide-react'
import { useApi } from '@/api'
import { Empty, Failure, Loading } from '@/components/State'
import { useCampusDay } from '@/hooks/useCampusDay'
import { useT } from '@/i18n/useT'
import { groupTasks, TASKS_PATH, type Task, type TasksResponse } from '@/lib/tasks'
import { TaskQuickAdd } from './TaskQuickAdd'
import { TaskRow } from './TaskRow'
import { useTaskActions } from './useTaskActions'
import './Tasks.css'

const GROUPS = [
  ['overdue', 'groupOverdue'],
  ['today', 'groupToday'],
  ['upcoming', 'groupUpcoming'],
  ['undated', 'groupUndated'],
] as const

const NEW_TASK_INPUT = 'tasks-new'

export function TasksPanel() {
  const { t } = useT('tasks')
  const { data, loading, error, reload } = useApi<TasksResponse>(TASKS_PATH)
  const { day } = useCampusDay()
  const actions = useTaskActions()
  const groups = groupTasks(data?.tasks ?? [], day)
  const location = useLocation()
  const wantsNew = new URLSearchParams(location.search).get('new') === 'task'
  const writable = actions.canWrite
  useEffect(() => {
    if (!wantsNew || !writable) return
    // After a navigation the page focuses its heading first; the input takes over right after.
    const timer = window.setTimeout(() => document.getElementById(NEW_TASK_INPUT)?.focus(), 120)
    return () => window.clearTimeout(timer)
  }, [wantsNew, writable, location.key])
  const rows = (tasks: Task[]) => (
    <ul className="task-list">
      {tasks.map((task) => (
        <TaskRow
          key={task.id}
          task={task}
          today={day}
          disabled={!actions.canWrite || actions.isBusy(task.id)}
          onStatus={actions.setStatus}
          onOpen={actions.open}
        />
      ))}
    </ul>
  )
  return (
    <section className="tasks-panel" aria-label={t('title')}>
      <TaskQuickAdd withCourse inputId={NEW_TASK_INPUT} />
      {actions.overlay}
      {loading && !data ? (
        <Loading variant="rows" />
      ) : error && !data ? (
        <Failure message={error} retry={reload} />
      ) : !data?.tasks.length ? (
        <Empty icon={ListChecks} title={t('emptyTitle')} text={t('emptyText')} />
      ) : (
        <>
          {GROUPS.map(([key, label]) =>
            groups[key].length ? (
              <div className="task-group" key={key} data-group={key}>
                <h3>
                  {t(label)} <span>{groups[key].length}</span>
                </h3>
                {rows(groups[key])}
              </div>
            ) : null,
          )}
          {groups.done.length > 0 && (
            <details className="task-group">
              <summary>
                {t('groupDone')} <span>{groups.done.length}</span>
              </summary>
              {rows(groups.done)}
            </details>
          )}
        </>
      )}
    </section>
  )
}

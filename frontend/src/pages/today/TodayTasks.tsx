// SPDX-License-Identifier: AGPL-3.0-or-later

import { ListChecks } from 'lucide-react'
import { Failure } from '@/components/State'
import { TaskQuickAdd } from '@/components/tasks/TaskQuickAdd'
import { TaskRow } from '@/components/tasks/TaskRow'
import { useTaskActions } from '@/components/tasks/useTaskActions'
import { useT } from '@/i18n/useT'
import { groupTasks, type Task } from '@/lib/tasks'
import { useWorkspaceState } from '@/lib/workspaceState'
import { TodaySection } from './TodaySection'

type Range = 'today' | 'open' | 'done'
const isRange = (value: unknown): value is Range => value === 'today' || value === 'open' || value === 'done'
const SHOWN = 6

export function TodayTasks({
  tasks,
  day,
  error,
  reload,
}: {
  tasks: Task[]
  day: string
  error: string | null
  reload: () => void
}) {
  const { t } = useT('today')
  const { t: tasksT } = useT('tasks')
  const actions = useTaskActions()
  const [range, setRange] = useWorkspaceState<Range>('today:task-range', 'open', { valid: isRange })
  const groups = groupTasks(tasks, day)
  const lists = {
    today: [...groups.overdue, ...groups.today],
    open: [...groups.overdue, ...groups.today, ...groups.upcoming, ...groups.undated],
    done: groups.done,
  }
  return (
    <TodaySection
      id="tasks"
      icon={ListChecks}
      title={tasksT('title')}
      to="/deadlines#tasks"
      linkLabel={t('allTasks')}
      active={range}
      onSelect={setRange}
      tabs={[
        { id: 'open', label: t('tasksOpen'), count: lists.open.length },
        { id: 'today', label: t('rangeToday'), count: lists.today.length },
        { id: 'done', label: t('tasksDone') },
      ]}
    >
      {error ? (
        <Failure message={error} retry={reload} />
      ) : (
        <>
          {lists[range].length > 0 && (
            <ul className="task-list">
              {lists[range].slice(0, SHOWN).map((task) => (
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
          )}
          {!lists[range].length && range !== 'open' && <p className="today-empty">{t('nothingInRange')}</p>}
          {range !== 'done' && <TaskQuickAdd key={range} defaultDue={range === 'today' ? day : ''} />}
          {actions.overlay}
        </>
      )}
    </TodaySection>
  )
}

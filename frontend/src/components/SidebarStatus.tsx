// SPDX-License-Identifier: AGPL-3.0-or-later

import { Link } from 'react-router-dom'
import { activeIntlLocale, useApi } from '@/api'
import { useCampusDay } from '@/hooks/useCampusDay'
import { useT } from '@/i18n/useT'
import { isoWeek } from '@/lib/isoWeek'
import { groupTasks, TASKS_PATH, type TasksResponse } from '@/lib/tasks'
import type { Preferences } from '@/preferences'
import { useTodayAppointments } from '@/pages/today/useTodayAppointments'
import { Mascot } from '@/components/Mascot'

/** Today at a glance above the navigation: the date and how many appointments it holds. */
export function SidebarDayCard({ enabled }: { enabled: boolean }) {
  const { t } = useT('sidebar')
  const { day, now } = useCampusDay()
  const { appointments, subscribed } = useTodayAppointments(day, enabled)
  const date = new Intl.DateTimeFormat(activeIntlLocale(), {
    timeZone: 'Europe/Berlin',
    weekday: 'short',
    day: 'numeric',
    month: 'long',
  }).format(now)
  if (!enabled) return null
  return (
    <Link to="/deadlines#timetable" className="sidebar-day">
      <Mascot size={30} mood="awake" />
      <span>
        <small>{t('dayLine', { date, week: isoWeek(day) })}</small>
        {(appointments.length > 0 || subscribed !== null) && (
          <strong>
            {appointments.length || subscribed ? t('daySessions', { count: appointments.length }) : t('dayNoTimetable')}
          </strong>
        )}
      </span>
    </Link>
  )
}

/** Small counters next to the navigation entries that have something waiting today. */
export function useSidebarBadges(modules: Preferences['modules']): Record<string, string> {
  const { day } = useCampusDay()
  const tasks = useApi<TasksResponse>(TASKS_PATH, { enabled: modules.deadlines })
  const cards = useApi<{ mode: string; due: number }>('/api/anki/study/status', { enabled: modules.courses })
  const groups = groupTasks(tasks.data?.tasks ?? [], day)
  const dueTasks = groups.overdue.length + groups.today.length
  const dueCards = cards.data?.mode === 'integrated' ? cards.data.due : 0
  return {
    ...(dueTasks ? { deadlines: String(dueTasks) } : {}),
    ...(dueCards ? { learning: dueCards > 999 ? '999+' : String(dueCards) } : {}),
  }
}

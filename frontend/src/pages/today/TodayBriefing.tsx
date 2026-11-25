// SPDX-License-Identifier: AGPL-3.0-or-later

import { Link } from 'react-router-dom'
import { activeIntlLocale } from '@/api'
import { useT } from '@/i18n/useT'
import type { CalendarAppointment } from '@/lib/calendarLayout'
import { campusClock } from '@/lib/mensa'
import { dueLabel } from '@/lib/tasks'
import { splitAppointmentTitle, timetableDate } from '@/lib/timetable'
import type { Overview } from '@/types'
import { nextSession } from './briefing'
import { clockText } from './DayAgenda'

/** One quiet line about the class that is running or comes next today. */
export function TodaySession({ appointments, now }: { appointments: CalendarAppointment[]; now: Date }) {
  const { t } = useT('today')
  const session = nextSession(appointments, now)
  if (!session) return null
  const { title, location } = splitAppointmentTitle(session.event.title)
  return (
    <Link to="/deadlines#timetable" className="today-session" data-state={session.kind}>
      <span className="today-session-dot" aria-hidden="true" />
      <span>
        {session.kind === 'running'
          ? t('sessionRunning')
          : session.kind === 'soon'
            ? t('sessionSoon', { count: session.minutes })
            : t('sessionLater', { time: clockText(session.event.starts_at) })}
      </span>
      <strong>{title}</strong>
      {location && <small>{location}</small>}
    </Link>
  )
}

/**
 * What is waiting today as a row of plain numbers. Each figure links to the
 * place where it is dealt with; new material only appears when there is some.
 */
export function TodayBriefing({
  day,
  deadline,
  dueTasks,
  dueCards,
  newFiles,
  upcomingCount,
  showDeadlines,
  onSeenFiles,
}: {
  day: string
  deadline: Overview['deadlines'][number] | null
  dueTasks: number
  dueCards: number | null
  newFiles: number
  upcomingCount: number
  showDeadlines: boolean
  onSeenFiles: () => void
}) {
  const { t } = useT('today')
  const { t: tasksT } = useT('tasks')
  const deadlineDay = deadline ? campusClock(timetableDate(deadline.due_at), 'Europe/Berlin').day : ''
  const label = deadline ? dueLabel(deadlineDay, day, activeIntlLocale()) : null
  const when = !label
    ? ''
    : label.kind === 'today'
      ? tasksT('dueToday')
      : label.kind === 'tomorrow'
        ? tasksT('dueTomorrow')
        : label.kind === 'yesterday'
          ? tasksT('dueYesterday')
          : 'value' in label
            ? label.value
            : ''
  return (
    <div className="today-summary" role="group" aria-label={t('currentOverviewLabel')}>
      {showDeadlines && (
        <Link to="/deadlines#tasks" className="today-stat" data-empty={dueTasks === 0 || undefined}>
          <strong>{dueTasks}</strong>
          <span>{t('statTasks', { count: dueTasks })}</span>
        </Link>
      )}
      {showDeadlines && (
        <Link to="/deadlines" className="today-stat" data-empty={upcomingCount === 0 || undefined}>
          <strong>{upcomingCount}</strong>
          <span>
            {t('statDeadlines', { count: upcomingCount })}
            {when && <small>{t('statNextDue', { when })}</small>}
          </span>
        </Link>
      )}
      {dueCards !== null && (
        <Link to="/study" className="today-stat" data-empty={dueCards === 0 || undefined}>
          <strong>{dueCards}</strong>
          <span>{t('statCards', { count: dueCards })}</span>
        </Link>
      )}
      {newFiles > 0 && (
        <Link to="/activity?kind=new" className="today-stat" onClick={onSeenFiles}>
          <strong>{newFiles}</strong>
          <span>{t('newFiles', { count: newFiles })}</span>
        </Link>
      )}
    </div>
  )
}

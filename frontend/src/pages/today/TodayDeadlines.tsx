// SPDX-License-Identifier: AGPL-3.0-or-later

import { CalendarDays } from 'lucide-react'
import { localDate } from '@/api'
import { CourseChip } from '@/components/CourseChip'
import type { PeekTarget } from '@/components/TaskPeekDrawer'
import { useT } from '@/i18n/useT'
import { campusClock, shiftMenuDay } from '@/lib/mensa'
import { timetableDate } from '@/lib/timetable'
import { useWorkspaceState } from '@/lib/workspaceState'
import type { Overview } from '@/types'
import { TodaySection } from './TodaySection'

type Range = 'all' | 'today' | 'week'
const isRange = (value: unknown): value is Range => value === 'all' || value === 'today' || value === 'week'
const SHOWN = 5

export function TodayDeadlines({
  data,
  day,
  onPeek,
}: {
  data: Overview
  day: string
  onPeek: (target: PeekTarget) => void
}) {
  const { t } = useT('today')
  const [range, setRange] = useWorkspaceState<Range>('today:deadline-range', 'all', { valid: isRange })
  const dueDay = (value: string) => campusClock(timetableDate(value), 'Europe/Berlin').day
  const lists = {
    all: data.deadlines,
    today: data.deadlines.filter((item) => dueDay(item.due_at) <= day),
    week: data.deadlines.filter((item) => dueDay(item.due_at) <= shiftMenuDay(day, 7)),
  }
  return (
    <TodaySection
      id="next"
      icon={CalendarDays}
      title={t('next')}
      to="/deadlines"
      linkLabel={t('allDeadlines')}
      active={range}
      onSelect={setRange}
      tabs={[
        { id: 'all', label: t('rangeAll'), count: lists.all.length },
        { id: 'today', label: t('rangeToday'), count: lists.today.length },
        { id: 'week', label: t('rangeWeek'), count: lists.week.length },
      ]}
    >
      {lists[range].length ? (
        <div className="today-section-rows">
          {lists[range].slice(0, SHOWN).map((item) => (
            <div className="today-event" key={item.id}>
              <span className="today-event-date">{localDate(item.due_at, { day: '2-digit', month: '2-digit' })}</span>
              <button
                className="today-peek-trigger"
                type="button"
                onClick={() =>
                  onPeek({
                    kind: item.assignment_id ? 'assignment' : 'deadline',
                    id: item.assignment_id ?? item.id,
                  })
                }
              >
                <strong>{item.title}</strong>
              </button>
              {item.course_id && data.courses[item.course_id] && (
                <CourseChip id={item.course_id} name={data.courses[item.course_id]} />
              )}
            </div>
          ))}
        </div>
      ) : (
        <p className="today-empty">{range === 'all' ? t('noUpcomingDeadlines') : t('nothingInRange')}</p>
      )}
    </TodaySection>
  )
}

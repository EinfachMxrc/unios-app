// SPDX-License-Identifier: AGPL-3.0-or-later
import { useEffect, useRef, useState } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { localDate } from '@/api'
import { useT } from '@/i18n/useT'
import { calendarColour, calendarWeekStart, type CalendarAppointment } from '@/lib/calendarLayout'
import { shiftMenuDay } from '@/lib/mensa'
import { splitAppointmentTitle } from '@/lib/timetable'

type Props = {
  day: string
  today: string
  events: CalendarAppointment[]
  hidden: Set<string>
  onToggle: (title: string) => void
  onDay: (day: string) => void
}

function shiftMonth(month: string, amount: number) {
  const date = new Date(`${month}T12:00:00Z`)
  date.setUTCMonth(date.getUTCMonth() + amount)
  return date.toISOString().slice(0, 10)
}

export function CalendarSidebar({ day, today, events, hidden, onToggle, onDay }: Props) {
  const { t } = useT('calendarWorkspace')
  const [month, setMonth] = useState(`${day.slice(0, 7)}-01`)
  const grid = useRef<HTMLDivElement>(null)
  const focusDate = useRef<string | null>(null)
  useEffect(() => setMonth(`${day.slice(0, 7)}-01`), [day])
  useEffect(() => {
    if (focusDate.current) {
      const target = grid.current?.querySelector<HTMLButtonElement>(`[data-date="${focusDate.current}"]`)
      if (target) {
        target.focus()
        focusDate.current = null
      }
    }
  }, [month, day])
  const first = calendarWeekStart(month)
  const dates = Array.from({ length: 42 }, (_, index) => shiftMenuDay(first, index))
  const titles = [...new Set(events.map((event) => splitAppointmentTitle(event.title).title))]
  const format = (date: string, options: Intl.DateTimeFormatOptions) => localDate(`${date}T12:00:00Z`, options)
  return (
    <aside className="calendar-sidebar" aria-label={t('navigation')}>
      <div className="calendar-mini-heading">
        <strong aria-live="polite">{format(month, { month: 'long', year: 'numeric' })}</strong>
        <button type="button" aria-label={t('previousMonth')} onClick={() => setMonth(shiftMonth(month, -1))}>
          <ChevronLeft size={15} />
        </button>
        <button type="button" aria-label={t('nextMonth')} onClick={() => setMonth(shiftMonth(month, 1))}>
          <ChevronRight size={15} />
        </button>
      </div>
      <div className="calendar-mini-weekdays" aria-hidden="true">
        {dates.slice(0, 7).map((date) => (
          <span key={date}>{format(date, { weekday: 'narrow' })}</span>
        ))}
      </div>
      <div className="calendar-mini-grid" ref={grid} role="group" aria-label={t('monthDates')}>
        {dates.map((date) => (
          <button
            key={date}
            type="button"
            data-date={date}
            className={`${date.slice(0, 7) !== month.slice(0, 7) ? 'is-other-month' : ''} ${calendarWeekStart(date) === calendarWeekStart(day) ? 'is-selected-week' : ''}`}
            aria-label={t('selectDate', { date: format(date, { dateStyle: 'full' }) })}
            aria-pressed={date === day}
            aria-current={date === today ? 'date' : undefined}
            tabIndex={date === day || (day.slice(0, 7) !== month.slice(0, 7) && date === month) ? 0 : -1}
            onClick={() => onDay(date)}
            onKeyDown={(event) => {
              const offset = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7 }[event.key]
              if (offset === undefined && event.key !== 'Home' && event.key !== 'End') return
              event.preventDefault()
              const next =
                event.key === 'Home'
                  ? calendarWeekStart(date)
                  : event.key === 'End'
                    ? shiftMenuDay(calendarWeekStart(date), 6)
                    : shiftMenuDay(date, offset!)
              focusDate.current = next
              onDay(next)
              grid.current?.querySelector<HTMLButtonElement>(`[data-date="${next}"]`)?.focus()
            }}
          >
            {Number(date.slice(-2))}
          </button>
        ))}
      </div>
      {titles.length > 0 && (
        <div className="calendar-course-list" role="group" aria-label={t('visibleCourses')}>
          <h3>{t('visibleCourses')}</h3>
          {titles.map((title) => (
            <label key={title} className={`calendar-colour-${calendarColour(title)}`}>
              <input type="checkbox" checked={!hidden.has(title)} onChange={() => onToggle(title)} />
              <span>{title}</span>
            </label>
          ))}
        </div>
      )}
      <p className="calendar-sidebar-zone">{t('campusTime')}</p>
    </aside>
  )
}

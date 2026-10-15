// SPDX-License-Identifier: AGPL-3.0-or-later
import { useEffect, useRef, useState } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { localDate } from '@/api'
import { useT } from '@/i18n/useT'
import { campusClock, shiftMenuDay } from '@/lib/mensa'
import type { DeadlinesResponse } from '@/types'
import './Calendar.css'

type Deadline = DeadlinesResponse['deadlines'][number]
export function DeadlineCalendar({ data, onPeek }: { data: DeadlinesResponse; onPeek: (item: Deadline) => void }) {
  const { t } = useT('deadlines')
  const today = campusClock(new Date(), 'Europe/Berlin').day
  const [selected, setSelected] = useState(today)
  const grid = useRef<HTMLDivElement>(null)
  const focusDay = useRef(false)
  useEffect(() => {
    if (focusDay.current) { grid.current?.querySelector<HTMLButtonElement>(`[data-day="${selected}"]`)?.focus(); focusDay.current = false }
  }, [selected])
  const selectedDate = new Date(`${selected}T12:00:00Z`)
  const first = new Date(Date.UTC(selectedDate.getUTCFullYear(), selectedDate.getUTCMonth(), 1, 12))
  const firstDay = first.toISOString().slice(0, 10)
  const leading = (first.getUTCDay() + 6) % 7
  const count = new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + 1, 0)).getUTCDate()
  const dates = Array.from({ length: Math.ceil((leading + count) / 7) * 7 }, (_, index) => shiftMenuDay(firstDay, index - leading))
  const byDay = new Map<string, Deadline[]>()
  for (const item of data.deadlines) {
    const day = campusClock(new Date(item.due_at), 'Europe/Berlin').day
    byDay.set(day, [...(byDay.get(day) ?? []), item])
  }
  for (const items of byDay.values()) items.sort((a, b) => Date.parse(a.due_at) - Date.parse(b.due_at))
  function shiftMonth(amount: number) {
    const last = new Date(Date.UTC(selectedDate.getUTCFullYear(), selectedDate.getUTCMonth() + amount + 1, 0)).getUTCDate()
    setSelected(new Date(Date.UTC(selectedDate.getUTCFullYear(), selectedDate.getUTCMonth() + amount,
      Math.min(selectedDate.getUTCDate(), last), 12)).toISOString().slice(0, 10))
  }
  const format = (date: string, options: Intl.DateTimeFormatOptions) => localDate(`${date}T12:00:00Z`, options)
  return <div className="deadline-calendar">
    <div className="deadline-calendar-header">
      <strong aria-live="polite">{format(firstDay, { month: 'long', year: 'numeric' })}</strong>
      <div><button type="button" aria-label={t('previousMonth')} onClick={() => shiftMonth(-1)}><ChevronLeft size={16} /></button>
        <button type="button" onClick={() => setSelected(today)}>{t('timetableToday')}</button>
        <button type="button" aria-label={t('nextMonth')} onClick={() => shiftMonth(1)}><ChevronRight size={16} /></button></div>
    </div>
    <div className="deadline-calendar-grid" ref={grid} role="group" aria-label={t('calendarMonthDays')}>
      {(['weekdayMon', 'weekdayTue', 'weekdayWed', 'weekdayThu', 'weekdayFri', 'weekdaySat', 'weekdaySun'] as const).map(key => <strong key={key}>{t(key)}</strong>)}
      {dates.map(date => {
        const items = byDay.get(date) ?? []
        return <div key={date} className={`deadline-calendar-day ${date.slice(0, 7) !== firstDay.slice(0, 7) ? 'is-outside' : ''} ${date === selected ? 'is-selected' : ''}`}>
          <button className="deadline-day-button" type="button" aria-label={format(date, { dateStyle: 'full' })}
            aria-pressed={date === selected} aria-current={date === today ? 'date' : undefined} data-day={date}
            onClick={() => setSelected(date)} onKeyDown={event => {
              const offset = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7 }[event.key]
              if (offset === undefined) return
              event.preventDefault()
              const next = shiftMenuDay(date, offset)
              focusDay.current = true
              setSelected(next)
              event.currentTarget.closest('.deadline-calendar-grid')?.querySelector<HTMLButtonElement>(`[data-day="${next}"]`)?.focus()
            }}>{Number(date.slice(-2))}<i className={items.length ? 'has-events' : ''} aria-hidden="true" /></button>
          <div className="deadline-month-events">{items.slice(0, 2).map(item => <button type="button" key={item.id} onClick={() => onPeek(item)} title={item.title}>{item.title}</button>)}
            {items.length > 2 && <span>{t('calendarMore', { count: items.length - 2 })}</span>}
          </div>
        </div>
      })}
    </div>
    <section className="deadline-selected-agenda" aria-label={t('calendarSelectedDay')}>
      <h3>{format(selected, { weekday: 'long', day: 'numeric', month: 'long' })}</h3>
      {(byDay.get(selected) ?? []).map(item => <button type="button" key={item.id} onClick={() => onPeek(item)}>
        <span className="deadline-agenda-dot" aria-hidden="true" /><span><strong>{item.title}</strong><small>{item.course_id ? data.courses[item.course_id] : t('generalCourse')}</small></span>
        <time>{localDate(item.due_at, { hour: '2-digit', minute: '2-digit' })}</time>
      </button>)}
      {!byDay.get(selected)?.length && <p>{t('calendarNoDeadlines')}</p>}
    </section>
  </div>
}

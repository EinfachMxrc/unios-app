// SPDX-License-Identifier: AGPL-3.0-or-later

import { Link } from 'react-router-dom'
import { ArrowRight, CalendarCheck2 } from 'lucide-react'
import { activeIntlLocale } from '@/api'
import { Failure, Loading } from '@/components/State'
import { useT } from '@/i18n/useT'
import { calendarSegments } from '@/lib/calendarLayout'
import { splitAppointmentTitle, timetableDate, timetableState } from '@/lib/timetable'
import type { useTodayAppointments } from './useTodayAppointments'
import './DayAgenda.css'

const HOUR_HEIGHT = 52

export const clockText = (value: string) =>
  new Intl.DateTimeFormat(activeIntlLocale(), {
    timeZone: 'Europe/Berlin',
    hour: '2-digit',
    minute: '2-digit',
  }).format(timetableDate(value))

/** Hours on screen: today's appointments plus the current time, never less than a half day. */
export function agendaRange(segments: { start: number; end: number }[], minutes: number) {
  const from = Math.min(...segments.map((item) => item.start), minutes)
  const to = Math.max(...segments.map((item) => item.end), minutes + 60)
  const start = Math.max(0, Math.floor(from / 60))
  const end = Math.min(24, Math.max(Math.ceil(to / 60), start + 6))
  return { start: Math.min(start, end - 6), end }
}

/** The day as a column: what happens when, and where "now" is. */
export function DayAgenda({
  day,
  minutes,
  now,
  timetable,
}: {
  day: string
  minutes: number
  now: Date
  timetable: ReturnType<typeof useTodayAppointments>
}) {
  const { t } = useT('today')
  const { t: calendar } = useT('deadlines')
  const { appointments, subscribed, loading, error, reload } = timetable
  const segments = calendarSegments(appointments, day)
  if (error && subscribed && !appointments.length) return <Failure message={error} retry={reload} />
  if (loading && !appointments.length) return <Loading variant="rows" />
  // Without a connected timetable and without own appointments there is no day to draw.
  if (!subscribed && !segments.length) return null
  if (!segments.length)
    return (
      <section id="timetable" className="timetable-summary-empty agenda-empty" aria-label={t('agendaTitle')}>
        <CalendarCheck2 size={22} aria-hidden="true" />
        <div>
          <h2>{calendar('noRemainingClasses')}</h2>
          <p>{calendar('timetableDoneHint')}</p>
          <Link to="/deadlines#timetable">
            {t('agendaOpenFull')} <ArrowRight size={13} aria-hidden="true" />
          </Link>
        </div>
      </section>
    )
  const range = agendaRange(segments, minutes)
  const top = (value: number) => ((value - range.start * 60) / 60) * HOUR_HEIGHT
  return (
    <section id="timetable" className="agenda" aria-label={t('agendaTitle')}>
      <header>
        <h3>{t('agendaTitle')}</h3>
        <Link to="/deadlines#timetable" aria-label={t('agendaOpenFull')}>
          <ArrowRight size={15} aria-hidden="true" />
        </Link>
      </header>
      {error && (
        <p className="agenda-warning" role="status">
          {error}
        </p>
      )}
      <div className="agenda-grid" style={{ height: (range.end - range.start) * HOUR_HEIGHT }}>
        {Array.from({ length: range.end - range.start }, (_, index) => (
          <div className="agenda-hour" key={index} style={{ top: index * HOUR_HEIGHT }} aria-hidden="true">
            <span>{`${String(range.start + index).padStart(2, '0')}:00`}</span>
          </div>
        ))}
        <ol>
          {segments.map((segment) => {
            const { title, location } = splitAppointmentTitle(segment.event.title)
            const height = Math.max(24, top(segment.end) - top(segment.start) - 3)
            return (
              <li
                key={segment.event.id}
                data-state={timetableState(segment.event, now)}
                data-hue={
                  segment.event.personal ? 3 : [...title].reduce((sum, char) => sum + char.charCodeAt(0), 0) % 3
                }
                data-short={height < 52 || undefined}
                style={{
                  top: top(segment.start) + 1,
                  height,
                  left: `${(segment.column / segment.columns) * 100}%`,
                  width: `calc(${100 / segment.columns}% - 4px)`,
                }}
              >
                <strong title={title}>{title}</strong>
                {timetableState(segment.event, now) === 'current' && <em>{calendar('timetableNow')}</em>}
                {timetableState(segment.event, now) === 'past' && <i className="sr-only">{t('agendaPast')}</i>}
                <span>
                  {clockText(segment.event.starts_at)}
                  {segment.event.ends_at ? `–${clockText(segment.event.ends_at)}` : ''}
                  {location ? ` · ${location}` : ''}
                </span>
              </li>
            )
          })}
        </ol>
        <div className="agenda-now" style={{ top: top(minutes) }} aria-hidden="true">
          <span>{`${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`}</span>
        </div>
      </div>
    </section>
  )
}

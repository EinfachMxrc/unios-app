// SPDX-License-Identifier: AGPL-3.0-or-later

import { useMemo, useState } from 'react'
import { useT } from '@/i18n/useT'
import type { TypedT } from '@/i18n/useT'
import { CalendarDays } from 'lucide-react'
import { activeIntlLocale, localDate } from '@/api'
import type { DeadlinesResponse } from '@/types'
import { Empty, ListRows, Panel } from '@/components/State'
import { MetadataEditor } from '@/components/MetadataEditor'
import { TaskPeekDrawer, type PeekTarget } from '@/components/TaskPeekDrawer'
import { DeadlineCalendar } from './DeadlineCalendar'
import './DeadlineViews.css'

type View = 'table' | 'board' | 'timeline' | 'calendar'
type Deadline = DeadlinesResponse['deadlines'][number]

function viewLabels(t: TypedT<'deadlines'>): Record<View, string> {
  return { table: t('viewTable'), board: t('viewBoard'), timeline: t('viewTimeline'), calendar: t('viewCalendar') }
}

function localDay(value: string): string {
  return new Intl.DateTimeFormat('sv-SE', {
    timeZone: 'Europe/Berlin',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date(value))
}

function DeadlineRow({
  item,
  courses,
  generalLabel,
  onPeek,
}: {
  item: Deadline
  courses: DeadlinesResponse['courses']
  generalLabel: string
  onPeek: (item: Deadline) => void
}) {
  return (
    <div className="data-row" key={item.id}>
      <span className="row-date">{localDate(item.due_at, { day: '2-digit', month: 'short' })}</span>
      <div>
        <button className="today-peek-trigger" type="button" onClick={() => onPeek(item)}>
          <strong>{item.title}</strong>
        </button>
        <span className="row-subtitle">
          {item.course_id ? courses[item.course_id] : generalLabel} · {localDate(item.due_at)}
        </span>
      </div>
    </div>
  )
}

export function DeadlineViews({ data }: { data: DeadlinesResponse }) {
  const { t } = useT('deadlines')
  const labels = viewLabels(t)
  const [view, setView] = useState<View>('table')
  const [peek, setPeek] = useState<PeekTarget | null>(null)
  function show(item: Deadline) {
    setPeek({ kind: item.assignment_id ? 'assignment' : 'deadline', id: item.assignment_id ?? item.id })
  }
  const deadlines = data.deadlines
  const today = localDay(new Date().toISOString())
  const inSevenDays = localDay(new Date(Date.now() + 7 * 86_400_000).toISOString())
  const groups = useMemo(
    () => [
      { label: t('groupOverdue'), items: deadlines.filter((item) => localDay(item.due_at) < today) },
      {
        label: t('groupThisWeek'),
        items: deadlines.filter((item) => localDay(item.due_at) >= today && localDay(item.due_at) <= inSevenDays),
      },
      { label: t('groupLater'), items: deadlines.filter((item) => localDay(item.due_at) > inSevenDays) },
    ],
    [deadlines, today, inSevenDays, t],
  )
  const generalLabel = t('generalCourse')

  return (
    <>
      <Panel
        title={t('viewsPanelTitle')}
        action={
          <div className="view-switch" aria-label={t('viewSwitchLabel')}>
            {(Object.keys(labels) as View[]).map((key) => (
              <button type="button" key={key} aria-pressed={view === key} onClick={() => setView(key)}>
                {labels[key]}
              </button>
            ))}
          </div>
        }
      >
        {!deadlines.length ? (
          <Empty icon={CalendarDays} title={t('emptyTitle')} text={t('emptyText')} />
        ) : view === 'table' ? (
          <div className="deadline-table" role="table" aria-label={t('tableLabel')}>
            <div className="deadline-table-head" role="row">
              <span role="columnheader">{t('tableDue')}</span>
              <span role="columnheader">{t('tableTask')}</span>
              <span role="columnheader">{t('tableCourse')}</span>
            </div>
            {deadlines.map((item) => (
              <div role="row" className="deadline-table-row" key={item.id}>
                <span role="cell">{localDate(item.due_at)}</span>
                <strong role="cell">
                  <button className="today-peek-trigger" type="button" onClick={() => show(item)}>
                    {item.title}
                  </button>
                  {item.url && (
                    <a className="deadline-source-link" href={item.url} target="_blank" rel="noreferrer">
                      {t('source')}
                    </a>
                  )}
                  <MetadataEditor kind="deadline" id={String(item.id)} />
                </strong>
                <span role="cell">{item.course_id ? data.courses[item.course_id] : generalLabel}</span>
              </div>
            ))}
          </div>
        ) : view === 'board' ? (
          <div className="deadline-board">
            {groups.map((group) => (
              <section key={group.label}>
                <h3>
                  {group.label} <small>{group.items.length}</small>
                </h3>
                {group.items.map((item) => (
                  <div className="deadline-card" key={item.id}>
                    <button className="today-peek-trigger" type="button" onClick={() => show(item)}>
                      <strong>{item.title}</strong>
                    </button>
                    <small>{item.course_id ? data.courses[item.course_id] : generalLabel}</small>
                    <time>{localDate(item.due_at)}</time>
                  </div>
                ))}
              </section>
            ))}
          </div>
        ) : view === 'timeline' ? (
          <div className="deadline-timeline">
            {Array.from(new Set(deadlines.map((item) => localDay(item.due_at)))).map((day) => (
              <section key={day}>
                <h3>
                  {new Intl.DateTimeFormat(activeIntlLocale(), { dateStyle: 'full' }).format(
                    new Date(`${day}T12:00:00Z`),
                  )}
                </h3>
                <ListRows>
                  {deadlines
                    .filter((item) => localDay(item.due_at) === day)
                    .map((item) => (
                      <DeadlineRow
                        key={item.id}
                        item={item}
                        courses={data.courses}
                        generalLabel={generalLabel}
                        onPeek={show}
                      />
                    ))}
                </ListRows>
              </section>
            ))}
          </div>
        ) : (
          <DeadlineCalendar data={data} onPeek={show} />
        )}
      </Panel>
      {peek && <TaskPeekDrawer target={peek} onClose={() => setPeek(null)} />}
    </>
  )
}

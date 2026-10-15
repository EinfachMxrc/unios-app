// SPDX-License-Identifier: AGPL-3.0-or-later

import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useT } from '@/i18n/useT'
import type { TypedT } from '@/i18n/useT'
import { activeIntlLocale, localDate } from '@/api'
import { berlinDay, groupItems, type GroupBy, type Item, type Result, type View, type VisibleField } from './collectionModel'

function ItemLink({ item }: { item: Item }) {
  return <Link to={item.url}>{item.title}</Link>
}

export function fieldLabels(t: TypedT<'collections'>): Record<VisibleField, string> {
  return { title: t('colEntry'), course: t('colCourse'), date: t('colDateOrMeasurement'),
    status: t('colStatus'), source: t('sourceLabel'), tags: t('tagLabel') }
}

function fieldValue(item: Item, field: VisibleField, t: TypedT<'collections'>) {
  if (field === 'title') return <><ItemLink item={item} /><small>{item.subtitle}</small></>
  if (field === 'course') return item.course_name ?? t('noCourseLabel')
  if (field === 'date') return item.kind === 'topics' ? item.score === null ? t('insufficientData') : `${item.score} %`
    : localDate(item.date, { day: '2-digit', month: '2-digit', year: 'numeric' })
  if (field === 'tags') return item.tags.map(tag => `#${tag}`).join(' · ')
  return item[field]
}

function ItemFields({ item, fields }: { item: Item; fields: VisibleField[] }) {
  const { t } = useT('collections')
  return <>{fields.filter(field => field !== 'title').map(field => <small key={field}>
    {fieldLabels(t)[field]}: {fieldValue(item, field, t)}</small>)}</>
}

/** The result in the chosen view: list, table, cards, board or month calendar. */
export function CollectionResults({ result, view, groupBy, fields }: { result: Result; view: View; groupBy: GroupBy; fields: VisibleField[] }) {
  const { t } = useT('collections')
  const [monthOffset, setMonthOffset] = useState(0)
  const groups = groupItems(result.items, groupBy, t)
  if (!result.items.length) return <p className="collection-empty">{t('noResultsText')}</p>
  if (view === 'table') return <div className="collection-table-wrap"><table className="collection-table">
    <thead><tr>{fields.map(field => <th key={field} scope="col">{fieldLabels(t)[field]}</th>)}</tr></thead>
    <tbody>{groups.flatMap(([group, items]) => [<tr key={`group-${group}`} className="collection-table-group"><th colSpan={fields.length}>{group}</th></tr>,
      ...items.map((item) => <tr key={`${item.kind}-${item.id}`}>
        {fields.map(field => <td key={field}>{fieldValue(item, field, t)}</td>)}</tr>)] )}</tbody>
  </table></div>
  if (view === 'cards') return <div>{groups.map(([group, items]) => <section key={group} className="collection-group"><h4>{group}</h4><div className="collection-cards">{items.map((item) => <article key={`${item.kind}-${item.id}`}>
    <strong><ItemLink item={item} /></strong><p>{item.subtitle}</p><ItemFields item={item} fields={fields} />
  </article>)}</div></section>)}</div>
  if (view === 'board') {
    return <div className="collection-board">{groups.map(([group, items]) => <section key={group}><h3>{group} <span>{items.length}</span></h3>
      {items.map((item) => <article key={`${item.kind}-${item.id}`}>
        <ItemLink item={item} /><ItemFields item={item} fields={fields} /></article>)}</section>)}</div>
  }
  if (view === 'calendar') {
    const month = new Date()
    month.setDate(1); month.setMonth(month.getMonth() + monthOffset)
    const year = month.getFullYear(), monthNumber = month.getMonth()
    const count = new Date(year, monthNumber + 1, 0).getDate()
    const offset = (new Date(year, monthNumber, 1).getDay() + 6) % 7
    const slots = [...Array.from({ length: offset }, () => 0), ...Array.from({ length: count }, (_, index) => index + 1)]
    const byDay = new Map<number, Item[]>()
    for (const item of result.items) {
      if (!item.date) continue
      const local = berlinDay(item.date)
      if (local.year !== year || local.month !== monthNumber) continue
      const day = local.day
      byDay.set(day, [...(byDay.get(day) ?? []), item])
    }
    const weekdayLabels = t('weekdayShortLabels').split(',')
    return <div className="collection-calendar"><div className="collection-calendar-navigation">
      <button type="button" onClick={() => setMonthOffset(monthOffset - 1)} aria-label={t('prevMonthAria')}>←</button>
      <strong>{new Intl.DateTimeFormat(activeIntlLocale(), { month: 'long', year: 'numeric' }).format(month)}</strong>
      <button type="button" onClick={() => setMonthOffset(monthOffset + 1)} aria-label={t('nextMonthAria')}>→</button></div>
      <div className="collection-calendar-grid">{weekdayLabels.map((label) => <b key={label}>{label}</b>)}
        {slots.map((day, index) => day ? <div className="collection-calendar-day" key={day}><span>{day}</span>
          {(byDay.get(day) ?? []).slice(0, 2).map((item) => <ItemLink key={`${item.kind}-${item.id}`} item={item} />)}
          {(byDay.get(day)?.length ?? 0) > 2 && <details className="collection-day-more">
            <summary>{t('moreItemsLabel', { count: (byDay.get(day)?.length ?? 0) - 2 })}</summary>
            {(byDay.get(day) ?? []).slice(2).map(item => <ItemLink key={`${item.kind}-${item.id}`} item={item} />)}
          </details>}
        </div> : <div className="collection-calendar-day empty" key={`empty-${index}`} />)}</div></div>
  }
  return <div>{groups.map(([group, items]) => <section key={group} className="collection-group"><h4>{group}</h4><div className="collection-list" data-keyboard-list>{items.map((item) => <article key={`${item.kind}-${item.id}`}>
    <div><strong><ItemLink item={item} /></strong><p>{item.subtitle}</p>
      <ItemFields item={item} fields={fields} /></div>
  </article>)}</div></section>)}</div>
}

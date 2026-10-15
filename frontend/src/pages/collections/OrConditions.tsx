// SPDX-License-Identifier: AGPL-3.0-or-later

import { useT } from '@/i18n/useT'
import type { CoursesResponse } from '@/types'
import type { AnyGroup, Kind } from './collectionModel'

/** The host accepts at most this many alternative conditions. */
const MAX_GROUPS = 8

/** Alternative conditions: an entry shows when it matches any one row. */
export function OrConditions({ groups, onChange, labels, courses }: {
  groups: AnyGroup[]
  onChange: (groups: AnyGroup[]) => void
  labels: Record<Kind, string>
  courses: CoursesResponse['courses'] | undefined
}) {
  const { t } = useT('collections')
  const change = (index: number, patch: Partial<AnyGroup>) =>
    onChange(groups.map((group, i) => i === index ? { ...group, ...patch } : group))
  const text = (value: string) => value || undefined

  return <details className="collections-metadata-filters"><summary>{t('orConditionsSummary', { count: groups.length })}</summary>
    <p>{t('orConditionsHint')}</p>
    {groups.map((group, index) => <div className="collection-or-row" key={index}>
      <label>{t('contentTypeLabel')}<select className="native-select" value={group.kind ?? ''}
        onChange={(event) => change(index, { kind: event.target.value as AnyGroup['kind'] || undefined })}>
        <option value="">{t('allOption')}</option>{Object.entries(labels).filter(([value]) => value !== 'all').map(([value, label]) =>
          <option key={value} value={value}>{label}</option>)}</select></label>
      <label>{t('courseLabel')}<select className="native-select" value={group.course_id ?? ''}
        onChange={(event) => change(index, { course_id: event.target.value ? Number(event.target.value) : undefined })}>
        <option value="">{t('allOption')}</option>{courses?.map((course) => <option key={course.id} value={course.id}>{course.name}</option>)}</select></label>
      <label>{t('tagLabel')}<input value={group.tag ?? ''} placeholder={t('egExamPlaceholder')}
        onChange={(event) => change(index, { tag: text(event.target.value) })} /></label>
      <label>{t('statusLabel')}<input value={group.status ?? ''} placeholder={t('egOpenPlaceholder')}
        onChange={(event) => change(index, { status: text(event.target.value) })} /></label>
      <label>{t('sourceLabel')}<input value={group.source ?? ''} placeholder={t('egMoodlePlaceholder')}
        onChange={(event) => change(index, { source: text(event.target.value) })} /></label>
      <label>{t('maxLearningStatusLabel')}<input type="number" min="0" max="100" value={group.max_percent ?? ''} placeholder="%"
        onChange={(event) => change(index, { max_percent: event.target.value === '' ? undefined : Number(event.target.value) })} /></label>
      <label className="collection-or-check"><input type="checkbox" checked={group.own_group_only ?? false}
        onChange={(event) => change(index, { own_group_only: event.target.checked })} /> {t('ownMaterialGroupLabel')}</label>
      <button type="button" onClick={() => onChange(groups.filter((_, i) => i !== index))}>{t('removeButton')}</button>
    </div>)}
    <button type="button" disabled={groups.length >= MAX_GROUPS}
      onClick={() => onChange([...groups, { kind: 'topics' }])}>{t('addOrConditionButton')}</button>
  </details>
}

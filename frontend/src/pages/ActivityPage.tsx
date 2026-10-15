// SPDX-License-Identifier: AGPL-3.0-or-later

import { Link, useSearchParams } from 'react-router-dom'
import { useEffect, useState } from 'react'
import { activityPreferences, rememberActivityPreferences } from '@/lib/activityPreferences'
import { courseName } from '@/lib/courseNames'
import { markMaterialsSeen } from '@/hooks/useSeenMaterials'
import { LocalActions } from '@/components/LocalActions'
import { Activity } from 'lucide-react'
import { useT } from '@/i18n/useT'
import { Input } from '@/components/ui/input'
import { localDate, useApi } from '@/api'
import type { ActivityResponse } from '@/types'
import { Shell } from '@/components/Shell'
import { Loading, Failure, Empty, Panel, ListRows } from '@/components/State'

export function ActivityPage() {
  const { t } = useT('activity')
  const [saved] = useState(activityPreferences)
  const [params, setParams] = useSearchParams(saved)
  useEffect(() => {
    rememberActivityPreferences(params)
  }, [params])
  const { data, error, loading, updatedAt } = useApi<ActivityResponse>(`/api/activity?${params.toString()}`, {
    retainScope: 'activity',
  })
  const course = params.get('course_id') ?? ''
  const kind = params.get('kind') ?? ''
  useEffect(() => {
    if (data) markMaterialsSeen(data.changes.filter((item) => item.kind === 'new').map((item) => item.id))
  }, [data])
  function filter(key: string, value: string) {
    const next = new URLSearchParams(params)
    next.set(key, value)
    setParams(next, { state: { activityFilterSync: true }, preventScrollReset: true })
  }
  function target(item: ActivityResponse['changes'][number]) {
    if (item.resource_id && item.course_id) return `/courses/${item.course_id}#resource-${item.resource_id}`
    if (item.assignment_id && item.course_id) return `/courses/${item.course_id}#assignment-${item.assignment_id}`
    if (item.kind === 'sync' && item.sync_run_id) return `/system#sync-${item.sync_run_id}`
    if (item.kind === 'mail') return '/mail'
    return item.course_id ? `/courses/${item.course_id}` : '/system'
  }
  return (
    <Shell title={t('pageTitle')} eyebrow={t('pageEyebrow')} cachedAt={updatedAt}>
      <div className="page-actions activity-actions">
        <div className="activity-selects">
          <select
            className="native-select"
            aria-label={t('filterCourseAria')}
            value={course}
            onChange={(event) => filter('course_id', event.target.value)}
          >
            <option value="">{t('allCoursesOption')}</option>
            {data?.courses.map((item) => (
              <option key={item.id} value={item.id}>
                {courseName(item)}
              </option>
            ))}
          </select>
          <select
            className="native-select"
            aria-label={t('filterEventAria')}
            value={kind}
            onChange={(event) => filter('kind', event.target.value)}
          >
            <option value="">{t('allEventsOption')}</option>
            <option value="content">{t('eventContent')}</option>
            <option value="new">{t('eventNew')}</option>
            <option value="updated">{t('eventUpdated')}</option>
            <option value="assignment">{t('eventAssignment')}</option>
            <option value="sync">{t('eventSync')}</option>
            <option value="mail">{t('eventMail')}</option>
          </select>
        </div>
        <div className="activity-dates">
          <label className="activity-date">
            <span>{t('fromLabel')}</span>
            <Input
              type="date"
              value={params.get('from_date') ?? ''}
              onChange={(event) => filter('from_date', event.target.value)}
            />
          </label>
          <label className="activity-date">
            <span>{t('toLabel')}</span>
            <Input
              type="date"
              value={params.get('to_date') ?? ''}
              onChange={(event) => filter('to_date', event.target.value)}
            />
          </label>
        </div>
      </div>
      {loading && !data ? (
        <Loading />
      ) : error ? (
        <Failure message={error} />
      ) : (
        data && (
          <Panel title={t('eventsCountLabel', { count: data.changes.length })}>
            {data.changes.length ? (
              <ListRows>
                {data.changes.map((item) => (
                  <div className="data-row" key={item.id}>
                    <span className="row-time">{localDate(item.created_at)}</span>
                    <div>
                      {item.course_id && (
                        <Link to={`/courses/${item.course_id}`} className="row-subtitle">
                          {courseName(data.courses.find((course) => course.id === item.course_id) ?? { name: '' })}
                        </Link>
                      )}
                      <p>
                        <Link to={target(item)}>{item.summary}</Link>
                      </p>
                    </div>
                  </div>
                ))}
              </ListRows>
            ) : (
              <Empty icon={Activity} title={t('emptyTitle')} text={t('emptyText')} />
            )}
          </Panel>
        )
      )}
      <LocalActions courseId={course} />
    </Shell>
  )
}

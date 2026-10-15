// SPDX-License-Identifier: AGPL-3.0-or-later
import { courseName } from '@/lib/courseNames'

import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useT } from '@/i18n/useT'
import { BookOpen, ChevronRight } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useApi } from '@/api'
import type { CoursesResponse } from '@/types'
import { Shell } from '@/components/Shell'
import { Loading, Failure, Empty, Panel } from '@/components/State'
import { MoodleCourseDiscovery } from '@/components/MoodleCourseDiscovery'

export function Courses() {
  const [all, setAll] = useState(false)
  const [inactive, setInactive] = useState(false)
  const { t } = useT('courses')
  const { data, error, loading, updatedAt } = useApi<CoursesResponse>(
    `/api/courses?all_semesters=${all}&include_inactive=${inactive}`,
  )
  return (
    <Shell title={t('title')} eyebrow={t('eyebrow')} cachedAt={updatedAt}>
      <div className="page-actions">
        <span className="muted-text">{t('count', { count: data?.courses.length ?? 0 })}</span>
        <div className="page-actions-group">
          <Button variant="outline" aria-pressed={inactive} onClick={() => setInactive(!inactive)}>
            {t('showInactive')}
          </Button>
          <Button variant="outline" onClick={() => setAll(!all)}>
            {all ? t('currentSemesterOnly') : t('allSemesters')}
          </Button>
        </div>
      </div>
      <p className="courses-intro">{t('intro')}</p>
      {loading && !data ? (
        <Loading />
      ) : error ? (
        <Failure message={error} />
      ) : (
        data &&
        (data.courses.length ? (
          <div className="course-list">
            {data.courses.map((course) => (
              <Link
                key={course.id}
                to={`/courses/${course.id}`}
                className="course-list-row"
                data-palette={course.id % 4}
              >
                <span className="course-list-banner" aria-hidden="true">
                  <BookOpen size={24} strokeWidth={1.5} />
                </span>
                <span className="course-list-body">
                  <span className="course-list-text">
                    <strong>{courseName(course)}</strong>
                    <small>
                      {data.semesters.find((item) => item.id === course.semester_id)?.name ?? t('withoutSemester')}
                      {!course.is_active && ` · ${t('inactive')}`}
                    </small>
                  </span>
                  <span className="course-list-open">
                    {t('openCourse')} <ChevronRight size={16} />
                  </span>
                </span>
              </Link>
            ))}
          </div>
        ) : (
          <Panel title={t('overviewTitle')}>
            <Empty icon={BookOpen} title={t('emptyTitle')} text={t('emptyText')} />
          </Panel>
        ))
      )}
      <MoodleCourseDiscovery />
    </Shell>
  )
}

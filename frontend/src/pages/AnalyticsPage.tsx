// SPDX-License-Identifier: AGPL-3.0-or-later

import { Link } from 'react-router-dom'
import { useState } from 'react'
import { useT } from '@/i18n/useT'
import type { TypedT } from '@/i18n/useT'
import { useApi } from '@/api'
import { Shell } from '@/components/Shell'
import { Failure, Loading } from '@/components/State'
import './AnalyticsPage.css'

type Daily = { day: string; reviews: number; attempts: number }
type Stats = {
  course_id: number | null
  name: string
  new_versions_7d: number
  new_versions_opened: number
  notes_created_7d: number
  reviews_7d: number
  attempts_7d: number
  open_questions: number
  upcoming_deadlines: number
  upcoming_exams: number
  topic_count: number
  measured_topics: number
  weak_topics: number
  measured_score: number | null
  retention_14d: number | null
  retention_delta_points: number | null
  exercise_accuracy_14d: number | null
  daily_work: Daily[]
}
type Report = { overall: Stats; courses: Stats[]; computed_at: string }

function percent(value: number | null, t: TypedT<'analytics'>) {
  return value === null ? t('insufficientData') : `${Math.round(value * 100)} %`
}

export function AnalyticsPage() {
  const { t } = useT('analytics')
  const { data, error, loading, updatedAt } = useApi<Report>('/api/analytics/study')
  const [selectedCourse, setSelectedCourse] = useState('')
  const stats = selectedCourse ? data?.courses.find((item) => String(item.course_id) === selectedCourse) : data?.overall
  const maxDay = Math.max(1, ...(stats?.daily_work.map((item) => item.reviews + item.attempts) ?? []))
  const hasDailyWork = stats?.daily_work.some((item) => item.reviews + item.attempts > 0) ?? false

  return (
    <Shell title={t('pageTitle')} cachedAt={updatedAt}>
      <div className="study-analytics-intro">
        <p>{t('introKicker')}</p>
        <h2>{t('introTitle')}</h2>
        <span>{t('introText')}</span>
      </div>
      <div className="study-analytics-course">
        <label htmlFor="study-analytics-course">{t('areaLabel')}</label>
        <select
          id="study-analytics-course"
          className="native-select"
          value={selectedCourse}
          onChange={(event) => setSelectedCourse(event.target.value)}
        >
          <option value="">{t('allCoursesOption')}</option>
          {data?.courses.map((item) => (
            <option key={item.course_id} value={item.course_id ?? ''}>
              {item.name}
            </option>
          ))}
        </select>
      </div>
      {loading && !data ? (
        <Loading />
      ) : error ? (
        <Failure message={error} />
      ) : (
        stats && (
          <>
            <div className="study-analytics-grid">
              <section>
                <h3>{t('newPdfsTitle')}</h3>
                <strong>{stats.new_versions_7d}</strong>
                <p>
                  {t('openedInReaderLabel')} <b>{stats.new_versions_opened}</b>
                </p>
              </section>
              <section>
                <h3>{t('notesCreatedTitle')}</h3>
                <strong>{stats.notes_created_7d}</strong>
                <p>
                  {t('openQuestionsLabel')} <b>{stats.open_questions}</b>
                </p>
              </section>
              <section>
                <h3>{t('studyWorkTitle')}</h3>
                <strong>{stats.reviews_7d + stats.attempts_7d}</strong>
                <p>{t('workSummary', { reviews: stats.reviews_7d, attempts: stats.attempts_7d })}</p>
              </section>
            </div>
            <div className="study-analytics-lower">
              <section className="study-analytics-panel">
                <h3>{t('learningStatusTitle')}</h3>
                <dl>
                  <div>
                    <dt>{t('measuredScoreLabel')}</dt>
                    <dd>{percent(stats.measured_score, t)}</dd>
                  </div>
                  <div>
                    <dt>{t('topicsWithMeasurementLabel')}</dt>
                    <dd>
                      {stats.measured_topics} / {stats.topic_count}
                    </dd>
                  </div>
                  <div>
                    <dt>{t('gapsOrUnmeasuredLabel')}</dt>
                    <dd>{stats.weak_topics}</dd>
                  </div>
                  <div>
                    <dt>{t('ankiRetentionLabel')}</dt>
                    <dd>
                      {percent(stats.retention_14d, t)}
                      {stats.retention_delta_points !== null && (
                        <small>
                          {' '}
                          {t('deltaPointsLabel', {
                            sign: stats.retention_delta_points > 0 ? '+' : '',
                            delta: stats.retention_delta_points,
                          })}
                        </small>
                      )}
                    </dd>
                  </div>
                  <div>
                    <dt>{t('exerciseAccuracyLabel')}</dt>
                    <dd>{percent(stats.exercise_accuracy_14d, t)}</dd>
                  </div>
                </dl>
                <p>{t('learningStatusNote')}</p>
              </section>
              <section className="study-analytics-panel">
                <h3>{t('nextUpTitle')}</h3>
                <dl>
                  <div>
                    <dt>{t('deadlines14Label')}</dt>
                    <dd>{stats.upcoming_deadlines}</dd>
                  </div>
                  <div>
                    <dt>{t('exams30Label')}</dt>
                    <dd>{stats.upcoming_exams}</dd>
                  </div>
                </dl>
                <Link to="/learning">{t('viewCyclesLink')}</Link>
              </section>
            </div>
            <section className="study-analytics-panel study-analytics-trend">
              <h3>{t('activityTitle')}</h3>
              {hasDailyWork ? (
                <>
                  <div className="study-analytics-chart" role="img" aria-label={t('chartAria')}>
                    {stats.daily_work.map((item) => (
                      <div
                        key={item.day}
                        className="study-analytics-day"
                        title={t('dayTooltip', { day: item.day, reviews: item.reviews, attempts: item.attempts })}
                      >
                        <div className="study-analytics-bars">
                          <span
                            className="reviews"
                            style={{ height: `${item.reviews ? Math.max(3, (item.reviews / maxDay) * 96) : 0}%` }}
                          />
                          <span
                            className="attempts"
                            style={{ height: `${item.attempts ? Math.max(3, (item.attempts / maxDay) * 96) : 0}%` }}
                          />
                        </div>
                        <small>{new Date(`${item.day}T12:00:00`).getDate()}</small>
                      </div>
                    ))}
                  </div>
                  <p className="study-analytics-legend">
                    <span className="reviews" /> {t('reviewsLegend')} <span className="attempts" />{' '}
                    {t('exercisesLegend')}
                  </p>
                </>
              ) : (
                <p className="study-analytics-empty">{t('noActivityText')}</p>
              )}
            </section>
            <p className="study-analytics-note">{t('openedNote')}</p>
          </>
        )
      )}
    </Shell>
  )
}

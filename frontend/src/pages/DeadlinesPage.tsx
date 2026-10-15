// SPDX-License-Identifier: AGPL-3.0-or-later

import { useEffect, useState } from 'react'
import { useT } from '@/i18n/useT'
import { ArrowDownToLine, CalendarDays } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { activeIntlLocale, localDate, request, useApi } from '@/api'
import type { Assignment, DeadlinesResponse } from '@/types'
import { AssignmentDeadline } from '@/components/AssignmentDeadline'
import { Link, useLocation } from 'react-router-dom'
import { Shell } from '@/components/Shell'
import { Loading, Failure, Empty, Panel, ListRows } from '@/components/State'
import { useWritableHost } from '@/hooks/host'
import { DeadlineViews } from '@/components/DeadlineViews'
import { DeadlineProposalsPanel } from '@/components/DeadlineProposalsPanel'
import { TimetablePanel } from '@/components/TimetablePanel'
import { TaskPeekDrawer, type PeekTarget } from '@/components/TaskPeekDrawer'
import { nextDeadline, splitEvents } from '@/lib/deadlineOverview'
import { useWorkspaceState } from '@/lib/workspaceState'
import { extractApiErrorMessage } from '@/hooks/useApiMutation'
import './ProductPlatform.css'
import './DeadlinesPage.css'

type Enrollment = {
  title: string
  status: 'complete' | 'open' | 'unclear'
  deadline_at: string | null
  checked_at: string
}
type EnrollmentReport = { rows: Enrollment[]; warnings: string[] }
type PrimussStatus = { enrollment_available: boolean; session_available: boolean }
type CampusStatus = {
  timetable_available: boolean
  events_available: boolean
  news_available: boolean
  session_available: boolean
  alias_map_available: boolean
  connection_state: string
  last_attempt_at: string | null
  last_success_at: string | null
}
type CampusNews = { id: number; title: string; published_at: string | null; checked_at: string }
type CampusReport = {
  events_created: number
  events_updated: number
  news_created: number
  news_updated: number
  skipped: number
  warnings: string[]
}
type PublicPeriod = {
  id: number
  semester: string
  kind: string
  starts_on: string
  ends_on: string
  source_url: string
  checked_at: string
}
type PublicPeriodsStatus = {
  configured: boolean
  state: string
  last_success_at: string | null
  periods: PublicPeriod[]
}
type PublicPeriodsReport = { checked: number; created: number; updated: number }
type PageView = 'calendar' | 'assignments'
const isPageView = (value: unknown): value is PageView => value === 'calendar' || value === 'assignments'

function dateOnly(value: string) {
  return new Intl.DateTimeFormat(activeIntlLocale(), { dateStyle: 'medium', timeZone: 'UTC' }).format(
    new Date(`${value}T12:00:00Z`),
  )
}

/** Upcoming events only; what is already over waits behind a disclosure instead of leading the list. */
function EventsPanel({ events }: { events: DeadlinesResponse['events'] }) {
  const { t } = useT('deadlines')
  const { upcoming, past } = splitEvents(events, Date.now())
  const row = (item: DeadlinesResponse['events'][number]) => (
    <div className="data-row" key={item.id}>
      <span className="row-date">{localDate(item.starts_at, { day: '2-digit', month: 'short' })}</span>
      <div><p>{item.title}</p><span className="row-subtitle">{localDate(item.starts_at)}</span></div>
    </div>
  )
  return <Panel title={t('eventsTitle')}>
    {upcoming.length ? <ListRows>{upcoming.slice(0, 8).map(row)}</ListRows>
      : <Empty icon={CalendarDays} title={t('noUpcomingEventsTitle')} text={t('noEventsText')} />}
    {past.length > 0 && <details className="past-events">
      <summary>{t('pastEventsSummary', { count: past.length })}</summary>
      <ListRows>{past.slice(0, 20).map(row)}</ListRows>
    </details>}
  </Panel>
}

export function DeadlinesPage() {
  const { t } = useT('deadlines')
  const { data, error: deadlineError, refreshError: deadlineRefreshError, loading, updatedAt, reload: reloadDeadlines } = useApi<DeadlinesResponse>('/api/deadlines')
  const error = deadlineRefreshError ?? deadlineError
  const { data: unresolved, reload: reloadUnresolved } = useApi<Assignment[]>('/api/assignments/unresolved')
  const portalQuery = useApi<PrimussStatus>('/api/primuss/status')
  const enrollmentQuery = useApi<Enrollment[]>('/api/primuss/enrollment')
  const campusQuery = useApi<CampusStatus>('/api/mycampus/status')
  const newsQuery = useApi<CampusNews[]>('/api/mycampus/news')
  const publicQuery = useApi<PublicPeriodsStatus>('/api/public-periods')
  const { data: portalStatus, reload: reloadPortalStatus } = portalQuery
  const { data: enrollment, reload: reloadEnrollment } = enrollmentQuery
  const { data: campusStatus, reload: reloadCampusStatus } = campusQuery
  const { data: campusNews, reload: reloadCampusNews } = newsQuery
  const { data: publicPeriods, reload: reloadPublicPeriods } = publicQuery
  const portalLoading = portalQuery.loading || portalQuery.refreshing
  const portalError = portalQuery.refreshError ?? portalQuery.error
  const enrollmentLoading = enrollmentQuery.loading || enrollmentQuery.refreshing
  const enrollmentFetchError = enrollmentQuery.refreshError ?? enrollmentQuery.error
  const campusLoading = campusQuery.loading || campusQuery.refreshing
  const campusFetchError = campusQuery.refreshError ?? campusQuery.error
  const newsLoading = newsQuery.loading || newsQuery.refreshing
  const newsError = newsQuery.refreshError ?? newsQuery.error
  const publicLoading = publicQuery.loading || publicQuery.refreshing
  const publicFetchError = publicQuery.refreshError ?? publicQuery.error
  const [pageView, setPageView] = useWorkspaceState<PageView>('deadlines:page-view', 'calendar', { valid: isPageView })
  const [peek, setPeek] = useState<PeekTarget | null>(null)
  const location = useLocation()
  useEffect(() => { if (location.hash === '#timetable') setPageView('calendar') }, [location.hash, setPageView])
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 30_000)
    return () => window.clearInterval(timer)
  }, [])
  const upcoming = nextDeadline(data?.deadlines ?? [], now)
  const canWrite = useWritableHost()
  const [checking, setChecking] = useState(false)
  const [enrollmentError, setEnrollmentError] = useState('')
  const [warnings, setWarnings] = useState<string[]>([])
  const [campusBusy, setCampusBusy] = useState(false)
  const [campusError, setCampusError] = useState('')
  const [campusReport, setCampusReport] = useState<CampusReport | null>(null)
  const [publicBusy, setPublicBusy] = useState(false)
  const [publicError, setPublicError] = useState('')
  const [publicReport, setPublicReport] = useState<PublicPeriodsReport | null>(null)
  const campusAvailable = Boolean(
    campusStatus?.timetable_available || campusStatus?.events_available || campusStatus?.news_available,
  )

  async function recheckEnrollment() {
    setChecking(true)
    setEnrollmentError('')
    setWarnings([])
    try {
      const result = await request<EnrollmentReport>('/api/primuss/enrollment/recheck', { method: 'POST' })
      setWarnings(result.warnings)
      reloadEnrollment()
      reloadDeadlines()
    } catch (cause) {
      setEnrollmentError(extractApiErrorMessage(cause))
    } finally {
      setChecking(false)
    }
  }

  async function syncCampus() {
    setCampusBusy(true)
    setCampusError('')
    setCampusReport(null)
    try {
      const result = await request<CampusReport>('/api/mycampus/sync', { method: 'POST' })
      setCampusReport(result)
      reloadCampusNews()
      reloadDeadlines()
    } catch (cause) {
      setCampusError(extractApiErrorMessage(cause))
    } finally {
      reloadCampusStatus()
      setCampusBusy(false)
    }
  }
  async function recheckPublicPeriods() {
    setPublicBusy(true)
    setPublicError('')
    setPublicReport(null)
    try {
      const result = await request<PublicPeriodsReport>('/api/public-periods/recheck', { method: 'POST' })
      setPublicReport(result)
      reloadPublicPeriods()
    } catch (cause) {
      setPublicError(extractApiErrorMessage(cause))
    } finally {
      setPublicBusy(false)
    }
  }
  return (
    <Shell title={t('title')} eyebrow={t('eyebrow')} cachedAt={updatedAt}>
      <div className="page-actions">
        <span className="muted-text">{t('sourcesHint')}</span>
        <Button asChild variant="outline">
          <a href="/calendar.ics">
            <ArrowDownToLine size={15} /> {t('subscribeIcal')}
          </a>
        </Button>
      </div>
      {loading && !data && <Loading />}
      {error && <Failure message={error} retry={reloadDeadlines} />}
      {data && <section className="deadline-next" aria-label={t('nextDeadlineHeading')}>
        <div><span>{t('nextDeadlineHeading')}</span>
          {upcoming ? <button type="button" onClick={() => setPeek({
            kind: upcoming.assignment_id ? 'assignment' : 'deadline', id: upcoming.assignment_id ?? upcoming.id,
          })}><strong>{upcoming.title}</strong><time dateTime={upcoming.due_at}>{localDate(upcoming.due_at)}</time>
            <small>{upcoming.course_id ? data.courses[String(upcoming.course_id)] ?? t('generalCourse') : t('generalCourse')}</small></button>
            : <p>{t('noUpcomingDeadline')}</p>}
        </div>
        <Button variant="outline" size="sm" onClick={() => setPageView('assignments')}>{t('allAssignments')}</Button>
      </section>}
      <div className="deadline-page-switch" role="group" aria-label={t('pageViewLabel')}>
        <button type="button" aria-pressed={pageView === 'calendar'} onClick={() => setPageView('calendar')}>{t('pageCalendar')}</button>
        <button type="button" aria-pressed={pageView === 'assignments'} onClick={() => setPageView('assignments')}>{t('pageAssignments')}</button>
      </div>
      <div className="deadline-pane" hidden={pageView !== 'calendar'}>
        <TimetablePanel />
        {data && <EventsPanel events={data.events} />}
      </div>
      <div className="deadline-pane" hidden={pageView !== 'assignments'}>
      <DeadlineProposalsPanel onChanged={reloadDeadlines} />
      {!!unresolved?.length && (
        <Panel title={t('unresolvedTitle')}>
          <p className="muted-text">{t('unresolvedHint')}</p>
          {unresolved.map((item) => (
            <div className="data-row" key={item.id}>
              <div>
                <Link to={`/courses/${item.course_id}#assignment-${item.id}`}>{item.title}</Link>
                <AssignmentDeadline
                  item={item}
                  onSaved={() => {
                    reloadUnresolved()
                    reloadDeadlines()
                  }}
                />
              </div>
            </div>
          ))}
        </Panel>
      )}
      {data && <DeadlineViews data={data} />}
      </div>
      <details className="deadline-sources">
        <summary>{t('sourcesHeading')}</summary>
        <Panel title={t('enrollmentTitle')}>
          <p className="muted-text">{t('enrollmentIntro')}</p>
          {portalLoading && <p role="status">{t('sourceLoading')}</p>}
          {portalError && <Failure message={portalError} retry={reloadPortalStatus} />}
          {!portalLoading && !portalError && portalStatus && !portalStatus.enrollment_available && <p>{t('enrollmentNotSetUp')} <Link to="/setup">{t('setupPrimuss')}</Link></p>}
          {!portalLoading && !portalError && portalStatus?.enrollment_available && !portalStatus.session_available && (
            <p>{t('enrollmentLoginRequired')}</p>
          )}
          <Button
            variant="outline"
            disabled={!canWrite || portalLoading || !!portalError || !portalStatus?.enrollment_available || !portalStatus.session_available || checking}
            onClick={() => void recheckEnrollment()}
          >
            {checking ? t('checkingEnrollment') : t('checkEnrollment')}
          </Button>
          {enrollmentError && <Failure message={enrollmentError} />}
          {enrollmentLoading && <p role="status">{t('enrollmentLoading')}</p>}
          {enrollmentFetchError && <Failure message={enrollmentFetchError} retry={reloadEnrollment} />}
          {enrollment?.map((row) => (
            <div className="data-row" key={row.title}>
              <div>
                <strong>{row.title}</strong>
                <p>
                  {row.status === 'complete'
                    ? t('enrollmentComplete')
                    : row.status === 'open'
                      ? t('enrollmentOpen')
                      : t('enrollmentUnclear')}
                </p>
                <span className="row-subtitle">
                  {row.deadline_at ? t('deadlineLabel', { date: localDate(row.deadline_at) }) : t('deadlineUnclear')}
                  {t('checkedLabel', { date: localDate(row.checked_at) })}
                </span>
              </div>
            </div>
          ))}
          {warnings.map((warning, index) => (
            <p className="muted-text" key={index}>
              {warning}
            </p>
          ))}
        </Panel>
        <Panel title={t('publicPeriodsTitle')}>
          <p className="muted-text">{t('publicPeriodsIntro')}</p>
          {publicLoading && <p role="status">{t('sourceLoading')}</p>}
          {publicFetchError && <Failure message={publicFetchError} retry={reloadPublicPeriods} />}
          {!publicLoading && !publicFetchError && publicPeriods && !publicPeriods.configured && <p>{t('publicPeriodsNotSetUp')} <Link to="/setup">{t('setupUniversity')}</Link></p>}
          {publicPeriods?.state === 'error' && <p>{t('publicPeriodsError')}</p>}
          <Button
            variant="outline"
            disabled={!canWrite || publicLoading || !!publicFetchError || !publicPeriods?.configured || publicBusy}
            onClick={() => void recheckPublicPeriods()}
          >
            {publicBusy ? t('checkingPublicPeriods') : t('checkPublicPeriods')}
          </Button>
          {publicError && <Failure message={publicError} />}
          {publicReport && (
            <p role="status">
              {t('publicPeriodsReport', {
                checked: publicReport.checked,
                created: publicReport.created,
                updated: publicReport.updated,
              })}
            </p>
          )}
          {publicPeriods?.last_success_at && (
            <p className="muted-text">{t('lastReadLabel', { date: localDate(publicPeriods.last_success_at) })}</p>
          )}
          {publicPeriods?.periods.map((period) => (
            <div className="data-row" key={period.id}>
              <div>
                <strong>
                  {period.kind === 'enrollment' ? t('enrollmentPeriod') : t('examRegistrationPeriod')} ·{' '}
                  {period.semester}
                </strong>
                <p className="row-subtitle">
                  {t('periodRange', { start: dateOnly(period.starts_on), end: dateOnly(period.ends_on) })}
                  <a href={period.source_url} target="_blank" rel="noreferrer">
                    {t('sourceUniversity')}
                  </a>
                </p>
              </div>
            </div>
          ))}
        </Panel>
        <Panel title={t('campusTitle')}>
          <p className="muted-text">{t('campusIntro')}</p>
          {campusLoading && <p role="status">{t('sourceLoading')}</p>}
          {campusFetchError && <Failure message={campusFetchError} retry={reloadCampusStatus} />}
          {!campusLoading && !campusFetchError && campusStatus && !campusAvailable && (
            <p>{campusStatus?.alias_map_available === false ? t('campusAliasMapMissing') : t('campusNotSetUp')}</p>
          )}
          {!campusLoading && !campusFetchError && campusAvailable && !campusStatus?.session_available && <p>{t('campusLoginRequired')}</p>}
          {campusAvailable && campusStatus?.connection_state === 'login_required' && (
            <p>{t('campusLoginNeededAgain')}</p>
          )}
          {campusStatus?.last_success_at && (
            <p className="muted-text">{t('campusLastSuccess', { date: localDate(campusStatus.last_success_at) })}</p>
          )}
          <Button
            variant="outline"
            disabled={!canWrite || campusLoading || !!campusFetchError || !campusAvailable || !campusStatus?.session_available || campusBusy}
            onClick={() => void syncCampus()}
          >
            {campusBusy ? t('syncingCampus') : t('syncCampus')}
          </Button>
          {campusError && <Failure message={campusError} />}
          {newsLoading && <p role="status">{t('newsLoading')}</p>}
          {newsError && <Failure message={newsError} retry={reloadCampusNews} />}
          {campusReport && (
            <div role="status">
              <p>
                {t('campusReport', {
                  eventsCreated: campusReport.events_created,
                  newsCreated: campusReport.news_created,
                  eventsUpdated: campusReport.events_updated,
                  newsUpdated: campusReport.news_updated,
                  skipped: campusReport.skipped,
                })}
              </p>
              {campusReport.warnings.map((warning, index) => (
                <p className="muted-text" key={index}>
                  {warning}
                </p>
              ))}
            </div>
          )}
          {campusNews && campusNews.length > 0 && (
            <div>
              <h3>{t('newsHeading')}</h3>
              <ListRows>
                {campusNews.map((item) => (
                  <div className="data-row" key={item.id}>
                    <div>
                      <strong>{item.title}</strong>
                      <p className="row-subtitle">
                        {item.published_at ? localDate(item.published_at) : t('datePublishedUnknown')}
                      </p>
                    </div>
                  </div>
                ))}
              </ListRows>
            </div>
          )}
        </Panel>
      </details>
      {peek && <TaskPeekDrawer target={peek} onClose={() => setPeek(null)} />}
    </Shell>
  )
}

// SPDX-License-Identifier: AGPL-3.0-or-later

import { MensaToday } from '@/components/MensaToday'
import { TimetablePanel } from '@/components/TimetablePanel'
import { useState } from 'react'
import { markMaterialsSeen, useSeenMaterials } from '@/hooks/useSeenMaterials'
import { useNotifications } from '@/hooks/useNotifications'
import { Link } from 'react-router-dom'
import { useT } from '@/i18n/useT'
import type { TypedT } from '@/i18n/useT'
import { ArrowRight, Bell, CalendarDays, CalendarRange, FileClock, Plus } from 'lucide-react'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { activeIntlLocale, localDate, useApi } from '@/api'
import type { NotesResponse, Overview, WeeklyOverview } from '@/types'
import { Shell } from '@/components/Shell'
import { AddonWidgetSlot } from '@/addons/AddonWidgetSlot'
import { JotCapture } from '@/components/JotCapture'
import { useJotOutbox } from '@/hooks/useJotOutbox'
import { Failure, Loading } from '@/components/State'
import { usePreferences } from '@/preferences'
import { useStudyResume } from '@/lib/studyResume'
import { nextLearningAction, type NextLearningAction } from '@/lib/nextLearningAction'
import { TaskPeekDrawer, type PeekTarget } from '@/components/TaskPeekDrawer'
import { MoodleRefresh } from '@/components/MoodleRefresh'
import { mascotMoodFor } from '@/components/Mascot'
import { UliBuddy } from '@/components/UliBuddy'
import './Today.css'

/** Emoji give each count a face at a glance. They are drawn by CSS, so they are not part of the link text or read aloud. */
const SUMMARY_EMOJI = { files: '📄', tasks: '📌', cards: '🃏' } as const

function describeLearningAction(action: NextLearningAction, t: TypedT<'today'>, workspace: TypedT<'studyWorkspace'>) {
  switch (action.kind) {
    case 'resume':
      return { title: action.title, reason: t('resumeReason'), label: workspace('resume') }
    case 'cards':
      return { title: t('reviewCards', { count: action.count }), reason: t('reviewDueToday'), label: t('studyCards') }
    case 'deadline':
      return {
        title: action.deadline.title,
        context: action.courseName,
        reason: t('nextDeadlineReason', { date: localDate(action.deadline.due_at) }),
        label: action.target.kind === 'assignment' ? t('openAssignment') : t('viewDeadline'),
      }
    case 'practice':
      return {
        title: t('openExercises', { count: action.count }),
        reason: t('openExercisesReason'),
        label: t('chooseExercise'),
      }
    case 'choose':
      return { title: t('chooseLearningTitle'), reason: t('chooseLearningReason'), label: t('continueLearning') }
  }
}

export function Today() {
  const preferences = usePreferences()
  const { t } = useT('today')
  const { t: workspace } = useT('studyWorkspace')
  const resume = useStudyResume()
  const { t: tNav } = useT('nav')
  const { data, error, loading, updatedAt } = useApi<Overview>('/api/overview')
  const { data: rulePins } =
    useApi<Array<{ id: number; title: string; url: string; rule_name: string }>>('/api/rules/pins')
  const { data: conflictPackages } = useApi<Array<{ package_id: string; reviewed: boolean }>>('/api/host/conflicts')
  const { data: cardStatus } = useApi<{ mode: string; due: number; cards: number }>('/api/anki/study/status')
  const { data: weekly } = useApi<WeeklyOverview>('/api/learning/weekly', { enabled: preferences.modules.courses })
  const { data: setupStatus } = useApi<{ moodle_available: boolean }>('/api/setup/status')
  const { data: notes } = useApi<NotesResponse>('/api/notes?limit=1')
  const { pending } = useJotOutbox()
  const [captureOpen, setCaptureOpen] = useState(false)
  const [peek, setPeek] = useState<PeekTarget | null>(null)
  const seenThrough = useSeenMaterials()
  const { data: notifications } = useNotifications()
  const unseenMaterials =
    data?.changes.filter(
      (item) =>
        item.kind === 'new' && item.id > seenThrough && !notifications?.seen_material_changes?.includes(item.id),
    ) ?? []
  const syncNeedsAttention =
    data?.sync_continuity.state === 'overdue' || (data?.sync_continuity.state === 'never' && data.moodle_configured)
  const connectorWarnings =
    data?.warnings.filter(
      (item) =>
        ['error', 'warning', 'login_required'].includes(item.status) &&
        (item.connector !== 'moodle' || data.moodle_enabled),
    ) ?? []
  const connectorNeedsAttention = connectorWarnings.length > 0
  const moodleWarningOnly = connectorNeedsAttention && connectorWarnings.every((item) => item.connector === 'moodle')
  const connectorWarningLink = moodleWarningOnly ? t('checkMoodle') : t('checkConnection')
  const groupNeedsAttention = preferences.modules.courses && Boolean(data?.pending_group_courses.length)
  const conflictNeedsAttention = Array.isArray(conflictPackages) && conflictPackages.some((item) => !item.reviewed)
  const urgentCount = Number(conflictNeedsAttention) + Number(syncNeedsAttention) + Number(connectorNeedsAttention)
  const extraWarnings = [
    ...(conflictNeedsAttention && syncNeedsAttention ? [t('checkConnection')] : []),
    ...(connectorNeedsAttention && (conflictNeedsAttention || syncNeedsAttention) ? [connectorWarningLink] : []),
  ]
  const hour = new Date().getHours()
  const greeting = hour < 11 ? t('greetingMorning') : hour < 18 ? t('greetingDay') : t('greetingEvening')
  const learningAction = nextLearningAction({
    resume,
    cardStatus,
    deadlines: data?.deadlines ?? [],
    courses: data?.courses ?? {},
    weekly,
    deadlinesEnabled: preferences.modules.deadlines,
  })
  const learningCue = describeLearningAction(learningAction, t, workspace)
  return (
    <Shell title={tNav('today')} cachedAt={updatedAt}>
      {loading && !data ? (
        <Loading />
      ) : error ? (
        <Failure message={error} />
      ) : (
        data && (
          <div className="today-content">
            <section className="today-intro" aria-label={t('overviewLabel')}>
              <p>
                {new Intl.DateTimeFormat(activeIntlLocale(), { weekday: 'long', day: 'numeric', month: 'long' }).format(
                  new Date(),
                )}
              </p>
              <h2>
                {greeting}. <span>{t('greetingSuffix')}</span>
              </h2>
              <div className="today-focus">
                <UliBuddy
                  className="today-mascot"
                  size={64}
                  mood={mascotMoodFor({
                    hour,
                    dueCards: cardStatus?.mode === 'integrated' ? cardStatus.due : 0,
                    openTasks: data.deadlines.length,
                  })}
                />
                <div className="today-focus-main">
                  {preferences.modules.courses && (
                    <div className="today-learning-cue" data-learning-action={learningAction.kind}>
                      <span>{t('learningCueLabel')}</span>
                      <strong>{learningCue.title}</strong>
                      {learningCue.context && <p className="today-learning-context">{learningCue.context}</p>}
                      <small>{learningCue.reason}</small>
                    </div>
                  )}
                  <div className="today-summary" aria-label={t('currentOverviewLabel')}>
                    {unseenMaterials.length > 0 && (
                      <Link
                        data-emoji={SUMMARY_EMOJI.files}
                        to="/activity?kind=new"
                        onClick={() => markMaterialsSeen(unseenMaterials.map((item) => item.id))}
                      >
                        <strong>{unseenMaterials.length}</strong> {t('newFiles', { count: unseenMaterials.length })}
                      </Link>
                    )}
                    <Link to="/deadlines" data-emoji={SUMMARY_EMOJI.tasks}>
                      <strong>{data.deadlines.length}</strong> {t('upcomingTasks', { count: data.deadlines.length })}
                    </Link>
                    {cardStatus?.mode === 'integrated' && (
                      <Link to="/study" data-emoji={SUMMARY_EMOJI.cards}>
                        <strong>{cardStatus.due}</strong> {t('cardsDue')}
                      </Link>
                    )}
                  </div>
                </div>
                <div className="today-focus-actions">
                  {preferences.modules.courses &&
                    (learningAction.kind === 'deadline' && !learningAction.to ? (
                      <Button className="today-primary-action" onClick={() => setPeek(learningAction.target)}>
                        {learningCue.label} <ArrowRight size={15} aria-hidden="true" />
                      </Button>
                    ) : (
                      <Button asChild className="today-primary-action">
                        <Link to={learningAction.to!}>
                          {learningCue.label} <ArrowRight size={15} aria-hidden="true" />
                        </Link>
                      </Button>
                    ))}
                  <Button
                    variant="ghost"
                    onClick={() => {
                      setCaptureOpen(true)
                      requestAnimationFrame(() =>
                        document.querySelector<HTMLElement>('.today-capture textarea')?.focus(),
                      )
                    }}
                  >
                    <Plus size={15} aria-hidden="true" />
                    {workspace('quickCapture')}
                  </Button>
                  <Link className="subtle-link today-study-day" to="/journal">
                    <CalendarRange size={15} /> {t('openStudyDay')} <ArrowRight size={14} />
                  </Link>
                </div>
              </div>
            </section>
            {!data.moodle_configured &&
              notes &&
              notes.notes.length === 0 &&
              Object.keys(data.courses).length === 0 &&
              data.changes.length === 0 &&
              data.deadlines.length === 0 &&
              cardStatus &&
              cardStatus.cards === 0 &&
              pending.length === 0 && (
                <section className="welcome-panel">
                  {setupStatus?.moodle_available === false ? (
                    <h2>{t('welcomeReadyTitle')}</h2>
                  ) : data.moodle_enabled ? (
                    <h2>{t('welcomeConnectMoodleTitle')}</h2>
                  ) : (
                    <h2>{t('welcomePausedTitle')}</h2>
                  )}
                  <p>
                    {setupStatus?.moodle_available === false
                      ? t('welcomeReadyDescription')
                      : data.moodle_enabled
                        ? t('welcomeConnectMoodleDescription')
                        : t('welcomePausedDescription')}
                  </p>
                  <Button asChild>
                    <Link to={setupStatus?.moodle_available === false ? '/notes' : '/system'}>
                      {setupStatus?.moodle_available === false ? t('openFirstNote') : t('viewSetup')}{' '}
                      <ArrowRight size={16} />
                    </Link>
                  </Button>
                </section>
              )}
            {urgentCount > 0 && (
              <Alert className="notice" role={conflictNeedsAttention ? 'alert' : undefined}>
                <Bell className="size-4" />
                <AlertTitle>
                  {conflictNeedsAttention
                    ? t('conflictsTitle')
                    : syncNeedsAttention
                      ? t('syncAttentionTitle')
                      : moodleWarningOnly
                        ? t('moodleAttentionTitle')
                        : t('connectionAttentionTitle')}
                </AlertTitle>
                <AlertDescription>
                  {conflictNeedsAttention ? (
                    <Link to="/system">
                      {t('reviewSavedChanges')} <ArrowRight size={13} className="inline" />
                    </Link>
                  ) : syncNeedsAttention ? (
                    <Link to="/system">
                      {t('checkConnection')} <ArrowRight size={13} className="inline" />
                    </Link>
                  ) : (
                    <Link to="/system">
                      {connectorWarningLink} <ArrowRight size={13} className="inline" />
                    </Link>
                  )}
                  {extraWarnings.length > 0 && (
                    <details className="today-more-notices">
                      <summary>{t('moreNotices', { count: extraWarnings.length })}</summary>
                      {extraWarnings.map((label) => (
                        <p key={label}>
                          <Link to="/system">{label}</Link>
                        </p>
                      ))}
                    </details>
                  )}
                  {connectorWarnings.map((item) => item.message && <p key={item.id}>{item.message}</p>)}
                </AlertDescription>
              </Alert>
            )}
            <div className="today-workspace">
              {!!rulePins?.length && (
                <section className="today-section" aria-labelledby="today-rules-heading">
                  <div className="today-section-heading">
                    <h3 id="today-rules-heading">
                      <Bell size={17} /> {t('fromYourRules')}
                    </h3>
                    <Link to="/rules">
                      {t('viewRules')} <ArrowRight size={15} />
                    </Link>
                  </div>
                  <div className="today-section-rows">
                    {rulePins.slice(0, 3).map((item) => (
                      <div className="today-event" key={item.id}>
                        <span className="today-event-date">{t('rememberedLabel')}</span>
                        <div>
                          <Link to={item.url}>
                            <strong>{item.title}</strong>
                          </Link>
                          <span>{item.rule_name}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </section>
              )}
              {preferences.modules.deadlines && (
                <section className="today-section" aria-labelledby="today-next-heading">
                  <div className="today-section-heading">
                    <h3 id="today-next-heading">
                      <CalendarDays size={17} /> {t('next')}
                    </h3>
                    <Link to="/deadlines">
                      {t('allDeadlines')} <ArrowRight size={15} />
                    </Link>
                  </div>
                  {data.deadlines.length ? (
                    <div className="today-section-rows">
                      {data.deadlines.slice(0, 3).map((item) => (
                        <div className="today-event" key={item.id}>
                          <span className="today-event-date">
                            {localDate(item.due_at, { day: '2-digit', month: '2-digit' })}
                          </span>
                          <div>
                            <button
                              className="today-peek-trigger"
                              type="button"
                              onClick={() =>
                                setPeek({
                                  kind: item.assignment_id ? 'assignment' : 'deadline',
                                  id: item.assignment_id ?? item.id,
                                })
                              }
                            >
                              <strong>{item.title}</strong>
                            </button>
                            {item.course_id && <span>{data.courses[item.course_id]}</span>}
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="today-empty">{t('noUpcomingDeadlines')}</p>
                  )}
                </section>
              )}
              {preferences.modules.notifications && (
                <section className="today-section" aria-labelledby="today-new-heading">
                  <div className="today-section-heading">
                    <h3 id="today-new-heading">
                      <FileClock size={17} /> {t('recentActivity')}
                    </h3>
                    <Link to="/activity">
                      {t('viewAll')} <ArrowRight size={15} />
                    </Link>
                  </div>
                  {data.changes.length ? (
                    <div className="today-section-rows">
                      {data.changes.slice(0, 4).map((item) => (
                        <div className="today-event" key={item.id}>
                          <span className="today-event-date">
                            {localDate(item.created_at, { hour: '2-digit', minute: '2-digit' })}
                          </span>
                          <div>
                            {item.course_id && data.courses[item.course_id] && (
                              <Link to={`/courses/${item.course_id}`} className="today-event-course">
                                {data.courses[item.course_id]}
                              </Link>
                            )}
                            {item.assignment_id ? (
                              <button
                                className="today-peek-trigger"
                                type="button"
                                onClick={() => setPeek({ kind: 'assignment', id: item.assignment_id! })}
                              >
                                <strong>{item.summary}</strong>
                              </button>
                            ) : item.resource_id && item.course_id ? (
                              <Link to={`/courses/${item.course_id}#resource-${item.resource_id}`}>
                                <strong>{item.summary}</strong>
                              </Link>
                            ) : (
                              <strong>{item.summary}</strong>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="today-empty">{t('noNewContent')}</p>
                  )}
                </section>
              )}
            </div>
            {preferences.modules.deadlines && <TimetablePanel compact />}
            <MensaToday />
            {data.moodle_configured && <MoodleRefresh />}
            {preferences.modules.addons && <AddonWidgetSlot slot="today.secondary" />}
            {groupNeedsAttention && (
              <div className="today-group-card">
                <strong>{t('groupAssignmentOpenTitle')}</strong>
                <p>{t('groupAssignmentOpenDescription', { course: data.pending_group_courses[0].name })}</p>
                <Link className="subtle-link" to={`/courses/${data.pending_group_courses[0].id}`}>
                  {t('assignInCourse')} <ArrowRight size={14} />
                </Link>
              </div>
            )}
            <section className="today-capture" aria-label={t('quickCaptureLabel')}>
              {!captureOpen ? (
                <button className="today-capture-prompt" onClick={() => setCaptureOpen(true)}>
                  <span>{t('quickCapturePrompt')}</span>
                  <Plus size={18} />
                </button>
              ) : (
                <div>
                  <div className="today-capture-heading">
                    <strong>{t('quickCaptureLabel')}</strong>
                    <button className="subtle-link" onClick={() => setCaptureOpen(false)}>
                      {t('close')}
                    </button>
                  </div>
                  <JotCapture />
                </div>
              )}
              {pending.length > 0 && (
                <p className="muted-text mt-3" role="status">
                  {t('pendingEntries', { count: pending.length })}
                </p>
              )}
            </section>
            {peek && <TaskPeekDrawer target={peek} onClose={() => setPeek(null)} />}
          </div>
        )
      )}
    </Shell>
  )
}

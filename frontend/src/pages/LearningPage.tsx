// SPDX-License-Identifier: AGPL-3.0-or-later

import { useWorkspaceState } from '@/lib/workspaceState'
import { useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { ArrowRight, MessageCircleQuestion } from 'lucide-react'
import { useT } from '@/i18n/useT'
import { request, useApi } from '@/api'
import { Shell } from '@/components/Shell'
import { AddonWidgetSlot } from '@/addons/AddonWidgetSlot'
import { FocusTimerPanel } from '@/components/FocusTimerPanel'
import { LearningTabs } from '@/components/LearningTabs'
import { LearningStatusPanel } from '@/components/LearningStatusPanel'
import { PracticePanel } from '@/components/PracticePanel'
import { StudyBlocksPanel } from '@/components/StudyBlocksPanel'
import { StudyCyclesPanel } from '@/components/StudyCyclesPanel'
import { WeeklyLearningPanel } from '@/components/WeeklyLearningPanel'
import { TimeBudgetPanel } from '@/components/TimeBudgetPanel'
import { Empty, Failure, Loading, Panel } from '@/components/State'
import { UliBuddy } from '@/components/UliBuddy'
import { Button } from '@/components/ui/button'
import { useWritableHost } from '@/hooks/host'
import { useAnchorScroll } from '@/hooks/useAnchorScroll'
import { MetadataEditor } from '@/components/MetadataEditor'
import { queryClient } from '@/offlineCache'
import type { LearningQuestions, Overview, PracticeItem, StudyBlock } from '@/types'
import type { components } from '@/generated/api'
import { focusPath } from '@/lib/learningFocus'
import { ListPagination } from '@/components/ListPagination'
import { extractApiErrorMessage } from '@/hooks/useApiMutation'

export function LearningPage() {
  const { t } = useT('learning')
  const { t: quality } = useT('quality')
  const { data, error, loading, updatedAt, reload } = useApi<LearningQuestions>('/api/learning/questions')
  const {
    data: practiceItems,
    error: practiceError,
    loading: practiceLoading,
  } = useApi<PracticeItem[]>('/api/learning/practice')
  const { data: cardStatus } = useApi<{ mode: string; due: number }>('/api/anki/study/status')
  const { data: overview } = useApi<Overview>('/api/overview')
  const { data: cycles } = useApi<components['schemas']['CycleView'][]>('/api/learning/cycles')
  const { data: blocks } = useApi<StudyBlock[]>('/api/learning/blocks')
  const canWrite = useWritableHost()
  const location = useLocation()
  const navigate = useNavigate()
  const [questionOffset, setQuestionOffset] = useWorkspaceState('learning:questions:offset', 0)
  const [savedShowResolved, setSavedShowResolved] = useWorkspaceState('learning:resolved', false)
  const [resolvedChoice, setResolvedChoice] = useState<{ locationKey: string; value: boolean } | null>(null)
  const showResolved =
    resolvedChoice?.locationKey === location.key
      ? resolvedChoice.value
      : new URLSearchParams(location.search).get('all') === '1' || savedShowResolved
  function setShowResolved(value: boolean) {
    setSavedShowResolved(value)
    setResolvedChoice({ locationKey: location.key, value })
  }
  const [busyId, setBusyId] = useState<string | null>(null)
  const [saveError, setSaveError] = useState('')
  const questions = (data?.questions ?? []).filter((item) => showResolved || !item.resolved)
  const questionTarget = location.hash.startsWith('#question-') ? location.hash.slice(10) : null
  const targetIndex = questions.findIndex((item) => item.id === questionTarget)
  const questionPageOffset =
    targetIndex >= 0
      ? Math.floor(targetIndex / 10) * 10
      : Math.min(questionOffset, Math.max(0, Math.floor((questions.length - 1) / 10) * 10))
  const openCount = data?.questions.filter((item) => !item.resolved).length ?? 0
  const hasDueCards = cardStatus?.mode === 'integrated' && cardStatus.due > 0
  const hasPractice = Boolean(practiceItems?.length)
  const nextAssignment = overview?.deadlines.find((item) => item.course_id && item.assignment_id)
  const now = Date.now()
  const chronological = (a: string, b: string) => {
    const first = Date.parse(a),
      second = Date.parse(b)
    const firstFuture = first >= now,
      secondFuture = second >= now
    return firstFuture !== secondFuture ? (firstFuture ? -1 : 1) : firstFuture ? first - second : second - first
  }
  const acceptedBlock = blocks
    ?.filter((item) => item.status === 'accepted')
    .sort((a, b) => chronological(a.starts_at, b.starts_at))[0]
  const acceptedCycle = cycles
    ?.filter((item) => item.status === 'accepted')
    .sort((a, b) => chronological(a.ends_at, b.ends_at))[0]
  const nextAction = acceptedBlock
    ? {
        to: focusPath({ kind: 'block', id: acceptedBlock.id }),
        label: t('focusStart'),
        title: t('focusNextTask', { topic: acceptedBlock.topic }),
        hint: acceptedBlock.course_name,
        reason: t('focusAcceptedReason'),
      }
    : acceptedCycle
      ? {
          to: focusPath({ kind: 'cycle', id: acceptedCycle.id }),
          label: t('focusStart'),
          title: acceptedCycle.exam_title,
          hint: acceptedCycle.course_name,
          reason: t('focusAcceptedReason'),
        }
      : hasDueCards
        ? {
            to: '/study',
            label: t('nextActionReviewCards'),
            title: t('nextStepCardsWaiting', { count: cardStatus.due }),
            hint: t('nextStepCardsHint'),
            reason: quality('dueReason', { count: cardStatus.due }),
          }
        : hasPractice
          ? {
              to: '#learning-practice',
              label: t('nextActionChoosePractice'),
              title: t('practiceTitle'),
              hint: t('practiceIntro'),
              reason: quality('practiceReason', { count: practiceItems?.length ?? 0 }),
            }
          : nextAssignment
            ? {
                to: `/courses/${nextAssignment.course_id}#assignment-${nextAssignment.assignment_id}`,
                label: t('nextActionViewAssignment'),
                title: t('nextStepToday', { topic: nextAssignment.title }),
                hint: t('nextStepDeadlineHint'),
                reason: quality('deadlineReason'),
              }
            : {
                to: '/study',
                label: t('nextActionOpenFlashcards'),
                title: t('nextStepChoose'),
                hint: t('nextStepDefaultHint'),
                reason: quality('startReason'),
              }
  useAnchorScroll(Boolean(data))

  async function changeResolved(item: LearningQuestions['questions'][number]) {
    setBusyId(item.id)
    setSaveError('')
    try {
      await request(`/api/material/annotations/${item.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ expected_revision: item.revision, comment: item.comment, resolved: !item.resolved }),
      })
      reload()
      void queryClient.invalidateQueries({ queryKey: ['api', `/api/courses/${item.course_id}/material`] })
      void queryClient.invalidateQueries({ queryKey: ['api', `/api/material/${item.version_id}`] })
    } catch (cause) {
      setSaveError(extractApiErrorMessage(cause))
    } finally {
      setBusyId(null)
    }
  }

  return (
    <Shell title={t('pageTitle')} eyebrow={t('pageEyebrow')} cachedAt={updatedAt}>
      <LearningTabs />
      <section className="learning-now" aria-labelledby="learning-now-title">
        <UliBuddy mood="focus" size={56} className="learning-mascot" />
        <div className="learning-now-text">
          <span className="learning-now-kicker">{t('nextStepKicker')}</span>
          <h2 id="learning-now-title">{nextAction.title}</h2>
          <p>{nextAction.hint}</p>
          <details className="recommendation-reason">
            <summary>{quality('whyThis')}</summary>
            <p>{nextAction.reason}</p>
          </details>
        </div>
        <Button asChild>
          <Link to={nextAction.to}>
            {nextAction.label} <ArrowRight size={16} />
          </Link>
        </Button>
      </section>
      {(Boolean(cycles?.length) || Boolean(blocks?.length)) && (
        <div className="learning-focus-grid">
          {Boolean(cycles?.length) && <StudyCyclesPanel />}
          {Boolean(blocks?.length) && <StudyBlocksPanel />}
        </div>
      )}
      <div className="learning-sections">
        <div className="learning-column" id="learning-practice">
          {(practiceLoading || practiceError || hasPractice) && (
            <PracticePanel
              courseId={
                Number(new URLSearchParams(location.search).get('course_id')) || acceptedBlock?.course_id || undefined
              }
              previewLimit={new URLSearchParams(location.search).get('practice') === 'all' ? undefined : 5}
            />
          )}
          <Panel title={t('openQuestionsTitle')} action={<MessageCircleQuestion size={20} />}>
            <p className="muted-text mb-4">{t('openQuestionsCount', { count: openCount })}</p>
            <label className="mb-4 flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={showResolved}
                onChange={(event) => setShowResolved(event.target.checked)}
              />
              {t('showResolvedLabel')}
            </label>
            {saveError && (
              <p role="alert" className="mb-4 text-destructive">
                {saveError}
              </p>
            )}
            {loading && !data ? (
              <Loading />
            ) : error ? (
              <Failure message={error} />
            ) : questions.length ? (
              <div className="row-list">
                {questions.slice(questionPageOffset, questionPageOffset + 10).map((item) => (
                  <div className="data-row" key={item.id} id={`question-${item.id}`} tabIndex={-1}>
                    <MessageCircleQuestion size={17} className="row-icon" />
                    <div>
                      <Link to={`/material/${item.version_id}#annotation-${item.id}`}>
                        {item.comment || item.quote}
                      </Link>
                      <span className="row-subtitle">
                        <Link to={`/courses/${item.course_id}`}>{item.course_name}</Link> · {item.resource_name} ·{' '}
                        {t('originPage', { page: item.source_page })}
                        {item.resolved ? t('resolvedSuffix') : ''}
                      </span>
                      {item.comment && <p className="muted-text mt-1">{item.quote}</p>}
                      {item.approved_explanation && (
                        <div className="mt-2 rounded-lg border border-border bg-background p-3">
                          <strong className="text-sm">{t('approvedExplanationTitle')}</strong>
                          <p className="mt-1 whitespace-pre-wrap text-sm">{item.approved_explanation}</p>
                        </div>
                      )}
                      <Button
                        size="sm"
                        variant="outline"
                        className="mt-2"
                        disabled={!canWrite || busyId !== null}
                        onClick={() => void changeResolved(item)}
                      >
                        {item.resolved ? t('reopenQuestion') : t('markResolved')}
                      </Button>
                      <MetadataEditor kind="question" id={item.id} />
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <Empty
                icon={MessageCircleQuestion}
                title={data?.questions.length ? t('questionsEmptyTitleWithData') : t('questionsEmptyTitleNoData')}
                text={t('questionsEmptyText')}
              />
            )}
            <ListPagination
              page={{
                offset: questionPageOffset,
                limit: 10,
                total: questions.length,
                has_more: questionPageOffset + 10 < questions.length,
              }}
              onPage={(offset) => {
                setQuestionOffset(offset)
                if (questionTarget)
                  navigate({ pathname: location.pathname, search: location.search, hash: '' }, { replace: true })
              }}
            />
          </Panel>
        </div>
        <div className="learning-column">
          <LearningStatusPanel />
        </div>
      </div>
      <section className="learning-planning">
        <h2>{t('planningTitle')}</h2>
        <div className="learning-planning-grid">
          <WeeklyLearningPanel />
          <TimeBudgetPanel />
        </div>
        <FocusTimerPanel hideWhenEmpty />
        <Link className="subtle-link" to="/analytics">
          {t('viewLearningAnalytics')}
        </Link>
      </section>
      <AddonWidgetSlot slot="learning.tools" />
    </Shell>
  )
}

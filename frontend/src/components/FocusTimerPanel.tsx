// SPDX-License-Identifier: AGPL-3.0-or-later

import { useEffect, useRef, useState } from 'react'
import { CheckCircle2, Pause, Play, Square, Timer } from 'lucide-react'
import { useT } from '@/i18n/useT'
import i18n from '@/i18n'
import { dateFromApi, useApi } from '@/api'
import { Empty, Failure, Loading, Panel } from '@/components/State'
import { Button } from '@/components/ui/button'
import './FocusTimerPanel.css'
import {
  type FocusTimerState,
  formatClock,
  formatRemainingMinutesLabel,
  isFinished,
  isPaused,
  isSameLocalDay,
  pauseTimer,
  progressRatio,
  remainingSeconds,
  resumeTimer,
  startTimer,
} from '@/lib/focusTimer'
import type { StudyBlock } from '@/types'
import { useFocusTimerState } from '@/lib/focusTimerState'

/**
 * Runs outside any component (from an effect), so it uses the shared `i18n`
 * instance's `t` directly instead of `useT`, matching the pattern already
 * used by `request()` in `@/api` for non-hook contexts.
 */
function notifyCompletion(topic: string): void {
  try {
    if (typeof Notification !== 'undefined' && Notification.permission === 'granted') {
      void new Notification(i18n.t('learning:focusTimerNotificationTitle'), {
        body: i18n.t('learning:focusTimerNotificationBody', { topic }),
      })
    }
  } catch {
    /* Notifications not available in this context (unsupported browser, blocked, ...). */
  }
}

function FocusTimerFace({ state, now, finished, minuteLabel, onPause, onResume, onStop }: {
  state: FocusTimerState
  now: number
  finished: boolean
  minuteLabel: string
  onPause: () => void
  onResume: () => void
  onStop: () => void
}) {
  const { t } = useT('learning')
  const paused = isPaused(state)
  return (
    <div className="focus-timer-face">
      {finished ? (
        <div className="focus-timer-done" role="status">
          <CheckCircle2 size={18} aria-hidden="true" /> {t('focusTimerDoneStatus', { topic: state.topic })}
        </div>
      ) : (
        <>
          <div className="focus-timer-progress" aria-hidden="true">
            <div className="focus-timer-progress-fill" style={{ width: `${progressRatio(state, now) * 100}%` }} />
          </div>
          <span className="focus-timer-clock" aria-hidden="true">{formatClock(remainingSeconds(state, now))}</span>
          {paused ? (
            <Button size="sm" variant="outline" onClick={onResume} aria-label={t('focusTimerResumeAriaLabel', { topic: state.topic })}>
              <Play size={14} /> {t('focusTimerResume')}
            </Button>
          ) : (
            <Button size="sm" variant="outline" onClick={onPause} aria-label={t('focusTimerPauseAriaLabel', { topic: state.topic })}>
              <Pause size={14} /> {t('focusTimerPause')}
            </Button>
          )}
        </>
      )}
      <Button size="sm" variant="outline" onClick={onStop} aria-label={t('focusTimerStopAriaLabel', { topic: state.topic })}>
        <Square size={14} /> {t('focusTimerStop')}
      </Button>
      <span className="sr-only" role="status" aria-live="polite">{minuteLabel}</span>
    </div>
  )
}

export type FocusTimerBlock = Pick<StudyBlock, 'id' | 'topic' | 'course_name' | 'duration_minutes' | 'starts_at' | 'status'>

/**
 * Existing accepted work shares one timer; the overview may discover today's blocks.
 * With `hideWhenEmpty` the panel disappears on days without a block instead of showing an empty state.
 */
export function FocusTimerPanel({ blockId, acceptedBlock, hideWhenEmpty = false }: { blockId?: number; acceptedBlock?: FocusTimerBlock; hideWhenEmpty?: boolean } = {}) {
  const { t } = useT('learning')
  const overview = useApi<StudyBlock[]>('/api/learning/blocks', { enabled: !acceptedBlock })
  const data = acceptedBlock ? [acceptedBlock] : overview.data
  const error = acceptedBlock ? null : overview.error
  const loading = !acceptedBlock && overview.loading
  const [timer, setTimer] = useFocusTimerState()
  const [now, setNow] = useState(() => Date.now())
  const [minuteLabel, setMinuteLabel] = useState('')
  const notifiedRef = useRef(false)

  useEffect(() => {
    const interval = window.setInterval(() => setNow(Date.now()), 1000)
    return () => window.clearInterval(interval)
  }, [])

  useEffect(() => {
    if (!timer) {
      setMinuteLabel('')
      return
    }
    const label = formatRemainingMinutesLabel(remainingSeconds(timer, now), t)
    setMinuteLabel((current) => (current === label ? current : label))
  }, [timer, now, t])

  useEffect(() => {
    if (!timer) {
      notifiedRef.current = false
      return
    }
    if (!isPaused(timer) && isFinished(timer, now)) {
      if (!notifiedRef.current) {
        notifiedRef.current = true
        notifyCompletion(timer.topic)
      }
    } else {
      notifiedRef.current = false
    }
  }, [timer, now])

  const todaysBlocks = (data ?? []).filter(
    (block) => block.status === 'accepted' && (blockId !== undefined ? block.id === blockId
      : isSameLocalDay(dateFromApi(block.starts_at), new Date(now))),
  )
  const timerOutsideSelection = timer && !todaysBlocks.some(block => block.id === timer.blockId)

  function start(block: FocusTimerBlock) {
    setTimer(startTimer(
      { id: block.id, topic: block.topic, courseName: block.course_name, durationMinutes: block.duration_minutes },
      Date.now(),
    ))
  }

  if (hideWhenEmpty && !loading && !error && !todaysBlocks.length && !timer) return null

  return (
    <Panel title={t(blockId === undefined ? 'focusTimerTodayTitle' : 'focusTimerContextTitle')} action={<Timer size={20} />}>
      <p className="muted-text mb-4">{t(blockId === undefined ? 'focusTimerIntro' : 'focusTimerContextIntro')}</p>
      {timerOutsideSelection && timer && <div className="data-row focus-timer-row mb-4">
        <p className="muted-text">{t('focusTimerOtherBlock', { topic: timer.topic, course: timer.courseName })}</p>
        <FocusTimerFace state={timer} now={now} finished={isFinished(timer, now)} minuteLabel={minuteLabel}
          onPause={() => setTimer(current => current ? pauseTimer(current, Date.now()) : current)}
          onResume={() => setTimer(current => current ? resumeTimer(current, Date.now()) : current)}
          onStop={() => setTimer(null)} />
      </div>}
      {loading && !data ? (
        <Loading />
      ) : error ? (
        <Failure message={error} />
      ) : todaysBlocks.length ? (
        <div className="row-list">
          {todaysBlocks.map((block) => {
            const isActive = timer?.blockId === block.id
            return (
              <div className="data-row focus-timer-row" key={block.id}>
                <div className="min-w-0 flex-1">
                  <strong>{block.topic}</strong>
                  <span className="row-subtitle">{t('focusTimerBlockMeta', { course: block.course_name, minutes: block.duration_minutes })}</span>
                </div>
                {isActive && timer ? (
                  <FocusTimerFace
                    state={timer}
                    now={now}
                    finished={isFinished(timer, now)}
                    minuteLabel={minuteLabel}
                    onPause={() => setTimer((current) => (current ? pauseTimer(current, Date.now()) : current))}
                    onResume={() => setTimer((current) => (current ? resumeTimer(current, Date.now()) : current))}
                    onStop={() => setTimer(null)}
                  />
                ) : (
                  <Button size="sm" disabled={timer !== null} onClick={() => start(block)}>
                    <Play size={14} /> {t('focusTimerStart')}
                  </Button>
                )}
              </div>
            )
          })}
        </div>
      ) : (
        <Empty icon={Timer} title={t(blockId === undefined ? 'focusTimerEmptyTitle' : 'focusContextUnavailable')}
          text={t(blockId === undefined ? 'focusTimerEmptyText' : 'focusTimerContextEmptyText')} />
      )}
    </Panel>
  )
}

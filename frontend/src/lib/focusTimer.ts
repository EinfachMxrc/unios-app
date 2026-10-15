// SPDX-License-Identifier: AGPL-3.0-or-later

/**
 * Pure timer math for the focus timer on a study block (Bauauftrag §24.6).
 *
 * Every function here takes "now" as an explicit epoch-millisecond argument
 * instead of reading `Date.now()` itself, so the whole module is a plain,
 * synchronous, side-effect-free calculator: no timers, no I/O, no global
 * state. The component that renders the countdown owns the interval that
 * re-computes these values and the localStorage persistence of the state
 * object; this module only ever answers "given this state and this instant,
 * what's true right now".
 */

import type { TypedT } from '@/i18n/useT'

export interface FocusTimerState {
  /** The study block this timer belongs to, kept for resilience across reloads. */
  blockId: number
  topic: string
  courseName: string
  /** Total planned duration, fixed at start; never changed by pause/resume. */
  durationSeconds: number
  /** Epoch ms when the timer was started. */
  startedAt: number
  /** Epoch ms when the timer was paused, or null while running. */
  pausedAt: number | null
  /** Total milliseconds already spent paused, excluding any pause in progress. */
  accumulatedPauseMs: number
}

export interface FocusTimerBlock {
  id: number
  topic: string
  courseName: string
  durationMinutes: number
}

export function startTimer(block: FocusTimerBlock, now: number): FocusTimerState {
  return {
    blockId: block.id,
    topic: block.topic,
    courseName: block.courseName,
    durationSeconds: Math.max(0, Math.round(block.durationMinutes * 60)),
    startedAt: now,
    pausedAt: null,
    accumulatedPauseMs: 0,
  }
}

export function isPaused(state: FocusTimerState): boolean {
  return state.pausedAt !== null
}

export function pauseTimer(state: FocusTimerState, now: number): FocusTimerState {
  if (isPaused(state)) return state
  return { ...state, pausedAt: now }
}

export function resumeTimer(state: FocusTimerState, now: number): FocusTimerState {
  if (!isPaused(state)) return state
  const pausedFor = now - (state.pausedAt as number)
  return { ...state, pausedAt: null, accumulatedPauseMs: state.accumulatedPauseMs + Math.max(0, pausedFor) }
}

function pausedMsSoFar(state: FocusTimerState, now: number): number {
  const ongoing = isPaused(state) ? Math.max(0, now - (state.pausedAt as number)) : 0
  return state.accumulatedPauseMs + ongoing
}

/** Whole seconds actually spent running (never negative, never above the total duration). */
export function elapsedSeconds(state: FocusTimerState, now: number): number {
  const elapsedMs = now - state.startedAt - pausedMsSoFar(state, now)
  return Math.min(state.durationSeconds, Math.max(0, Math.floor(elapsedMs / 1000)))
}

/** Whole seconds left, rounded up so the display never shows 0:00 before time is actually up. */
export function remainingSeconds(state: FocusTimerState, now: number): number {
  return Math.max(0, state.durationSeconds - elapsedSeconds(state, now))
}

export function isFinished(state: FocusTimerState, now: number): boolean {
  return remainingSeconds(state, now) <= 0
}

/** Fraction of the block already elapsed, from 0 to 1, for a progress bar/ring. */
export function progressRatio(state: FocusTimerState, now: number): number {
  if (state.durationSeconds <= 0) return 1
  return Math.min(1, Math.max(0, elapsedSeconds(state, now) / state.durationSeconds))
}

/** "12:03" countdown text for the visible timer face. */
export function formatClock(totalSeconds: number): string {
  const safe = Math.max(0, Math.round(totalSeconds))
  const minutes = Math.floor(safe / 60)
  const seconds = safe % 60
  return `${minutes}:${String(seconds).padStart(2, '0')}`
}

/**
 * Minute-granularity text for the `aria-live="polite"` region, which must
 * update at most once a minute rather than every second.
 *
 * Takes the caller's `t` (from `useT('learning')`) rather than importing the
 * i18n instance directly, keeping this module a plain, hook-free calculator
 * like the rest of the file.
 */
export function formatRemainingMinutesLabel(totalSeconds: number, t: TypedT<'learning'>): string {
  const minutes = Math.ceil(Math.max(0, totalSeconds) / 60)
  if (minutes <= 0) return t('focusTimerDone')
  return t('focusTimerMinutesLeft', { count: minutes })
}

/** True when both instants fall on the same calendar day in the local timezone. */
export function isSameLocalDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate()
}

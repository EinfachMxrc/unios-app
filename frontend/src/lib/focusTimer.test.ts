// SPDX-License-Identifier: AGPL-3.0-or-later

import { describe, expect, it } from 'vitest'
import i18n from '@/i18n'
import type { TypedT } from '@/i18n/useT'
import {
  elapsedSeconds,
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
} from './focusTimer'

const BLOCK = { id: 1, topic: 'Rekursion', courseName: 'Programmieren 1', durationMinutes: 10 }
const START = 1_000_000
// German is bundled synchronously (see src/i18n/index.ts), so a fixed `t`
// for it is available immediately without awaiting `i18nReady`.
const tDe = i18n.getFixedT('de', 'learning') as unknown as TypedT<'learning'>

describe('startTimer', () => {
  it('starts with the full duration remaining and not paused', () => {
    const state = startTimer(BLOCK, START)
    expect(remainingSeconds(state, START)).toBe(600)
    expect(elapsedSeconds(state, START)).toBe(0)
    expect(isPaused(state)).toBe(false)
  })

  it('rounds a fractional minute duration to whole seconds', () => {
    const state = startTimer({ ...BLOCK, durationMinutes: 1.5 }, START)
    expect(state.durationSeconds).toBe(90)
  })
})

describe('remainingSeconds / elapsedSeconds', () => {
  it('counts down as time passes', () => {
    const state = startTimer(BLOCK, START)
    expect(remainingSeconds(state, START + 90_000)).toBe(510)
    expect(elapsedSeconds(state, START + 90_000)).toBe(90)
  })

  it('never goes below zero once the duration has fully elapsed', () => {
    const state = startTimer(BLOCK, START)
    expect(remainingSeconds(state, START + 10 * 60_000 + 5_000)).toBe(0)
    expect(elapsedSeconds(state, START + 10 * 60_000 + 5_000)).toBe(600)
  })
})

describe('pauseTimer / resumeTimer', () => {
  it('freezes the remaining time while paused', () => {
    let state = startTimer(BLOCK, START)
    state = pauseTimer(state, START + 60_000)
    expect(isPaused(state)).toBe(true)
    // A lot of wall-clock time passes while paused; remaining time must not move.
    expect(remainingSeconds(state, START + 60_000 + 5 * 60_000)).toBe(540)
  })

  it('resumes counting down from where it left off', () => {
    let state = startTimer(BLOCK, START)
    state = pauseTimer(state, START + 60_000) // 60s elapsed, 540s left
    state = resumeTimer(state, START + 60_000 + 5 * 60_000) // paused for 5 minutes
    expect(isPaused(state)).toBe(false)
    // 30s after resuming, only 90s of running time have passed in total.
    const laterNow = START + 60_000 + 5 * 60_000 + 30_000
    expect(elapsedSeconds(state, laterNow)).toBe(90)
    expect(remainingSeconds(state, laterNow)).toBe(510)
  })

  it('pausing twice in a row is a no-op', () => {
    let state = startTimer(BLOCK, START)
    state = pauseTimer(state, START + 60_000)
    const pausedAgain = pauseTimer(state, START + 90_000)
    expect(pausedAgain).toEqual(state)
  })

  it('resuming a timer that is not paused is a no-op', () => {
    const state = startTimer(BLOCK, START)
    const resumed = resumeTimer(state, START + 60_000)
    expect(resumed).toEqual(state)
  })

  it('supports multiple pause/resume cycles', () => {
    let state = startTimer(BLOCK, START)
    state = pauseTimer(state, START + 100_000) // 100s elapsed
    state = resumeTimer(state, START + 200_000) // paused 100s
    state = pauseTimer(state, START + 300_000) // another 100s elapsed (200s total)
    state = resumeTimer(state, START + 500_000) // paused 200s (300s total pause)
    expect(elapsedSeconds(state, START + 600_000)).toBe(300)
  })
})

describe('isFinished', () => {
  it('is false before the duration elapses and true at or after it', () => {
    const state = startTimer(BLOCK, START)
    expect(isFinished(state, START + 599_000)).toBe(false)
    expect(isFinished(state, START + 600_000)).toBe(true)
    expect(isFinished(state, START + 700_000)).toBe(true)
  })
})

describe('progressRatio', () => {
  it('goes from 0 to 1 across the duration', () => {
    const state = startTimer(BLOCK, START)
    expect(progressRatio(state, START)).toBe(0)
    expect(progressRatio(state, START + 300_000)).toBeCloseTo(0.5)
    expect(progressRatio(state, START + 600_000)).toBe(1)
    expect(progressRatio(state, START + 700_000)).toBe(1)
  })

  it('treats a zero-length block as immediately complete', () => {
    const state = startTimer({ ...BLOCK, durationMinutes: 0 }, START)
    expect(progressRatio(state, START)).toBe(1)
  })
})

describe('formatClock', () => {
  it('formats minutes and seconds with a zero-padded seconds part', () => {
    expect(formatClock(600)).toBe('10:00')
    expect(formatClock(65)).toBe('1:05')
    expect(formatClock(5)).toBe('0:05')
    expect(formatClock(0)).toBe('0:00')
  })

  it('clamps negative input to zero', () => {
    expect(formatClock(-5)).toBe('0:00')
  })
})

describe('formatRemainingMinutesLabel', () => {
  it('uses singular phrasing for exactly one minute', () => {
    expect(formatRemainingMinutesLabel(60, tDe)).toBe('Noch 1 Minute')
  })

  it('rounds up a partial minute so it never underclaims time left', () => {
    expect(formatRemainingMinutesLabel(61, tDe)).toBe('Noch 2 Minuten')
    expect(formatRemainingMinutesLabel(119, tDe)).toBe('Noch 2 Minuten')
  })

  it('reports completion at zero seconds left', () => {
    expect(formatRemainingMinutesLabel(0, tDe)).toBe('Fertig')
  })
})

describe('isSameLocalDay', () => {
  it('is true for two timestamps on the same calendar day', () => {
    expect(isSameLocalDay(new Date(2026, 8, 27, 8, 0), new Date(2026, 8, 27, 23, 59))).toBe(true)
  })

  it('is false across midnight', () => {
    expect(isSameLocalDay(new Date(2026, 8, 27, 23, 59), new Date(2026, 8, 28, 0, 0))).toBe(false)
  })

  it('is false across a year boundary even with matching month/day', () => {
    expect(isSameLocalDay(new Date(2025, 8, 27), new Date(2026, 8, 27))).toBe(false)
  })
})

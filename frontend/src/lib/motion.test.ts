// SPDX-License-Identifier: AGPL-3.0-or-later
// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { motionDuration, waitForMotion } from './motion'

afterEach(() => {
  delete document.documentElement.dataset.reduceMotion
  vi.unstubAllGlobals()
  vi.useRealTimers()
})

describe('motion preferences', () => {
  it('honours either OS or app reduced motion and rechecks changing preferences', () => {
    let osReduced = false
    vi.stubGlobal('matchMedia', () => ({ matches: osReduced }))
    expect(motionDuration(160)).toBe(160)
    document.documentElement.dataset.reduceMotion = 'true'
    expect(motionDuration(160)).toBe(0)
    document.documentElement.dataset.reduceMotion = 'false'
    osReduced = true
    expect(motionDuration(160)).toBe(0)
    osReduced = false
    expect(motionDuration(160)).toBe(160)
  })
  it('does not schedule a closing delay when app motion is reduced', async () => {
    vi.useFakeTimers()
    document.documentElement.dataset.reduceMotion = 'true'
    await waitForMotion(160)
    expect(vi.getTimerCount()).toBe(0)
  })
  it('waits for the requested animation when both preferences allow it', async () => {
    vi.useFakeTimers()
    vi.stubGlobal('matchMedia', () => ({ matches: false }))
    const complete = vi.fn()
    const pending = waitForMotion(160).then(complete)
    await vi.advanceTimersByTimeAsync(159)
    expect(complete).not.toHaveBeenCalled()
    await vi.advanceTimersByTimeAsync(1)
    await pending
    expect(complete).toHaveBeenCalledOnce()
  })
})

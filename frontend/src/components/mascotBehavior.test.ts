// SPDX-License-Identifier: AGPL-3.0-or-later

import { describe, expect, it } from 'vitest'
import { PUPIL_REACH, mascotLine, pupilOffset } from './mascotBehavior'

describe('mascotLine', () => {
  it('starts with what fits the mood, then cycles through the tips', () => {
    expect([0, 1, 2, 3].map(click => mascotLine('sleepy', click))).toEqual(['sleepy1', 'sleepy2', 'tip1', 'tip2'])
    expect(mascotLine('focus', 0)).toBe('focus1')
    expect(mascotLine('awake', 0)).toBe('tip1')
  })
  it('wraps around after the last line', () => {
    expect(mascotLine('cheer', 8)).toBe('cheer1')
    expect(mascotLine('awake', 6)).toBe('tip1')
  })
})

describe('pupilOffset', () => {
  it('looks towards the pointer and never further than the eye allows', () => {
    const far = pupilOffset({ x: 1000, y: 0 }, { x: 0, y: 0 })
    expect(far).toEqual({ x: PUPIL_REACH, y: 0 })
    const diagonal = pupilOffset({ x: -500, y: -500 }, { x: 0, y: 0 })
    expect(Math.hypot(diagonal.x, diagonal.y)).toBeLessThanOrEqual(PUPIL_REACH + 0.1)
    expect(diagonal.x).toBeLessThan(0)
    expect(diagonal.y).toBeLessThan(0)
  })
  it('barely moves for a pointer right at the owl', () => {
    expect(pupilOffset({ x: 0, y: 0 }, { x: 0, y: 0 })).toEqual({ x: 0, y: 0 })
    expect(pupilOffset({ x: 12, y: 0 }, { x: 0, y: 0 }).x).toBeLessThan(1)
  })
})

// SPDX-License-Identifier: AGPL-3.0-or-later
// @vitest-environment jsdom

import { cleanup, render } from '@testing-library/react'
import { afterEach, expect, it } from 'vitest'
import { Mascot, mascotMoodFor } from './Mascot'

afterEach(cleanup)

it('picks the mood from the moment: night first, then due reviews, then a clear day', () => {
  expect(mascotMoodFor({ hour: 23, dueCards: 5, openTasks: 2 })).toBe('sleepy')
  expect(mascotMoodFor({ hour: 3, dueCards: 0, openTasks: 0 })).toBe('sleepy')
  expect(mascotMoodFor({ hour: 9, dueCards: 5, openTasks: 0 })).toBe('focus')
  expect(mascotMoodFor({ hour: 9, dueCards: 0, openTasks: 0 })).toBe('cheer')
  expect(mascotMoodFor({ hour: 14, dueCards: 0, openTasks: 3 })).toBe('awake')
})

it('is decorative, so screen readers skip it', () => {
  const { container } = render(<Mascot mood="focus" />)
  const svg = container.querySelector('svg')!
  expect(svg.getAttribute('aria-hidden')).toBe('true')
  expect(svg.classList.contains('mascot-focus')).toBe(true)
})

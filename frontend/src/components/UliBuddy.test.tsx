// SPDX-License-Identifier: AGPL-3.0-or-later
// @vitest-environment jsdom

import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { UliBuddy } from './UliBuddy'

vi.mock('@/i18n/useT', () => ({ useT: () => ({ t: (key: string) => key }) }))

beforeEach(() => { vi.useFakeTimers() })
afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

const owl = () => screen.getByRole('button', { name: 'mascot.label' })
const svg = () => owl().querySelector('svg')!

it('is a real button that says what it does', () => {
  render(<UliBuddy mood="awake" />)
  expect(owl().getAttribute('type')).toBe('button')
  expect(svg().getAttribute('aria-hidden')).toBe('true')
})

it('opens its eyes when you come close, even when it was asleep', () => {
  render(<UliBuddy mood="sleepy" />)
  expect(svg().querySelector('.mascot-eyes')).toBeNull()
  fireEvent.pointerEnter(owl())
  expect(svg().classList.contains('mascot-wide')).toBe(true)
  expect(svg().querySelector('.mascot-eyes')).not.toBeNull()
  fireEvent.pointerLeave(owl())
  expect(svg().querySelector('.mascot-eyes')).toBeNull()
})

it('also wakes up for the keyboard', () => {
  render(<UliBuddy mood="sleepy" />)
  fireEvent.focus(owl())
  expect(svg().classList.contains('mascot-wide')).toBe(true)
})

it('waves and says what fits the moment, then a tip, then falls quiet', () => {
  render(<UliBuddy mood="focus" />)
  const bubble = screen.getByRole('status')
  expect(bubble.textContent).toBe('')
  fireEvent.click(owl())
  expect(bubble.textContent).toBe('mascot.focus1')
  expect(svg().classList.contains('mascot-waving')).toBe(true)
  act(() => { vi.advanceTimersByTime(1000) })
  expect(svg().classList.contains('mascot-waving')).toBe(false)
  fireEvent.click(owl())
  fireEvent.click(owl())
  expect(bubble.textContent).toBe('mascot.tip1')
  act(() => { vi.advanceTimersByTime(6000) })
  expect(bubble.textContent).toBe('')
})

it('gets dizzy when clicked four times in a row', () => {
  const { container } = render(<UliBuddy mood="awake" />)
  for (let i = 0; i < 4; i++) fireEvent.click(owl())
  expect(container.querySelector('.uli-buddy')!.classList.contains('is-dizzy')).toBe(true)
  act(() => { vi.advanceTimersByTime(900) })
  expect(container.querySelector('.uli-buddy')!.classList.contains('is-dizzy')).toBe(false)
})

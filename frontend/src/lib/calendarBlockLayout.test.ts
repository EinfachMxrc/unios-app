// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, expect, it } from 'vitest'
import { calendarBlockLines } from './calendarBlockLayout'

describe('calendar block density', () => {
  it('retains one title in short blocks and adds complete lines only when they fit', () => {
    expect(calendarBlockLines(16)).toBe(1)
    expect(calendarBlockLines(24)).toBe(1)
    expect(calendarBlockLines(40)).toBe(1)
    expect(calendarBlockLines(44)).toBe(2)
    expect(calendarBlockLines(62)).toBe(3)
    expect(calendarBlockLines(80)).toBe(4)
  })
  it('respects enlarged text without extending the event time geometry', () => {
    expect(calendarBlockLines(44, 1.5)).toBe(1)
    expect(calendarBlockLines(62, 1.5)).toBe(2)
    expect(calendarBlockLines(86, 1.5)).toBe(3)
    expect(calendarBlockLines(44, NaN)).toBe(2)
  })
  it('keeps all metadata in the agenda without a height constraint', () => {
    expect(calendarBlockLines(undefined, 1.5)).toBe(4)
  })
})

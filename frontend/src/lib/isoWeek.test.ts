// SPDX-License-Identifier: AGPL-3.0-or-later

import { expect, test } from 'vitest'
import { isoWeek } from './isoWeek'

test('numbers weeks across year boundaries like the calendar does', () => {
  expect(isoWeek('2026-11-25')).toBe(48)
  expect(isoWeek('2026-01-01')).toBe(1)
  expect(isoWeek('2027-01-01')).toBe(53)
  expect(isoWeek('2027-01-04')).toBe(1)
  expect(isoWeek('2024-12-30')).toBe(1)
})

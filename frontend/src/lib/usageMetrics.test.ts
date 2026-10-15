// SPDX-License-Identifier: AGPL-3.0-or-later
// @vitest-environment jsdom
import { beforeEach, expect, it } from 'vitest'
import { allowUsageMetrics, recordPage, usageMetrics } from './usageMetrics'
beforeEach(() => localStorage.clear())
it('records nothing without consent and erases counters when revoked', () => {
  recordPage('/search?q=private-title')
  expect(localStorage.length).toBe(0)
  allowUsageMetrics(true)
  recordPage('/courses/123?token=invented')
  recordPage('/notes/private-title')
  expect(usageMetrics().counters).toEqual({ courses: 1, notes: 1 })
  expect(localStorage.getItem('unios-optional-usage-v1')).not.toMatch(/123|token|private-title/)
  allowUsageMetrics(false)
  recordPage('/notes/123')
  expect(usageMetrics()).toEqual({ enabled: false, counters: {} })
})
it('only exports bounded known counters even if storage is manipulated', () => {
  localStorage.setItem(
    'unios-optional-usage-v1',
    JSON.stringify({ enabled: true, counters: { search: 4, unknown: 'secret', notes: -1, other: 99999999 } }),
  )
  expect(usageMetrics().counters).toEqual({ search: 4 })
})

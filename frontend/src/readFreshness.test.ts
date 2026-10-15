// SPDX-License-Identifier: AGPL-3.0-or-later

import { describe, expect, it } from 'vitest'
import { readFreshness } from './readFreshness'

describe('navigation read freshness', () => {
  it('reuses shared reads briefly without mixing query scopes', () => {
    expect(readFreshness('/api/courses')).toBe(30_000)
    expect(readFreshness('/api/learning/assessment/tasks?course_id=8')).toBe(30_000)
    expect(readFreshness('/api/anki/study/status')).toBe(30_000)
    expect(readFreshness('/api/notifications')).toBe(10_000)
  })
  it.each([
    '/api/host', '/api/host/conflicts', '/api/client/status', '/api/setup/status',
    '/api/recovery/status', '/api/auth/session', '/api/learning/coding/runner',
    '/api/learning/coding/tasks/42', '/api/learning/assessment/tasks/42',
    '/api/learning/assessment/exams', '/api/learning/assessment/exams/4',
    '/api/learning/assessment/requests/5', '/api/jobs/42', '/api/unknown',
  ])('never delays freshness of checks or live work: %s', path => {
    expect(readFreshness(path)).toBe(0)
  })
})

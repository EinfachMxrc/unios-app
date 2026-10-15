// SPDX-License-Identifier: AGPL-3.0-or-later

import { expect, it } from 'vitest'
import { mayCache } from './offlineCache'

it('caches only bounded accepted-focus metadata paths', () => {
  for (const path of ['/api/learning/focus/block/3', '/api/learning/focus/cycle/42']) {
    expect(mayCache(path)).toBe(true)
  }
  for (const path of [
    '/api/learning/focus/block/0',
    '/api/learning/focus/block/-1',
    '/api/learning/focus/block/01',
    '/api/learning/focus/cycle/1.5',
    '/api/learning/focus/block/9007199254740992',
    '/api/learning/focus/block/3/private',
    '/api/learning/focus/cycle/3?private=true',
    '/api/learning/focus/course/3',
    '/api/learning/practice',
    '/api/learning/focus',
  ]) {
    expect(mayCache(path)).toBe(false)
  }
})

it('keeps the offline cache limited to allowed study read endpoints', () => {
  for (const path of [
    '/api/overview',
    '/api/courses',
    '/api/courses/42',
    '/api/deadlines',
    '/api/activity?kind=new',
    '/api/search?q=Text',
    '/api/notes/link-targets?titles=Rekursion',
    '/api/entities/note?limit=40&q=Rekursion',
    '/api/anki/study/status',
    '/api/anki/study/due',
    '/api/anki/study/due?deck=Uni%3A%3ASynthetic',
    '/api/anki/study/stats',
  ]) {
    expect(mayCache(path)).toBe(true)
  }
  for (const path of [
    '/api/host',
    '/api/system',
    '/api/doctor',
    '/api/grades',
    '/api/submissions',
    '/api/courses/42/submission',
    '/api/notes/link-targets/private',
    '/api/entities/note/secret',
    '/api/anki/study/reviews',
    '/api/anki/study/cards',
    '/api/anki/study/stats/private',
  ]) {
    expect(mayCache(path)).toBe(false)
  }
})

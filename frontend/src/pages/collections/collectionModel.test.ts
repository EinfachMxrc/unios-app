// SPDX-License-Identifier: AGPL-3.0-or-later

import { expect, it } from 'vitest'
import type { TypedT } from '@/i18n/useT'
import { berlinDay, emptyConfig, groupItems, previewPath, type Item } from './collectionModel'

const t = ((key: string) => key) as unknown as TypedT<'collections'>

function item(id: string, patch: Partial<Item>): Item {
  return { id, title: id, subtitle: '', course_name: null, url: `/x/${id}`, date: null, score: null, status: 'open',
    tags: [], priority: null, exam_relevant: null, kind: 'materials', source: 'moodle', course_id: null, ...patch }
}

it('asks the host only for the filters that are set', () => {
  const params = new URL(previewPath({ ...emptyConfig, course_id: 4, tag: 'exam' }), 'http://host').searchParams
  expect(params.get('course_id')).toBe('4')
  expect(params.get('tag')).toBe('exam')
  expect(params.has('days')).toBe(false)
  expect(params.has('any_groups')).toBe(false)
  expect(params.get('max_percent')).toBe('70')
})

it('keeps groups in the order they first appear and every item in its group', () => {
  const items = [item('a', { status: 'done' }), item('b', { status: 'open' }), item('c', { status: 'done' })]
  expect(groupItems(items, 'status', t).map(([label, group]) => [label, group.map((entry) => entry.id)]))
    .toEqual([['done', ['a', 'c']], ['open', ['b']]])
  expect(groupItems([item('d', {})], 'course', t)[0][0]).toBe('noCourseLabel')
})

it('places a late evening deadline on its Berlin calendar day', () => {
  expect(berlinDay('2026-10-11T22:30:00Z')).toEqual({ year: 2026, month: 9, day: 12 })
})

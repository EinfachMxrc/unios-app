// SPDX-License-Identifier: AGPL-3.0-or-later

import { expect, it } from 'vitest'
import { searchOffline } from './offlineSearch'
import type { OfflineSearchIndex } from './offlineSearch'

const index: OfflineSearchIndex = {
  items: [
    {
      kind: 'document',
      id: '1',
      title: 'Skript.pdf',
      body: 'Rekursionstiefe und Funktionsaufrufe',
      course_id: 1,
      course_name: 'Programmieren',
      semester_id: 2,
      semester_name: 'Winter',
      page_number: 2,
      href: '/material/1',
    },
    {
      kind: 'annotation',
      id: 'a',
      title: 'Skript.pdf',
      body: 'Schleifen Warum endet das?',
      course_id: 1,
      course_name: 'Programmieren',
      semester_id: 2,
      semester_name: 'Winter',
      page_number: 1,
      href: '/material/1#annotation-a',
    },
    {
      kind: 'jot',
      id: 'b',
      title: 'Schnellerfassung',
      body: 'Tutorium Frage zur Induktion',
      course_id: 3,
      course_name: 'Mathematik',
      semester_id: 2,
      semester_name: 'Winter',
      page_number: null,
      href: '/jots#jot-b',
    },
  ],
}

it('finds a new query in cached pages and applies course and semester filters', () => {
  expect(searchOffline(index, 'rekursionstiefe').hits[0].page_number).toBe(2)
  expect(searchOffline(index, 'Schleifen Warum', '1').hits[0].kind).toBe('annotation')
  expect(searchOffline(index, 'Induktion', '1').total).toBe(0)
  expect(searchOffline(index, 'Induktion', '3', '2').total).toBe(1)
  expect(searchOffline(index, 'Induktion', '3', '9').total).toBe(0)
  expect(searchOffline(index, 'Schleifen', '', '', 'annotation').total).toBe(1)
  expect(searchOffline(index, 'Schleifen', '', '', 'document').total).toBe(0)
})

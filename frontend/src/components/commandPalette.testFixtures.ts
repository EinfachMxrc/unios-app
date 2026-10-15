// SPDX-License-Identifier: AGPL-3.0-or-later

import type { SearchResponse } from '@/types'

/** Synthetic metadata only: no user files, notes, or network access. */
export function paletteSearchFixture(count = 1, prefix = 'synthetic'): SearchResponse {
  const indices = Array.from({ length: count }, (_, index) => index)
  const course = { course_id: 1, course_name: `${prefix}-course`, semester_name: null }
  return {
    courses: [], semesters: [],
    results: indices.map(index => ({
      ...course, filename: `${prefix}-document-${index}`, version_id: 10 + index, page_number: index + 1,
      excerpt: `${prefix}-document-excerpt-${index}`, removed_upstream: false, resource_id: 20 + index, version: 1,
    })),
    annotation_results: indices.map(index => ({
      ...course, id: `${prefix}-annotation-${index}`, resource_name: `${prefix}-annotation-${index}`,
      excerpt: `${prefix}-annotation-excerpt-${index}`, page_number: index + 1, kind: 'highlight',
      resolved: false, resource_id: 20 + index, version_id: 10 + index,
    })),
    announcement_results: indices.map(index => ({
      ...course, id: index + 1, title: `${prefix}-announcement-${index}`,
      excerpt: `${prefix}-announcement-excerpt-${index}`, url: `https://example.org/forum/${index}`,
    })),
    course_note_results: indices.map(index => ({
      ...course, course_id: index + 1, course_name: `${prefix}-course-note-${index}`,
      excerpt: `${prefix}-course-note-excerpt-${index}`,
    })),
    note_results: indices.map(index => ({
      ...course, id: `${prefix}-note-${index}`, title: `${prefix}-note-${index}`,
      excerpt: `${prefix}-note-excerpt-${index}`, revision: 1,
    })),
    jot_results: indices.map(index => ({
      ...course, course_id: null, course_name: null, id: `${prefix}-jot-${index}`,
      excerpt: `${prefix}-jot-${index}`, kind: 'thought', note_id: null, created_at: '2026-10-07T08:00:00Z',
    })),
    clip_results: indices.map(index => ({
      ...course, course_id: null, course_name: null, id: `${prefix}-clip-${index}`,
      title: `${prefix}-clip-${index}`, excerpt: `${prefix}-clip-excerpt-${index}`, kind: 'web',
      url: `https://example.org/clip/${index}`,
    })),
  }
}

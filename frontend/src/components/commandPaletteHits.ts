// SPDX-License-Identifier: AGPL-3.0-or-later

import type { SearchResponse } from '@/types'
import { stripSnippetMarks } from './SearchHighlight'

export type CommandPaletteHitKind =
  | 'document'
  | 'annotation'
  | 'announcement'
  | 'course_note'
  | 'note'
  | 'jot'
  | 'clip'

export interface CommandPaletteHit {
  kind: CommandPaletteHitKind
  key: string
  label: string
  to: string
  detailKey: 'hitDetail' | 'annotationDetail' | 'announcementDetail' | 'courseNoteDetail' | 'noteDetail' | 'jotDetail' | 'clipDetail'
  course: string | null
  excerpt: string
  page?: number
}

const MAX_HITS = 7

/** Narrows the palette to some kinds of content and/or one course. */
export interface CommandPaletteFilter {
  kinds?: readonly CommandPaletteHitKind[]
  course?: string | null
}

/** One result per nonempty category per round, preserving each category's ranking. */
export function selectCommandPaletteHits(response: SearchResponse, filter: CommandPaletteFilter = {}): CommandPaletteHit[] {
  // Filtering happens before the cut to seven, so a filter fills every slot with matching hits.
  const pick = <T extends { course_name: string | null }>(items: T[]) =>
    (filter.course ? items.filter(item => item.course_name === filter.course) : items).slice(0, MAX_HITS)
  const wanted = (kind: CommandPaletteHitKind) => !filter.kinds?.length || filter.kinds.includes(kind)
  // Only candidates that could fit in the palette are converted; large responses
  // never require mapping every result merely to discard it afterwards.
  const groups: CommandPaletteHit[][] = [
    pick(response.results).map(item => ({
      kind: 'document', key: `document-${item.version_id}-${item.page_number}`, label: item.filename,
      to: `/material/${item.version_id}?page=${item.page_number}`,
      detailKey: 'hitDetail', course: item.course_name, page: item.page_number, excerpt: stripSnippetMarks(item.excerpt),
    })),
    pick(response.annotation_results).map(item => ({
      kind: 'annotation', key: `annotation-${item.id}`, label: item.resource_name,
      to: `/material/${item.version_id}#annotation-${item.id}`,
      detailKey: 'annotationDetail', course: item.course_name, page: item.page_number, excerpt: stripSnippetMarks(item.excerpt),
    })),
    pick(response.announcement_results).map(item => ({
      kind: 'announcement', key: `announcement-${item.id}`, label: item.title,
      to: item.url ?? `/courses/${item.course_id}`,
      detailKey: 'announcementDetail', course: item.course_name, excerpt: stripSnippetMarks(item.excerpt),
    })),
    pick(response.course_note_results).map(item => ({
      kind: 'course_note', key: `course-note-${item.course_id}`, label: item.course_name,
      to: `/courses/${item.course_id}`,
      detailKey: 'courseNoteDetail', course: item.course_name, excerpt: stripSnippetMarks(item.excerpt),
    })),
    pick(response.note_results).map(item => ({
      kind: 'note', key: `note-${item.id}`, label: item.title, to: `/notes?id=${item.id}`,
      detailKey: 'noteDetail', course: item.course_name, excerpt: stripSnippetMarks(item.excerpt),
    })),
    pick(response.jot_results).map(item => ({
      kind: 'jot', key: `jot-${item.id}`, label: stripSnippetMarks(item.excerpt), to: `/jots#jot-${item.id}`,
      detailKey: 'jotDetail', course: item.course_name, excerpt: stripSnippetMarks(item.excerpt),
    })),
    pick(response.clip_results).map(item => ({
      kind: 'clip', key: `clip-${item.id}`, label: item.title, to: `/inbox#clip-${item.id}`,
      detailKey: 'clipDetail', course: item.course_name, excerpt: stripSnippetMarks(item.excerpt),
    })),
  ]
  const hits: CommandPaletteHit[] = []
  const chosen = groups.map(group => group.filter(hit => wanted(hit.kind)))
  for (let round = 0; round < MAX_HITS && hits.length < MAX_HITS; round += 1) {
    let found = false
    for (const group of chosen) {
      const hit = group[round]
      if (!hit) continue
      hits.push(hit)
      found = true
      if (hits.length === MAX_HITS) break
    }
    if (!found) break
  }
  return hits
}

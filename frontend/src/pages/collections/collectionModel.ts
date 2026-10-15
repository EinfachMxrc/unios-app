// SPDX-License-Identifier: AGPL-3.0-or-later

/*
 * What a saved collection asks for and how the host answers: the filter
 * config, the preview request it becomes, and grouping of the results.
 */
import type { Keys, TypedT } from '@/i18n/useT'

export type Kind = 'all' | 'topics' | 'materials' | 'deadlines' | 'questions' | 'notes' | 'cards'
export type View = 'list' | 'table' | 'cards' | 'board' | 'calendar'
export type Sort = 'date' | 'title' | 'progress'
export type GroupBy = 'status' | 'course' | 'kind' | 'source'
export type VisibleField = 'title' | 'course' | 'date' | 'status' | 'source' | 'tags'
export type AnyGroup = {
  kind?: Exclude<Kind, 'all'>
  course_id?: number
  status?: string
  source?: string
  tag?: string
  max_percent?: number
  own_group_only?: boolean
}
export type Config = {
  kind: Kind
  view: View
  course_id: number | null
  days: number | null
  max_percent: number | null
  own_group_only: boolean
  include_unmeasured: boolean
  sort: Sort
  tag: string | null
  priority: 'low' | 'medium' | 'high' | null
  exam_relevant: boolean | null
  difficulty: 'easy' | 'medium' | 'hard' | null
  workflow_status: 'open' | 'working' | 'done' | null
  group_by: GroupBy
  any_groups: AnyGroup[]
  visible_fields: VisibleField[]
  sort_direction: 'auto' | 'asc' | 'desc'
  time_filter: 'all' | 'upcoming' | 'overdue'
  unread_only: boolean
  has_questions: boolean
  submission_filter: 'all' | 'unsubmitted'
}
export type Collection = { id: number; name: string; config: Config; revision: number }
export type Item = {
  id: string
  title: string
  subtitle: string
  course_name: string | null
  url: string
  date: string | null
  score: number | null
  status: string
  tags: string[]
  priority: string | null
  exam_relevant: boolean | null
} & { kind: Exclude<Kind, 'all'>; source: string; course_id: number | null }
export type Result = { items: Item[]; total: number }

const kindKeys: Record<Kind, Keys<'collections'>> = {
  all: 'kindAll',
  topics: 'kindTopics',
  materials: 'kindMaterials',
  deadlines: 'kindDeadlines',
  questions: 'kindQuestions',
  notes: 'kindNotes',
  cards: 'kindCards',
}

export function kindLabels(t: TypedT<'collections'>): Record<Kind, string> {
  return {
    all: t('kindAll'),
    topics: t('kindTopics'),
    materials: t('kindMaterials'),
    deadlines: t('kindDeadlines'),
    questions: t('kindQuestions'),
    notes: t('kindNotes'),
    cards: t('kindCards'),
  }
}
export const emptyConfig: Config = {
  kind: 'topics',
  view: 'list',
  course_id: null,
  days: null,
  max_percent: 70,
  own_group_only: false,
  include_unmeasured: true,
  sort: 'progress',
  tag: null,
  priority: null,
  exam_relevant: null,
  difficulty: null,
  workflow_status: null,
  group_by: 'status',
  any_groups: [],
  visible_fields: ['title', 'course', 'date', 'status'],
  sort_direction: 'auto',
  time_filter: 'all',
  unread_only: false,
  has_questions: false,
  submission_filter: 'all',
}
export function presetsFor(t: TypedT<'collections'>): Array<{ name: string; config: Config }> {
  return [
    { name: t('presetExamPrep'), config: emptyConfig },
    {
      name: t('presetNewMaterials'),
      config: { ...emptyConfig, kind: 'materials', days: 14, max_percent: null, sort: 'date' },
    },
    {
      name: t('presetUrgentThisWeek'),
      config: {
        ...emptyConfig,
        kind: 'deadlines',
        days: 7,
        max_percent: null,
        include_unmeasured: false,
        sort: 'date',
      },
    },
    {
      name: t('presetOpenQuestions'),
      config: { ...emptyConfig, kind: 'questions', max_percent: null, include_unmeasured: false, sort: 'date' },
    },
    {
      name: t('presetOverdue'),
      config: { ...emptyConfig, kind: 'deadlines', max_percent: null, sort: 'date', time_filter: 'overdue' },
    },
    {
      name: t('presetUnsubmitted'),
      config: { ...emptyConfig, kind: 'deadlines', max_percent: null, sort: 'date', submission_filter: 'unsubmitted' },
    },
    {
      name: t('presetUnread'),
      config: { ...emptyConfig, kind: 'materials', max_percent: null, sort: 'date', unread_only: true },
    },
    {
      name: t('presetMaterialQuestions'),
      config: { ...emptyConfig, kind: 'materials', max_percent: null, sort: 'date', has_questions: true },
    },
    {
      name: t('presetExamMaterials'),
      config: { ...emptyConfig, kind: 'materials', max_percent: null, sort: 'date', exam_relevant: true },
    },
    { name: t('kindCards'), config: { ...emptyConfig, kind: 'cards', max_percent: null, sort: 'date' } },
  ]
}

export function previewPath(config: Config) {
  const params = new URLSearchParams({
    kind: config.kind,
    view: config.view,
    sort: config.sort,
    own_group_only: String(config.own_group_only),
    include_unmeasured: String(config.include_unmeasured),
  })
  if (config.course_id) params.set('course_id', String(config.course_id))
  if (config.days) params.set('days', String(config.days))
  if (config.max_percent !== null) params.set('max_percent', String(config.max_percent))
  if (config.tag) params.set('tag', config.tag)
  if (config.priority) params.set('priority', config.priority)
  if (config.exam_relevant !== null) params.set('exam_relevant', String(config.exam_relevant))
  if (config.difficulty) params.set('difficulty', config.difficulty)
  if (config.workflow_status) params.set('workflow_status', config.workflow_status)
  params.set('group_by', config.group_by)
  params.set('sort_direction', config.sort_direction)
  params.set('visible_fields', JSON.stringify(config.visible_fields))
  params.set('time_filter', config.time_filter)
  params.set('unread_only', String(config.unread_only))
  params.set('has_questions', String(config.has_questions))
  params.set('submission_filter', config.submission_filter)
  if (config.any_groups.length) params.set('any_groups', JSON.stringify(config.any_groups))
  return `/api/collections/preview?${params}`
}

export function berlinDay(value: string): { year: number; month: number; day: number } {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Berlin',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date(value))
  const part = (type: string) => Number(parts.find((item) => item.type === type)?.value)
  return { year: part('year'), month: part('month') - 1, day: part('day') }
}

function groupLabel(item: Item, by: GroupBy, t: TypedT<'collections'>): string {
  if (by === 'course') return item.course_name ?? t('noCourseLabel')
  if (by === 'kind') return t(kindKeys[item.kind])
  if (by === 'source') return item.source
  return item.status
}

/** Items in groups, in the order the groups first appear in the result. */
export function groupItems(items: Item[], by: GroupBy, t: TypedT<'collections'>): Array<[string, Item[]]> {
  const groups = new Map<string, Item[]>()
  for (const item of items) {
    const label = groupLabel(item, by, t)
    const group = groups.get(label)
    if (group) group.push(item)
    else groups.set(label, [item])
  }
  return [...groups]
}

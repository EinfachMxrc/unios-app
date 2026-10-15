// SPDX-License-Identifier: AGPL-3.0-or-later
import type { components } from '@/generated/api'

export type LearningFocusRef = { kind: 'block' | 'cycle' | 'course'; id: number }
export type LearningFocusOptions = {
  mode?: 'source' | 'notes' | 'practice'
  version?: number
  note?: string
  page?: number
}

export type LearningFocusContext = components['schemas']['LearningFocusView']

function positiveId(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value > 0
}

/** A bounded reference, never an arbitrary return URL or a client-authored course. */
export function readFocusRef(search: string | URLSearchParams): LearningFocusRef | null {
  const params = typeof search === 'string' ? new URLSearchParams(search) : search
  if (params.getAll('focus').length !== 1) return null
  const match = /^(block|cycle|course):([1-9]\d{0,15})$/.exec(params.get('focus') ?? '')
  if (!match) return null
  const id = Number(match[2])
  return positiveId(id) ? { kind: match[1] as LearningFocusRef['kind'], id } : null
}

export function focusQuery(ref: LearningFocusRef): string {
  if (!positiveId(ref.id) || !['block', 'cycle', 'course'].includes(ref.kind)) throw new Error('Invalid learning focus reference')
  return new URLSearchParams({ focus: `${ref.kind}:${ref.id}` }).toString()
}

export function focusPath(ref: LearningFocusRef, options: LearningFocusOptions = {}): string {
  focusQuery(ref)
  const params = new URLSearchParams()
  if (options.mode && ['source', 'notes', 'practice'].includes(options.mode)) params.set('mode', options.mode)
  if (positiveId(options.version)) params.set('version', String(options.version))
  if (options.note && /^[\da-f]{8}(?:-[\da-f]{4}){3}-[\da-f]{12}$/i.test(options.note)) params.set('note', options.note)
  if (positiveId(options.page)) params.set('page', String(options.page))
  return `/learning/focus/${ref.kind}/${ref.id}${params.size ? `?${params}` : ''}`
}

export function focusApiPath(ref: LearningFocusRef): string {
  focusQuery(ref)
  return `/api/learning/focus/${ref.kind}/${ref.id}`
}

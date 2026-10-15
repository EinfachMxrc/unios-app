// SPDX-License-Identifier: AGPL-3.0-or-later

import type { Material, MaterialAnnotation } from '@/types'
import type { components } from '@/generated/api'

export type ManualCardInput = components['schemas']['ManualCardInput']
export type ManualCardSource = components['schemas']['ManualCardSource']
export type StoredCardData = components['schemas']['StoredCardData']
export type ManualCardResponse = components['schemas']['ManualCardResponse']
export type ManualCardContext = Omit<ManualCardSource, 'sha256'> & { comment: string }

export function manualCardContext(material: Material, annotation: MaterialAnnotation): ManualCardContext | null {
  if (annotation.resource_id !== material.resource_id || annotation.anchor.status !== 'matched' ||
      !Number.isSafeInteger(annotation.anchor.page) || (annotation.anchor.page ?? 0) < 1 ||
      !Number.isSafeInteger(annotation.revision) || annotation.revision < 1 || !annotation.quote.trim()) return null
  const page = annotation.anchor.page!
  return { resource_id: material.resource_id, resource_name: material.resource_name,
    course_id: material.course_id, course_name: material.course_name,
    version_id: material.version_id, version: material.version, page, quote: annotation.quote,
    annotation_id: annotation.id, annotation_revision: annotation.revision, comment: annotation.comment,
    url: `/material/${material.version_id}?page=${page}` }
}

/** Only frozen local material routes are navigation targets, even in restored cache data. */
export function manualSourceUrl(source: Pick<ManualCardSource, 'version_id' | 'page'>): string | null {
  return Number.isSafeInteger(source.version_id) && source.version_id > 0 &&
    Number.isSafeInteger(source.page) && source.page > 0 ? `/material/${source.version_id}?page=${source.page}` : null
}

// SPDX-License-Identifier: AGPL-3.0-or-later

import { useEffect, useMemo } from 'react'
import { Link } from 'react-router-dom'
import { ArrowDownToLine, ArrowRight, ChevronRight, Clock3, FileText } from 'lucide-react'
import { localDate } from '@/api'
import { ListRows } from '@/components/State'
import { ResourceHistory } from '@/components/ResourceHistory'
import { useT } from '@/i18n/useT'
import { hasPdfView, openHref, opensAsDocument } from '@/lib/materialView'
import type { Assignment, CourseDetail } from '@/types'

type Resource = CourseDetail['resources'][number]

/** Section names by id, built once per course instead of searched per row. */
export function useSectionNames(detail: CourseDetail) {
  return useMemo(() => new Map(detail.sections.map((section) => [section.id, section])), [detail.sections])
}

/**
 * One list of course materials. Alphabetical (with numbers in order) unless
 * `recent` keeps the caller's newest-first order.
 */
/** An open "Mehr" menu closes when the pointer goes anywhere else, like any menu. */
function useCloseMenusOutside() {
  useEffect(() => {
    const close = (event: PointerEvent) => {
      const target = event.target instanceof Node ? event.target : null
      document.querySelectorAll<HTMLDetailsElement>('details.resource-more[open]').forEach((menu) => {
        if (!target || !menu.contains(target)) menu.open = false
      })
    }
    document.addEventListener('pointerdown', close)
    return () => document.removeEventListener('pointerdown', close)
  }, [])
}

export function CourseResourceList({
  resources,
  detail,
  recent = false,
  hash,
  canWrite,
  courseId,
}: {
  resources: Resource[]
  detail: CourseDetail
  recent?: boolean
  hash: string
  canWrite: boolean
  courseId: string | undefined
}) {
  const { t } = useT('courses')
  useCloseMenusOutside()
  const sections = useSectionNames(detail)
  const ordered = recent
    ? resources
    : [...resources].sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }))
  return (
    <ListRows>
      {ordered.map((resource) => {
        const fileName = resource.filename ?? resource.name
        const versions = detail.versions[resource.id] ?? []
        // The first version the app can show decides where the title leads.
        const opener =
          versions.map((version) => openHref(version.id, fileName, version.mime_type)).find(Boolean) ?? null
        return (
          <div
            className={`resource-row anchor-target ${hash === `#resource-${resource.id}` ? 'is-target' : ''}`}
            id={`resource-${resource.id}`}
            tabIndex={-1}
            key={resource.id}
          >
            <span className="file-symbol">
              <FileText size={18} />
            </span>
            <div>
              {opener ? (
                <Link className="resource-title-link" to={opener}>
                  {resource.name}
                </Link>
              ) : resource.kind === 'link' && resource.url ? (
                <a className="resource-title-link" href={resource.url} target="_blank" rel="noreferrer">
                  {resource.name}
                </a>
              ) : (
                <strong>{resource.name}</strong>
              )}
              <span>
                {sections.get(resource.section_id ?? -1)?.name ?? t('otherSection')}
                {resource.removed_upstream && ` · ${t('removedUpstreamShort')}`}
              </span>
              <div className="version-links">
                {resource.kind === 'link' ? (
                  resource.url ? (
                    <a href={resource.url} target="_blank" rel="noreferrer">
                      {t('openLink')} <ArrowRight size={13} />
                    </a>
                  ) : null
                ) : (
                  versions.slice(0, 1).map((version) => {
                    const page = opensAsDocument(fileName, version.mime_type)
                    const download = (
                      <a href={`/files/${version.id}`}>
                        {t('downloadFile')} <ArrowDownToLine size={13} />
                      </a>
                    )
                    return (
                      <span key={version.id}>
                        {/* A web page is read here, not downloaded; its download moves into "Mehr". */}
                        {!page && download}
                        {hasPdfView(fileName, version.mime_type) && (
                          <Link className="resource-open" to={`/material/${version.id}`}>
                            {t('openPdf')} <ArrowRight size={13} />
                          </Link>
                        )}
                        {page && (
                          <Link className="resource-open" to={`/document/${version.id}`}>
                            {t('openPage')} <ArrowRight size={13} />
                          </Link>
                        )}
                        {/\.(pptx?|docx?)$/i.test(fileName) && (
                          <Link to={`/material/${version.id}`}>{t('workInMaterial')}</Link>
                        )}
                        {/* One "Mehr" menu at a time: an open one would cover the next row. */}
                        <details className="resource-more" name="resource-more">
                          <summary>{t('more')}</summary>
                          <div>
                            {resource.filename && (
                              <span className="resource-filename">
                                {t('fileName')}: {resource.filename}
                              </span>
                            )}
                            {page && download}
                            <ResourceHistory resourceId={resource.id} latestId={version.id} />
                            <a href={`/files/${version.id}/markdown`} className="markdown-link">
                              {t('openMarkdown')}
                            </a>
                            {canWrite && resource.group_category !== 'other_group' && (
                              <Link
                                to={`/notes?new=1&course_id=${courseId}&resource_id=${resource.id}&title=${encodeURIComponent(resource.name.replace(/\.[^/.]+$/, ''))}`}
                              >
                                {t('prepareNote')}
                              </Link>
                            )}
                          </div>
                        </details>
                      </span>
                    )
                  })
                )}
              </div>
            </div>
          </div>
        )
      })}
    </ListRows>
  )
}

/** A task of the course; opens its peek on click. */
export function CourseAssignmentCard({ item, onOpen }: { item: Assignment; onOpen: (id: number) => void }) {
  const { t } = useT('courses')
  return (
    <button
      type="button"
      id={`assignment-${item.id}`}
      className={`course-task-card anchor-target ${item.removed_upstream ? 'is-removed' : ''}`}
      onClick={() => onOpen(item.id)}
    >
      <span className="course-task-icon">
        <Clock3 size={18} />
      </span>
      <span className="course-task-copy">
        <strong>{item.title}</strong>
        <span>{item.due_at ? localDate(item.due_at) : t('noDeadline')}</span>
        {item.delivery === 'in_person' && <small>{t('deliveryInPerson')}</small>}
        {item.removed_upstream && <small>{t('removedUpstream')}</small>}
      </span>
      <ChevronRight size={16} aria-hidden="true" />
    </button>
  )
}

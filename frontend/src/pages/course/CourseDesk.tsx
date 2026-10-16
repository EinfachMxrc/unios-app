// SPDX-License-Identifier: AGPL-3.0-or-later
import { ArrowUpRight, BookOpen } from 'lucide-react'
import { Link } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { useT } from '@/i18n/useT'
import { hasMaterialView, hasPdfView } from '@/lib/materialView'
import { useCourseStudyResume } from '@/lib/studyResume'
import { useApi } from '@/api'
import type { ComponentProps } from 'react'
import { CourseResourceList } from './CourseResourceList'
import type { CourseDetail, Material, NotesResponse } from '@/types'

export function CourseDesk({ detail, notes }: { detail: CourseDetail; notes?: NotesResponse }) {
  const { t } = useT('courses')
  const resume = useCourseStudyResume(detail.course.id)
  const readable = detail.resources.flatMap((resource) => {
    if (resource.group_category === 'other_group') return []
    const version = detail.versions[resource.id]?.find((item) =>
      hasMaterialView(resource.filename ?? resource.name, item.mime_type),
    )
    return version ? [{ resource, version }] : []
  })
  const previous = readable.find((item) =>
    detail.versions[item.resource.id]?.some((version) => version.id === resume?.options.version),
  )
  const restored = useApi<Material>(`/api/material/${resume?.options.version ?? 0}`, {
    enabled: Boolean(resume?.options.version && !previous),
  })
  const restoredSource =
    !restored.error &&
    restored.data?.course_id === detail.course.id &&
    restored.data.version_id === resume?.options.version
      ? { resource: { name: restored.data.resource_name }, version: { id: restored.data.version_id } }
      : undefined
  const continuation = previous ?? restoredSource
  const source =
    continuation ??
    readable.find(({ resource, version }) => hasPdfView(resource.filename ?? resource.name, version.mime_type)) ??
    readable[0]
  if (!source) return null
  const options = continuation ? resume?.options : undefined
  const note = notes?.notes.find((item) => item.id === options?.note && item.course_id === detail.course.id)
  const params = new URLSearchParams({ workspace: '1' })
  if (options?.page) params.set('page', String(options.page))
  if (options?.note) params.set('note', options.note)
  const to = `/material/${options?.version ?? source.version.id}?${params}`
  return (
    <section className="course-desk" aria-label={t('deskTitle')}>
      <span className="course-desk-icon">
        <BookOpen size={25} aria-hidden="true" />
      </span>
      <div className="course-desk-copy">
        <p className="course-desk-kicker">{continuation ? t('deskResume') : t('deskTitle')}</p>
        <h2>{source.resource.name}</h2>
        <p>
          {options?.page ? t('deskPage', { page: options.page }) : t('deskDescription')}
          {note && <> · {note.title}</>}
        </p>
      </div>
      <Button asChild>
        <Link to={to}>
          {t('deskOpen')}
          <ArrowUpRight size={16} aria-hidden="true" />
        </Link>
      </Button>
    </section>
  )
}

export function CourseDeskMaterials({ resources, ...props }: ComponentProps<typeof CourseResourceList>) {
  const { t } = useT('courses')
  const sections = [...new Set(resources.map((item) => item.section_id))].sort(
    (a, b) =>
      (props.detail.sections.find((item) => item.id === a)?.position ?? 0) -
      (props.detail.sections.find((item) => item.id === b)?.position ?? 0),
  )
  return (
    <>
      {sections.map((id) => (
        <section className="course-material-group" key={id ?? 'other'}>
          <h3>{props.detail.sections.find((item) => item.id === id)?.name ?? t('otherSection')}</h3>
          <CourseResourceList {...props} grouped resources={resources.filter((item) => item.section_id === id)} />
        </section>
      ))}
    </>
  )
}

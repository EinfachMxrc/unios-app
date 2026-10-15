// SPDX-License-Identifier: AGPL-3.0-or-later
import { useState } from 'react'
import { useApi } from '@/api'
import { useT } from '@/i18n/useT'
import { Failure, Loading } from '@/components/State'
import type { CourseDetail } from '@/types'
import { lastRecordedLectureSourceVersion } from '@/lib/lectureCoverage'
import { LectureCoveragePanel, type LectureSource } from './LectureCoveragePanel'

/** The reader supplies its exact source; a standalone note can select a PDF in its course. */
export function CourseLectureCoveragePanel({
  courseId,
  resourceId,
  body,
  onChange,
  disabled,
}: {
  courseId: number
  resourceId: number | null
  body: string
  onChange: (body: string) => void
  disabled?: boolean
}) {
  const { t } = useT('lectureCoverage')
  const [open, setOpen] = useState(false)
  const [selected, setSelected] = useState<number | null>(null)
  const { data, error, reload } = useApi<CourseDetail>(`/api/courses/${courseId}`, { enabled: open && courseId > 0 })
  const bodyVersion = lastRecordedLectureSourceVersion(body)
  const choices: LectureSource[] = (data?.resources ?? []).flatMap((resource) => {
    if (resource.group_category === 'other_group') return []
    const versions = (data?.versions[resource.id] ?? []).filter((version) => version.mime_type === 'application/pdf')
    const selectedVersion = versions.find((version) => version.id === bodyVersion || version.id === selected)
    const visible = versions[0]
      ? [versions[0], ...(selectedVersion && selectedVersion.id !== versions[0].id ? [selectedVersion] : [])]
      : []
    return visible.map((version) => ({
      courseId,
      resourceId: resource.id,
      resourceName: resource.name,
      versionId: version.id,
      version: version.version,
    }))
  })
  const source =
    choices.find((item) => item.versionId === selected) ??
    choices.find((item) => item.versionId === bodyVersion) ??
    choices.find((item) => item.resourceId === resourceId)
  return (
    <details className="lecture-coverage-panel" onToggle={(event) => setOpen(event.currentTarget.open)}>
      <summary>{t('title')}</summary>
      <div className="lecture-coverage-content">
        {error ? (
          <Failure message={error} retry={reload} />
        ) : !data ? (
          <Loading />
        ) : choices.length === 0 ? (
          <p>{t('noSources')}</p>
        ) : (
          <>
            <label className="lecture-source-picker">
              {t('source')}
              <select
                disabled={disabled}
                value={source?.versionId ?? ''}
                onChange={(event) => setSelected(Number(event.target.value))}
              >
                <option value="" disabled>
                  {t('chooseSource')}
                </option>
                {choices.map((item) => (
                  <option key={item.versionId} value={item.versionId}>
                    {item.resourceName} · {t('version', { version: item.version })}
                  </option>
                ))}
              </select>
            </label>
            {data.page?.has_more && <p className="muted-text">{t('sourcesPartial')}</p>}
            {source && (
              <LectureCoveragePanel
                key={source.versionId}
                source={source}
                body={body}
                onChange={onChange}
                disabled={disabled}
                embedded
              />
            )}
          </>
        )}
      </div>
    </details>
  )
}

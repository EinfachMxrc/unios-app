// SPDX-License-Identifier: AGPL-3.0-or-later

import { useT } from '@/i18n/useT'
import { useApi } from '@/api'
import { Empty, Failure, Loading } from '@/components/State'
type PackageResource = { id: number; name: string; version: number; course_name: string }
export function ResourceChooser({
  courseId,
  fromDate,
  toDate,
  selectedIds,
  onChange,
}: {
  courseId: number | null
  fromDate: string
  toDate: string
  selectedIds: number[]
  onChange: (ids: number[]) => void
}) {
  const { t } = useT('ai')
  const params = new URLSearchParams()
  if (courseId !== null) params.set('course_id', String(courseId))
  if (fromDate) params.set('from_date', fromDate)
  if (toDate) params.set('to_date', toDate)
  const { data, loading, error } = useApi<PackageResource[]>(`/api/ai/package/resources?${params}`)
  if (loading && !data) return <Loading />
  if (error) return <Failure message={error} />
  if (!data?.length) return <Empty title={t('noExtractedMaterialTitle')} text={t('noExtractedMaterialText')} />
  return (
    <div className="row-list max-h-56 overflow-y-auto" aria-label={t('chooseMaterialAria')}>
      {data.map((resource) => (
        <label className="data-row flex items-center gap-3" key={resource.id}>
          <input
            type="checkbox"
            checked={selectedIds.includes(resource.id)}
            disabled={selectedIds.length >= 100 && !selectedIds.includes(resource.id)}
            onChange={(event) =>
              onChange(
                event.target.checked ? [...selectedIds, resource.id] : selectedIds.filter((id) => id !== resource.id),
              )
            }
          />
          {courseId === null ? `${resource.course_name} · ` : ''}
          {resource.name}
          <small className="muted-text">{t('versionLabel', { version: resource.version })}</small>
        </label>
      ))}
    </div>
  )
}

// SPDX-License-Identifier: AGPL-3.0-or-later
import { useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { FileText } from 'lucide-react'
import { useApi } from '@/api'
import type { CourseDetail, CoursesResponse } from '@/types'
import { Shell } from '@/components/Shell'
import { Loading, Failure } from '@/components/State'
import { useT } from '@/i18n/useT'
import { Input } from '@/components/ui/input'
import { hasPdfView } from '@/lib/materialView'

export function UniversityDocuments() {
  const { t } = useT('courses')
  const [params, setParams] = useSearchParams()
  const [filter, setFilter] = useState('')
  const { data, error, loading } = useApi<CoursesResponse>('/api/courses?documents=true&all_semesters=true&include_inactive=true')
  const chosen = data?.courses.find((item) => String(item.id) === params.get('collection')) ?? data?.courses[0]
  const { data: detail, error: detailError, loading: detailLoading } = useApi<CourseDetail>(`/api/courses/${chosen?.id}`, { enabled: Boolean(chosen) })
  return <Shell title={t('universityDocuments')}>
    <p className="muted-text mb-4">{t('universityDocumentsIntro')}</p>
    {loading ? <Loading /> : error ? <Failure message={error} /> : !chosen ? <p>{t('noUniversityDocuments')}</p> : <>
      <div className="flex flex-wrap gap-2 mb-5">
        <select className="native-select" aria-label={t('documentCollection')} value={chosen.id} onChange={(event) => { setParams({ collection: event.target.value }); setFilter('') }}>
          {data?.courses.map((item) => <option value={item.id} key={item.id}>{item.name}</option>)}
        </select>
        <Input className="min-w-0 flex-1" aria-label={t('searchMaterials')} placeholder={t('searchMaterials')} value={filter} onChange={(event) => setFilter(event.target.value)} />
      </div>
      {detailLoading ? <Loading /> : detailError ? <Failure message={detailError} /> : detail && detail.course.id === chosen.id && <>
        <h2>{chosen.name}</h2>
        {detail.resources.filter((item) => item.name.toLocaleLowerCase().includes(filter.toLocaleLowerCase())).map((resource) => {
          const version = detail.versions[resource.id]?.[0]
          const isPdf = hasPdfView(resource.filename ?? resource.name, version?.mime_type)
          return <div className="border-b border-border py-3" key={resource.id}>
            {version && isPdf ? <Link className="flex gap-3 items-center" to={`/material/${version.id}`}><FileText size={18} /><strong>{resource.name}</strong></Link>
              : <p className="flex gap-3 items-center"><FileText size={18} /><strong>{resource.name}</strong></p>}
            <p className="muted-text ml-7">{detail.sections.find((item) => item.id === resource.section_id)?.name}</p>
            <div className="ml-7 flex gap-3 mt-1">
              {version && <a className="subtle-link" href={`/files/${version.id}`} download>{t('downloadFile')}</a>}
              {resource.url && <a className="subtle-link" href={resource.url} target="_blank" rel="noopener noreferrer">{t('openLink')}</a>}
            </div>
          </div>
        })}
      </>}
    </>}
  </Shell>
}

// SPDX-License-Identifier: AGPL-3.0-or-later

import { useState } from 'react'
import { Link } from 'react-router-dom'
import { BookOpen, CalendarDays, FileText, Newspaper } from 'lucide-react'
import { localDate, useApi } from '@/api'
import { Shell } from '@/components/Shell'
import { Empty, Failure, ListRows, Loading, Panel } from '@/components/State'
import { useT } from '@/i18n/useT'
import { useCampusImport } from '@/hooks/useCampusImport'

type Kind = 'event' | 'news' | 'document' | 'page'
type CampusItem = {
  id: number
  kind: Kind
  title: string
  summary: string
  url: string
  category: string
  published_at: string | null
  starts_at: string | null
  file_label: string | null
  study_program: string | null
  material_id: number | null
}

const KINDS: Kind[] = ['page', 'document', 'event', 'news']

function CampusList({ kind }: { kind: Kind }) {
  const { t } = useT('campus')
  const { status } = useCampusImport()
  const { data, error, loading } = useApi<CampusItem[]>(`/api/mycampus/items?kind=${kind}`)
  if (loading && !data) return <Loading />
  if (error) return <Failure message={t('loadFailed')} />
  if (!data?.length) {
    if (status?.state === 'running') return <p className="muted-text">{t('syncEmpty')}</p>
    return (
      <Empty
        icon={kind === 'document' ? FileText : kind === 'news' ? Newspaper : kind === 'page' ? BookOpen : CalendarDays}
        title={t('emptyTitle')}
        text={t('emptyText')}
      />
    )
  }
  const groups = kind === 'document' ? [...new Set(data.map((item) => item.category || t('noCategory')))] : ['']
  return (
    <>
      {groups.map((group) => (
        <div key={group}>
          {group && <h3 className="mt-4 font-semibold">{group}</h3>}
          <ListRows>
            {data
              .filter((item) => !group || (item.category || t('noCategory')) === group)
              .map((item) => {
                const moment = item.starts_at ?? item.published_at
                return (
                  <div className="data-row" key={item.id}>
                    <div>
                      <strong>{item.title}</strong>
                      <span className="row-subtitle">
                        {[
                          moment ? localDate(moment) : '',
                          kind !== 'document' ? item.category : '',
                          item.file_label ?? '',
                        ]
                          .filter(Boolean)
                          .join(' · ')}
                      </span>
                      {item.summary &&
                        (item.summary.length > 1000 ? (
                          <details>
                            <summary>{t('readPage')}</summary>
                            <p className="muted-text" style={{ whiteSpace: 'pre-wrap' }}>
                              {item.summary}
                            </p>
                          </details>
                        ) : (
                          <p className="muted-text">{item.summary}</p>
                        ))}
                      {item.study_program && (
                        <span className="row-subtitle">{t('studyProgram', { name: item.study_program })}</span>
                      )}
                      {(kind === 'document' || kind === 'page') && item.material_id ? (
                        <Link className="subtle-link" to={`/material/${item.material_id}`}>
                          {t('openStored')}
                        </Link>
                      ) : (
                        kind === 'document' && <span className="row-subtitle">{t('documentNotStored')}</span>
                      )}
                      {item.url && kind !== 'document' && (
                        <a className="subtle-link" href={item.url} target="_blank" rel="noopener noreferrer">
                          {t('openOnline')}
                        </a>
                      )}
                    </div>
                  </div>
                )
              })}
          </ListRows>
        </div>
      ))}
    </>
  )
}

export function CampusPage() {
  const { t } = useT('campus')
  const [kind, setKind] = useState<Kind>('page')
  const labels: Record<Kind, string> = {
    page: t('tabProgramme'),
    event: t('tabEvents'),
    news: t('tabNews'),
    document: t('tabDocuments'),
  }
  return (
    <Shell title={t('pageTitle')}>
      <p className="muted-text mb-4">{t('pageIntro')}</p>
      <div role="tablist" className="mb-4 flex flex-wrap gap-2">
        {KINDS.map((item) => (
          <button
            key={item}
            type="button"
            role="tab"
            aria-selected={kind === item}
            className={`native-select ${kind === item ? 'font-semibold' : ''}`}
            onClick={() => setKind(item)}
          >
            {labels[item]}
          </button>
        ))}
      </div>
      <Panel title={labels[kind]}>
        <CampusList kind={kind} />
      </Panel>
      <p className="mt-4">
        <Link className="subtle-link" to="/setup">
          {t('emptyAction')}
        </Link>
      </p>
    </Shell>
  )
}

// SPDX-License-Identifier: AGPL-3.0-or-later

import { useState } from 'react'
import { useT } from '@/i18n/useT'
import { localDate, useApi } from '@/api'
import { Failure, Loading } from '@/components/State'
import './EntityActivity.css'

type ActivityItem = { at: string; title: string; detail: string; source: string }
type ActivityKind = 'course' | 'material' | 'assignment' | 'note' | 'exam' | 'project' | 'topic'

export function EntityActivity({ kind, id }: { kind: ActivityKind; id: string }) {
  const { t } = useT('common')
  const [open, setOpen] = useState(false)
  const { data, error, loading } = useApi<ActivityItem[]>(`/api/entity-activity/${kind}/${id}`, { enabled: open })
  return <details className="entity-activity" open={open} onToggle={(event) => setOpen(event.currentTarget.open)}>
    <summary>{t('entityActivityLabel')}</summary>
    {open && (loading && !data ? <Loading /> : error ? <Failure message={error} /> : data?.length ?
      <ol>{data.map((item, index) => <li key={`${item.at}-${item.title}-${index}`}>
        <time dateTime={item.at}>{localDate(item.at)}</time>
        <strong>{item.title}</strong>
        <span>{item.detail}</span>
        <small>{t('entityActivitySource', { source: item.source })}</small>
      </li>)}</ol> : <p className="muted-text">{t('entityActivityEmpty')}</p>)}
  </details>
}

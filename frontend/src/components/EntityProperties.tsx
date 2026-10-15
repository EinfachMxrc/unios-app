// SPDX-License-Identifier: AGPL-3.0-or-later

import { useState, type ReactNode } from 'react'
import { useT } from '@/i18n/useT'
import { MetadataEditor } from '@/components/MetadataEditor'
import { EntityActivity } from '@/components/EntityActivity'
import './EntityProperties.css'

type MetadataKind = 'note' | 'material' | 'topic' | 'deadline' | 'question' | 'assignment' | 'exam' | 'project'
type ActivityKind = 'material' | 'assignment' | 'note' | 'exam' | 'project' | 'topic'
export type EntityProperty = { label: string; value: ReactNode }

export function EntityProperties({ title, rows, metadata, activity, children, initiallyOpen = false }: {
  title?: string; rows: EntityProperty[]; metadata?: { kind: MetadataKind; id: string };
  activity?: { kind: ActivityKind; id: string }; children?: ReactNode; initiallyOpen?: boolean
}) {
  const { t } = useT('common')
  const [open, setOpen] = useState(initiallyOpen)
  return <details className="entity-properties" open={open} onToggle={(event) => setOpen(event.currentTarget.open)}>
    <summary>{title ?? t('entityPropertiesDefaultTitle')}</summary>
    {open && <div className="entity-properties-body">
      <dl>{rows.map((row) => <div key={row.label}><dt>{row.label}</dt>
        <dd>{row.value === null || row.value === undefined || row.value === '' ? t('unknownValue') : row.value}</dd></div>)}</dl>
      {metadata && <MetadataEditor kind={metadata.kind} id={metadata.id} />}
      {activity && <EntityActivity kind={activity.kind} id={activity.id} />}
      {children}
    </div>}
  </details>
}

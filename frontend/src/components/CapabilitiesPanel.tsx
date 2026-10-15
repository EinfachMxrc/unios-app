// SPDX-License-Identifier: AGPL-3.0-or-later

import { Link } from 'react-router-dom'
import { useT } from '@/i18n/useT'
import type { TypedT } from '@/i18n/useT'
import { useApi } from '@/api'
import { Panel } from '@/components/State'
import './CapabilitiesPanel.css'

type Capability = {
  key: string
  name: string
  status: 'ready' | 'attention' | 'disabled' | 'unavailable'
  detail: string
  href: string
}

function statusLabels(t: TypedT<'capabilities'>): Record<Capability['status'], string> {
  return {
    ready: t('statusReady'),
    attention: t('statusAttention'),
    disabled: t('statusDisabled'),
    unavailable: t('statusUnavailable'),
  }
}

export function CapabilitiesPanel({ simple = false }: { simple?: boolean }) {
  const { t } = useT('capabilities')
  const statusText = statusLabels(t)
  const { data, error } = useApi<Capability[]>('/api/capabilities')
  return (
    <Panel title={t('panelTitle')}>
      <p className="muted-text">{t('intro')}</p>
      {error && (
        <p role="alert" className="text-destructive">
          {t('loadErrorText')}
        </p>
      )}
      <div className="capability-list">
        {data
          ?.filter((item) => !simple || ['core', 'moodle', 'primuss', 'mycampus', 'anki', 'github'].includes(item.key))
          .map((item) => (
            <div className="capability-row" key={item.key}>
              <div>
                <strong>{item.name}</strong>
                <small>{item.detail}</small>
              </div>
              <Link to={item.href} className={`capability-state ${item.status}`}>
                {statusText[item.status]}
              </Link>
            </div>
          ))}
      </div>
    </Panel>
  )
}

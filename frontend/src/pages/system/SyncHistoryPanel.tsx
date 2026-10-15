// SPDX-License-Identifier: AGPL-3.0-or-later

import { Link, useLocation } from 'react-router-dom'
import { RefreshCw } from 'lucide-react'
import { localDate } from '@/api'
import { useT } from '@/i18n/useT'
import { Button } from '@/components/ui/button'
import { Empty, ListRows, Panel, Status } from '@/components/State'
import type { SystemResponse } from '@/types'

/** Past sync runs; with `targetOnly` just the run the address points to. */
export function SyncHistoryPanel({ runs, targetOnly = false }: { runs: SystemResponse['runs']; targetOnly?: boolean }) {
  const { hash } = useLocation()
  const { t } = useT('system')
  const shown = targetOnly ? runs.filter((item) => hash === `#sync-${item.id}`) : runs
  return (
    <Panel title={t('syncHistoryTitle')}>
      {shown.length ? (
        <ListRows>
          {shown.map((item) => (
            <div
              className={`data-row anchor-target ${hash === `#sync-${item.id}` ? 'is-target' : ''}`}
              id={`sync-${item.id}`}
              tabIndex={-1}
              key={item.id}
            >
              <span className="row-time">{localDate(item.started_at)}</span>
              <div>
                <Status value={item.status} />
                <p className="mt-2">
                  {t('syncSummary', {
                    courses: item.course_count,
                    resources: item.resource_count,
                    changes: item.change_count,
                  })}
                </p>
                {item.error && <span className="row-subtitle">{item.error}</span>}
              </div>
            </div>
          ))}
        </ListRows>
      ) : (
        <Empty
          icon={RefreshCw}
          title={t(targetOnly ? 'syncRunUnavailableTitle' : 'noSyncHistoryTitle')}
          text={t(targetOnly ? 'syncRunUnavailableText' : 'noSyncHistoryText')}
          action={
            targetOnly ? (
              <Button asChild variant="outline">
                <Link to="/activity?kind=sync">{t('openSyncActivity')}</Link>
              </Button>
            ) : undefined
          }
        />
      )}
    </Panel>
  )
}

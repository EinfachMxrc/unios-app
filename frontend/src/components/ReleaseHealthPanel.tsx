// SPDX-License-Identifier: AGPL-3.0-or-later
import { useApi, localDate } from '@/api'
import { useT } from '@/i18n/useT'
import { Panel } from '@/components/State'
import { Button } from '@/components/ui/button'

type Health = {
  checked_at: string
  database: { status: string; schema: string | null }
  index: { documents: number; pending: number; failed: number } | null
  allowed_entries: number | null
  connectors: { id: string; status: string; last_success_at: string | null }[]
}
type ConnectorDetail = { connector: string; status: string; message: string | null }
export function ReleaseHealthPanel({ connectorDetails = [] }: { connectorDetails?: ConnectorDetail[] }) {
  const { t } = useT('releaseSystem')
  const { data, error, loading, reload } = useApi<Health>('/api/release/health')
  const state = (value?: string) =>
    value === 'ok' || value === 'success'
      ? t('healthOkay')
      : value === 'error' || value === 'warning'
        ? t('healthProblem')
        : t('healthUnavailable')
  const connectorState = (value: string) =>
    value === 'warning' ? t('healthConnectorWarning') : value === 'error' ? t('healthConnectorError') : state(value)
  return (
    <Panel title={t('healthTitle')}>
      <p className="muted-text">{t('healthIntro')}</p>
      {error ? (
        <p role="status" className="mt-3">
          {t('healthUnavailable')}
        </p>
      ) : (
        <dl className="grid gap-3 mt-4 text-sm">
          <div>
            <dt className="font-medium">{t('healthDatabase')}</dt>
            <dd className="muted-text">{state(data?.database.status)}</dd>
          </div>
          <div>
            <dt className="font-medium">{t('healthIndex')}</dt>
            <dd className="muted-text">{data?.index ? t('healthIndexValue', data.index) : t('healthUnavailable')}</dd>
          </div>
          {data?.allowed_entries != null && (
            <div>
              <dt>{t('healthGrants', { count: data.allowed_entries })}</dt>
            </div>
          )}
          {Boolean(data?.connectors.length) && (
            <div>
              <dt className="font-medium">{t('healthConnectors')}</dt>
              <dd>
                {data?.connectors.map((item) => {
                  const detail = connectorDetails.find(
                    (row) => row.connector === item.id && row.status === item.status,
                  )?.message
                  return (
                    <div key={item.id} className="mt-2">
                      <p>
                        {item.id}: {connectorState(item.status)}
                      </p>
                      {item.last_success_at && (
                        <p className="muted-text">
                          {t('healthConnectorLastSuccess', { date: localDate(item.last_success_at) })}
                        </p>
                      )}
                      {(item.status === 'warning' || item.status === 'error' || detail) && (
                        <p className={item.status === 'ok' ? 'muted-text' : undefined}>
                          {detail || t('healthConnectorNoDetails')}
                        </p>
                      )}
                    </div>
                  )
                })}
              </dd>
            </div>
          )}
        </dl>
      )}
      {data && <p className="muted-text mt-3">{t('healthChecked', { date: localDate(data.checked_at) })}</p>}
      <Button variant="outline" disabled={loading} className="mt-4" onClick={reload}>
        {t('healthRefresh')}
      </Button>
    </Panel>
  )
}

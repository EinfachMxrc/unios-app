// SPDX-License-Identifier: AGPL-3.0-or-later
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Panel } from '@/components/State'
import { useT } from '@/i18n/useT'
import { allowUsageMetrics, usageMetrics } from '@/lib/usageMetrics'

export function UsageMetricsPanel() {
  const { t } = useT('releaseSystem')
  const [enabled, setEnabled] = useState(() => usageMetrics().enabled)
  function download() {
    const url = URL.createObjectURL(
      new Blob([JSON.stringify({ format: 1, counters: usageMetrics().counters }, null, 2)], {
        type: 'application/json',
      }),
    )
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = 'unios-usage.json'
    anchor.click()
    window.setTimeout(() => URL.revokeObjectURL(url), 1000)
  }
  return (
    <Panel title={t('metricsTitle')}>
      <p className="muted-text">{t('metricsIntro')}</p>
      <label className="flex items-center gap-3 mt-4">
        <input
          type="checkbox"
          checked={enabled}
          onChange={(event) => {
            allowUsageMetrics(event.target.checked)
            setEnabled(usageMetrics().enabled)
          }}
        />
        {t('metricsEnable')}
      </label>
      <div className="flex gap-2 flex-wrap mt-4">
        <Button variant="outline" disabled={!enabled} onClick={download}>
          {t('metricsExport')}
        </Button>
        <Button variant="outline" disabled={!enabled} onClick={() => allowUsageMetrics(true)}>
          {t('metricsReset')}
        </Button>
      </div>
    </Panel>
  )
}

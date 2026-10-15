// SPDX-License-Identifier: AGPL-3.0-or-later

import { Calculator } from 'lucide-react'
import { useT } from '@/i18n/useT'
import { activeIntlLocale, useApi } from '@/api'
import { Failure, Loading, Panel } from '@/components/State'
import type { CostEstimateView } from '@/types'

function euro(value: number, locale: string) {
  return value.toLocaleString(locale, { style: 'currency', currency: 'EUR', minimumFractionDigits: 2, maximumFractionDigits: 4 })
}

export function CostCalculatorPanel() {
  const { t } = useT('ai')
  const { data, error, loading } = useApi<CostEstimateView>('/api/ai/costs')
  const locale = activeIntlLocale()

  return (
    <Panel title={t('costCalculatorTitle')} action={<Calculator size={20} />}>
      <p className="muted-text mb-4">
        {t('costCalculatorIntro')}
      </p>
      {loading && !data ? <Loading /> : error ? <Failure message={error} /> : data && (
        <div className="row-list">
          {data.models.map((model) => (
            <div className="data-row" key={model.model}>
              <strong>{model.model}</strong>
              {model.stale_price && (
                <p className="row-subtitle text-destructive">{t('stalePriceWarning', { date: data.price_as_of })}</p>
              )}
              <p className="mt-1 text-sm">
                {t('oneTimeCostLine', { cost: euro(model.one_time_cost, locale), batchCost: euro(model.one_time_cost_with_batch, locale) })}
              </p>
              <p className="text-sm">
                {t('weeklyCostLine', { cost: euro(model.weekly_cost, locale), batchCost: euro(model.weekly_cost_with_batch, locale) })}
              </p>
            </div>
          ))}
        </div>
      )}
    </Panel>
  )
}

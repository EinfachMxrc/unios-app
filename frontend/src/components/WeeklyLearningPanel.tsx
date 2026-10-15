// SPDX-License-Identifier: AGPL-3.0-or-later

import { CalendarRange } from 'lucide-react'
import { useT } from '@/i18n/useT'
import { useApi } from '@/api'
import { Failure, Loading, Panel } from '@/components/State'
import type { WeeklyOverview } from '@/types'

export function WeeklyLearningPanel() {
  const { t } = useT('learning')
  const { data, error, loading } = useApi<WeeklyOverview>('/api/learning/weekly')

  return (
    <Panel title={t('weeklyPanelTitle')} action={<CalendarRange size={20} />}>
      {loading && !data ? <Loading /> : error ? <Failure message={error} /> : data && (
        <div className="grid gap-1 text-sm">
          <p>{t('weeklyLearnedSummary', { reviews: data.reviews_this_week, attempts: data.attempts_this_week })}</p>
          <p>{t('weeklyOpenSummary', { count: data.open_exercises })}</p>
          <p>
            {t('weeklyWeakLabel')}{' '}
            {data.weak_topics.length ? data.weak_topics.join(', ') : t('weeklyWeakNone')}
          </p>
        </div>
      )}
    </Panel>
  )
}

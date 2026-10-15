// SPDX-License-Identifier: AGPL-3.0-or-later

import { useState } from 'react'
import { useT } from '@/i18n/useT'
import { activeIntlLocale, useApi, localDate } from '@/api'
import type { DeadlinesResponse } from '@/types'
import { Panel } from '@/components/State'

type StudyBlock = { id: number; duration_minutes: number; starts_at: string; status: string }

export function TimeBudgetPanel() {
  const { t } = useT('learning')
  const { data } = useApi<DeadlinesResponse>('/api/deadlines')
  const { data: blocks } = useApi<StudyBlock[]>('/api/learning/blocks')
  const [deadlineId, setDeadlineId] = useState('')
  const [weeklyHours, setWeeklyHours] = useState('')
  const [estimatedHours, setEstimatedHours] = useState('')
  const deadline = data?.deadlines.find((item) => String(item.id) === deadlineId)
  const weekly = Number(weeklyHours)
  const estimated = Number(estimatedHours)
  const now = Date.now()
  const due = deadline ? new Date(deadline.due_at).getTime() : now
  const valid = Boolean(deadline && due > now && weeklyHours && estimatedHours &&
    Number.isFinite(weekly) && Number.isFinite(estimated) && weekly >= 0 && estimated >= 0)
  const days = (due - now) / 86_400_000
  const free = weekly * days / 7
  const scheduled = (blocks ?? []).filter((block) => block.status === 'accepted' &&
    new Date(block.starts_at).getTime() >= now && new Date(block.starts_at).getTime() <= due)
    .reduce((total, block) => total + block.duration_minutes / 60, 0)
  const buffer = free - scheduled - estimated
  const rounded = (value: number) => value.toLocaleString(activeIntlLocale(), { maximumFractionDigits: 1 })

  return <Panel title={t('timeBudgetTitle')}>
    <p className="muted-text">{t('timeBudgetIntro')}</p>
    <div className="budget-fields">
      <label>{t('deadlineLabel')}
        <select className="native-select" value={deadlineId} onChange={(event) => setDeadlineId(event.target.value)}>
          <option value="">{t('deadlineOptionPlaceholder')}</option>
          {data?.deadlines.filter((item) => new Date(item.due_at).getTime() > now).map((item) =>
            <option key={item.id} value={item.id}>{item.title} · {localDate(item.due_at)}</option>)}
        </select>
      </label>
      <label>{t('weeklyHoursLabel')}
        <input type="number" min="0" max="168" step="0.5" value={weeklyHours}
          onChange={(event) => setWeeklyHours(event.target.value)} />
      </label>
      <label>{t('estimatedHoursLabel')}
        <input type="number" min="0" max="1000" step="0.5" value={estimatedHours}
          onChange={(event) => setEstimatedHours(event.target.value)} />
      </label>
    </div>
    {valid && <div className="budget-result" role="status">
      <strong>{buffer >= 0 ? t('bufferPositive', { hours: rounded(buffer) }) : t('bufferNegative', { hours: rounded(buffer) })}</strong>
      <p>{t('budgetSummary', {
        weekly: rounded(weekly), days: rounded(days), free: rounded(free),
        scheduled: rounded(scheduled), estimated: rounded(estimated),
      })}</p>
      <p className="muted-text">{t('budgetDisclaimer')}</p>
    </div>}
  </Panel>
}

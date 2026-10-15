// SPDX-License-Identifier: AGPL-3.0-or-later

import { useEffect, useState } from 'react'
import { useT } from '@/i18n/useT'
import { request, useApi } from '@/api'
import { Button } from '@/components/ui/button'
import { ActionFeedback } from '@/components/ActionFeedback'
import { Failure, Panel } from '@/components/State'
import { useApiMutation } from '@/hooks/useApiMutation'
import { useWritableHost } from '@/hooks/host'
import './RuntimeSettingsPanel.css'
type Values = {
  sync_interval_minutes: number
  quiet_hours_start: number | null
  quiet_hours_end: number | null
  snapshot_interval_minutes: number
  deadline_warning_days: number[]
  automatic_takeover_enabled: boolean
}
type State = { values: Values; revision: number }
export function RuntimeSettingsPanel() {
  const { t } = useT('runtimeSettings')
  const canWrite = useWritableHost()
  const { data, error, reload } = useApi<State>('/api/runtime-settings')
  const [draft, setDraft] = useState<Values | null>(null)
  const [days, setDays] = useState('')
  useEffect(() => {
    if (!data) return
    setDraft(data.values)
    setDays(data.values.deadline_warning_days.join(', '))
  }, [data])
  const save = useApiMutation<State, void>(
    () => {
      if (!data || !draft) throw new Error(t('warningDaysValidationError'))
      const warningDays = days.split(',').map((item) => Number(item.trim()))
      if (warningDays.some((day) => !Number.isInteger(day) || day < 1 || day > 365)) {
        throw new Error(t('warningDaysValidationError'))
      }
      return request<State>('/api/runtime-settings', {
        method: 'PUT',
        body: JSON.stringify({
          expected_revision: data.revision,
          values: { ...draft, deadline_warning_days: warningDays },
        }),
      })
    },
    { onSuccess: () => reload() },
  )
  const busy = save.pending
  function change<K extends keyof Values>(key: K, value: Values[K]) {
    save.reset()
    setDraft((current) => (current ? { ...current, [key]: value } : current))
  }
  function triggerSave() {
    if (!data || !draft) return
    save.mutate()
  }
  return (
    <Panel title={t('panelTitle')}>
      <p className="muted-text">{t('intro')}</p>
      {error && <Failure message={error} />}
      {draft && (
        <div className="runtime-settings-grid">
          <label>
            {t('quietStartLabel')}
            <select
              className="native-select"
              value={draft.quiet_hours_start ?? ''}
              disabled={!canWrite || busy}
              onChange={(event) => {
                save.reset()
                const start = event.target.value === '' ? null : Number(event.target.value)
                setDraft((current) =>
                  current
                    ? {
                        ...current,
                        quiet_hours_start: start,
                        quiet_hours_end: start === null ? null : (current.quiet_hours_end ?? 6),
                      }
                    : current,
                )
              }}
            >
              <option value="">{t('offOption')}</option>
              {Array.from({ length: 24 }, (_, hour) => (
                <option key={hour} value={hour}>
                  {String(hour).padStart(2, '0')}:00
                </option>
              ))}
            </select>
          </label>
          <label>
            {t('quietEndLabel')}
            <select
              className="native-select"
              value={draft.quiet_hours_end ?? ''}
              disabled={!canWrite || busy || draft.quiet_hours_start === null}
              onChange={(event) => change('quiet_hours_end', Number(event.target.value))}
            >
              {Array.from({ length: 24 }, (_, hour) => (
                <option key={hour} value={hour}>
                  {String(hour).padStart(2, '0')}:00
                </option>
              ))}
            </select>
          </label>
          <label>
            {t('warningDaysLabel')}
            <input
              value={days}
              disabled={!canWrite || busy}
              onChange={(event) => {
                save.reset()
                setDays(event.target.value)
              }}
              placeholder={t('warningDaysPlaceholder')}
            />
          </label>
          <details className="runtime-technical">
            <summary>{t('details')}</summary>
            <div className="runtime-settings-grid">
              <label>
                {t('syncIntervalLabel')}
                <input
                  type="number"
                  min="5"
                  max="1440"
                  value={draft.sync_interval_minutes}
                  disabled={!canWrite || busy}
                  onChange={(event) => change('sync_interval_minutes', Number(event.target.value))}
                />
              </label>
              <label>
                {t('snapshotIntervalLabel')}
                <input
                  type="number"
                  min="1"
                  max="1440"
                  value={draft.snapshot_interval_minutes}
                  disabled={!canWrite || busy}
                  onChange={(event) => change('snapshot_interval_minutes', Number(event.target.value))}
                />
              </label>
              <label className="runtime-settings-check">
                <input
                  type="checkbox"
                  checked={draft.automatic_takeover_enabled}
                  disabled={!canWrite || busy}
                  onChange={(event) => change('automatic_takeover_enabled', event.target.checked)}
                />
                {t('autoTakeoverLabel')}
              </label>
            </div>
          </details>
        </div>
      )}
      <div className="runtime-settings-actions">
        <Button disabled={!canWrite || busy || !draft} aria-busy={busy} onClick={triggerSave}>
          {busy ? t('savingButton') : t('saveSettingsButton')}
        </Button>
      </div>
      {busy && <ActionFeedback tone="pending" message={t('savingFeedback')} />}
      {!busy && save.data && !save.error && <ActionFeedback tone="success" message={t('savedMessage')} />}
      {save.error && <ActionFeedback tone="error" message={save.error} />}
    </Panel>
  )
}

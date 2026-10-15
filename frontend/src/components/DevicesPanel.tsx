// SPDX-License-Identifier: AGPL-3.0-or-later

import { useContext, useState } from 'react'
import { CalendarDays, Copy, Smartphone } from 'lucide-react'
import { useT } from '@/i18n/useT'
import { localDate, request, useApi } from '@/api'
import { Empty, Failure, Loading, Panel } from '@/components/State'
import { Button } from '@/components/ui/button'
import { useApiMutation } from '@/hooks/useApiMutation'
import { HostContext, useWritableHost } from '@/hooks/host'
import type { DeviceView, IcalUrlView, PairingCodeView } from '@/types'

async function copyToClipboard(value: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(value)
    return true
  } catch {
    return false
  }
}

/** "Gerät koppeln": a one-time pairing link for a second device, and the list of already-paired devices. */
export function DevicesPanel() {
  const { t } = useT('devices')
  const canWrite = useWritableHost()
  const server = useContext(HostContext)?.topology === 'server'
  const { data: devices, error, loading } = useApi<DeviceView[]>('/api/session/devices')
  const [pairing, setPairing] = useState<PairingCodeView | null>(null)
  const [copyFeedback, setCopyFeedback] = useState('')
  const createCode = useApiMutation(() => request<PairingCodeView>('/api/session/pair-code', { method: 'POST' }), {
    onSuccess: (result) => {
      setPairing(result)
      setCopyFeedback('')
    },
  })
  const revoke = useApiMutation((id: string) => request(`/api/session/devices/${id}`, { method: 'DELETE' }), {
    invalidate: ['/api/session/devices'],
  })

  async function copyLink() {
    if (!pairing) return
    setCopyFeedback(
      (await copyToClipboard(server ? pairing.code : pairing.url))
        ? t('linkCopiedMessage')
        : t('clipboardUnavailableMessage'),
    )
  }

  function confirmRevoke(device: DeviceView) {
    const warning =
      device.label === 'Lokaler Browser'
        ? t('confirmRevokeLocalText')
        : t('confirmRevokeOtherText', { label: device.label })
    if (!window.confirm(warning)) return
    revoke.mutate(device.id)
  }

  return (
    <Panel title={t('panelTitle')} action={<Smartphone size={20} />}>
      <p className="muted-text mb-4">{t('intro')}</p>
      <Button onClick={() => createCode.mutate()} disabled={!canWrite || createCode.pending}>
        {t('pairDeviceButton')}
      </Button>
      {createCode.error && (
        <p role="alert" className="mt-3 text-sm text-destructive">
          {createCode.error}
        </p>
      )}
      {pairing && (
        <div className="mt-4 rounded-lg border border-border bg-background p-3">
          <p className="text-sm">{t(server ? 'enterCodeText' : 'openLinkText')}</p>
          <p className="mt-1 break-all text-sm font-mono">{server ? pairing.code : pairing.url}</p>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <Button size="sm" variant="outline" onClick={() => void copyLink()}>
              <Copy size={14} /> {t(server ? 'copyCodeButton' : 'copyLinkButton')}
            </Button>
            <span className="muted-text text-sm">{t('validUntilText', { date: localDate(pairing.expires_at) })}</span>
          </div>
          {copyFeedback && (
            <p role="status" className="mt-2 text-sm">
              {copyFeedback}
            </p>
          )}
        </div>
      )}
      {revoke.error && (
        <p role="alert" className="mt-3 text-sm text-destructive">
          {revoke.error}
        </p>
      )}
      <div className="mt-5">
        {loading && !devices ? (
          <Loading />
        ) : error ? (
          <Failure message={error} />
        ) : devices?.length ? (
          <div className="row-list">
            {devices.map((device) => (
              <div className="data-row" key={device.id}>
                <div className="min-w-0 flex-1">
                  <strong>{device.label}</strong>
                  <span className="row-subtitle">{t('lastActiveText', { date: localDate(device.last_seen_at) })}</span>
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={!canWrite || revoke.pending}
                  onClick={() => confirmRevoke(device)}
                >
                  {t('signOutButton')}
                </Button>
              </div>
            ))}
          </div>
        ) : (
          <Empty icon={Smartphone} title={t('emptyTitle')} text={t('emptyText')} />
        )}
      </div>
    </Panel>
  )
}

/** Private iCal subscription link for calendar apps (§24.6). */
const calendarSources = ['timetable', 'appointments', 'personal', 'deadlines', 'exams', 'study', 'periods'] as const
export function CalendarSubscriptionPanel() {
  const { t } = useT('devices')
  const { data, error, loading } = useApi<IcalUrlView>('/api/session/ical-url')
  const canWrite = useWritableHost()
  const [copyFeedback, setCopyFeedback] = useState('')
  const rotate = useApiMutation(
    () =>
      request<IcalUrlView>('/api/session/ical-url/rotate', {
        method: 'POST',
        body: JSON.stringify({ confirmed: true }),
      }),
    { invalidate: ['/api/session/ical-url'], onSuccess: () => setCopyFeedback('') },
  )
  const current = rotate.data ?? data
  const [sources, setSources] = useState<string[]>(() => {
    try {
      const saved: unknown = JSON.parse(localStorage.getItem('unios-ical-sources-v1') ?? 'null')
      if (Array.isArray(saved) && saved.every((value) => calendarSources.includes(value))) return saved
    } catch {
      /* Display settings are optional. */
    }
    return [...calendarSources]
  })
  function selectSources(next: string[]) {
    setSources(next)
    setCopyFeedback('')
    try {
      localStorage.setItem('unios-ical-sources-v1', JSON.stringify(next))
    } catch {
      /* Keep this window usable. */
    }
  }
  const selectedUrl = current
    ? (() => {
        const url = new URL(current.url)
        if (sources.length !== calendarSources.length) url.searchParams.set('sources', sources.join(','))
        return url.toString()
      })()
    : ''

  async function copyLink() {
    if (!current) return
    setCopyFeedback((await copyToClipboard(selectedUrl)) ? t('linkCopiedMessage') : t('clipboardUnavailableMessage'))
  }

  return (
    <Panel title={t('calendarPanelTitle')} action={<CalendarDays size={20} />}>
      <p className="muted-text mb-4">{t('calendarIntro')}</p>
      {loading && !data ? (
        <Loading />
      ) : error ? (
        <Failure message={error} />
      ) : (
        current && (
          <>
            <fieldset className="calendar-export-sources">
              <legend>{t('calendarSources')}</legend>
              <div className="flex flex-wrap gap-2 my-2">
                <Button size="sm" variant="outline" onClick={() => selectSources([...calendarSources])}>
                  {t('calendarExportAll')}
                </Button>
                <Button size="sm" variant="outline" onClick={() => selectSources(['timetable'])}>
                  {t('calendarExportTimetable')}
                </Button>
              </div>
              {calendarSources.map((source) => (
                <label key={source} className="flex items-center gap-2 py-1 text-sm">
                  <input
                    type="checkbox"
                    checked={sources.includes(source)}
                    onChange={(event) =>
                      selectSources(
                        event.target.checked ? [...sources, source] : sources.filter((value) => value !== source),
                      )
                    }
                  />
                  {t(`calendarSource_${source}`)}
                </label>
              ))}
            </fieldset>
            {!sources.length && (
              <p role="status" className="muted-text">
                {t('calendarChooseSource')}
              </p>
            )}
            {!!sources.length && <p className="break-all text-sm font-mono mt-3">{selectedUrl}</p>}
            <Button
              size="sm"
              variant="outline"
              className="mt-3"
              disabled={!sources.length}
              onClick={() => void copyLink()}
            >
              <Copy size={14} /> {t('copyLinkButton')}
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="mt-3 ml-2"
              disabled={!canWrite || rotate.pending}
              onClick={() => {
                if (window.confirm(t('confirmRotateCalendarLink'))) rotate.mutate()
              }}
            >
              {t('rotateCalendarLink')}
            </Button>
            {rotate.error && (
              <p role="alert" className="mt-2 text-sm text-destructive">
                {rotate.error}
              </p>
            )}
            {copyFeedback && (
              <p role="status" className="mt-2 text-sm">
                {copyFeedback}
              </p>
            )}
          </>
        )
      )}
    </Panel>
  )
}

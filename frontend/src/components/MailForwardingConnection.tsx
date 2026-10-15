// SPDX-License-Identifier: AGPL-3.0-or-later
import { useState } from 'react'
import { Copy } from 'lucide-react'
import { localDate, request, useApi } from '@/api'
import { useT } from '@/i18n/useT'
import { useWritableHost } from '@/hooks/host'
import { Button } from './ui/button'
import { Failure, Panel } from './State'
import { extractApiErrorMessage } from '@/hooks/useApiMutation'

export type ForwardingStatus = {
  configured: boolean
  address: string
  ready: boolean
  connected: boolean
  last_success_at: string | null
  last_error: string
}

export function MailForwardingConnection({
  status,
  reload,
  onImported,
}: {
  status: ForwardingStatus
  reload: () => void
  onImported: () => void
}) {
  const { t } = useT('mail')
  const canWrite = useWritableHost()
  const [busy, setBusy] = useState(false)
  const [failure, setFailure] = useState('')
  const [message, setMessage] = useState('')
  async function action(sync: boolean) {
    setBusy(true)
    setFailure('')
    setMessage('')
    try {
      if (sync) {
        const report = await request<{ read: number; created: number; skipped: number; limited: boolean }>(
          '/api/mail/forwarding/sync',
          { method: 'POST' },
        )
        setMessage(
          t('readReport', report) +
            (report.skipped ? ` · ${t('skipped', report)}` : '') +
            (report.limited ? ` ${t('forwardingLimit')}` : ''),
        )
        onImported()
      } else
        await request('/api/mail/forwarding', { method: 'PUT', body: JSON.stringify({ enabled: !status.connected }) })
      reload()
    } catch (cause) {
      setFailure(extractApiErrorMessage(cause))
      reload()
    } finally {
      setBusy(false)
    }
  }
  return (
    <Panel title={t('forwardingTitle')}>
      <p className="muted-text">{t('forwardingIntro')}</p>
      <label className="form-stack mt-3">
        {t('forwardingAddress')}
        <input className="native-input" readOnly value={status.address} />
      </label>
      <div className="page-actions mt-3">
        <Button
          variant="outline"
          onClick={() => {
            void navigator.clipboard
              .writeText(status.address)
              .then(() => setMessage(t('addressCopied')))
              .catch(() => setFailure(t('copyAddressFailed')))
          }}
        >
          <Copy size={16} />
          {t('copyAddress')}
        </Button>
        {status.ready && (
          <>
            <Button disabled={!canWrite || busy || !status.connected} onClick={() => void action(true)}>
              {busy ? t('reading') : t('readNow')}
            </Button>
            <Button variant="ghost" disabled={!canWrite || busy} onClick={() => void action(false)}>
              {status.connected ? t('pauseForwarding') : t('resumeForwarding')}
            </Button>
          </>
        )}
      </div>
      <p className="mt-3" role="status">
        {!status.ready ? t('forwardingNotReady') : status.connected ? t('forwardingActive') : t('forwardingPaused')}
      </p>
      {status.last_success_at && (
        <p className="row-subtitle">{t('lastRead', { date: localDate(status.last_success_at) })}</p>
      )}
      <details className="mt-3">
        <summary>{t('forwardingSetup')}</summary>
        <p>{t('forwardingInstructions')}</p>
        <p className="muted-text">{t('forwardingStorage')}</p>
      </details>
      {message && (
        <p role="status" className="mt-3">
          {message}
        </p>
      )}
      {(failure || status.last_error) && <Failure message={failure || status.last_error} />}
    </Panel>
  )
}

export function useMailForwarding() {
  return useApi<ForwardingStatus>('/api/mail/forwarding', { refetchInterval: 60_000 })
}

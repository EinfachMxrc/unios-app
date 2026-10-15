// SPDX-License-Identifier: AGPL-3.0-or-later
import { useEffect, useRef, useState } from 'react'
import { localDate, request, useApi } from '@/api'
import { useT } from '@/i18n/useT'
import { useWritableHost } from '@/hooks/host'
import { desktopCrawlBridge, isDesktopApp, openExternalUrl, openUniversityMail, portalStatus } from '@/lib/desktop'
import { readMailWindow } from '@/lib/mailCrawl'
import { rememberWorkspace, workspaceValue } from '@/lib/workspaceState'
import type { UniversityServices } from '@/lib/mensa'
import { Button } from './ui/button'
import { Failure, Panel } from './State'
import { extractApiErrorMessage } from '@/hooks/useApiMutation'

type Status = {
  connected: boolean
  client_id: string
  keyring_available: boolean
  last_success_at: string | null
  last_error: string
}
type Login = { user_code: string; verification_url: string; interval: number; expires_in: number }
type Report = { read: number; created: number; skipped: number; limited: boolean }
type OwaReport = { read: number; created: number; skipped: number }
const OWA_SEEN_KEY = 'mail:owa-scan-seen-rows'

export function MailImportConnection({ onImported }: { onImported: () => void }) {
  const { t } = useT('mail')
  const { data, error, reload } = useApi<Status>('/api/mail/connection', { refetchInterval: 60_000 })
  const canWrite = useWritableHost()
  const [clientId, setClientId] = useState('')
  const [login, setLogin] = useState<Login | null>(null)
  const [busy, setBusy] = useState(false)
  const [failure, setFailure] = useState('')
  const [report, setReport] = useState<Report | null>(null)
  const imported = useRef(onImported)
  useEffect(() => {
    imported.current = onImported
  }, [onImported])
  const services = useApi<UniversityServices>('/api/mensa/services')
  const [owaBusy, setOwaBusy] = useState(false)
  const [owaProgress, setOwaProgress] = useState(0)
  const [owaReport, setOwaReport] = useState<OwaReport | null>(null)
  const [owaPartial, setOwaPartial] = useState(false)
  const [owaFailure, setOwaFailure] = useState('')

  async function sync() {
    setBusy(true)
    setFailure('')
    setReport(null)
    try {
      setReport(await request<Report>('/api/mail/connection/sync', { method: 'POST' }))
      imported.current()
      reload()
    } catch (cause) {
      setFailure(extractApiErrorMessage(cause))
      reload()
    } finally {
      setBusy(false)
    }
  }
  async function begin() {
    setBusy(true)
    setFailure('')
    try {
      const result = await request<Login>('/api/mail/connection/start', {
        method: 'POST',
        body: JSON.stringify({ client_id: clientId.trim() || data?.client_id }),
      })
      setLogin(result)
    } catch (cause) {
      setFailure(extractApiErrorMessage(cause))
    } finally {
      setBusy(false)
    }
  }
  useEffect(() => {
    if (!login || !canWrite) return
    let stopped = false
    let timer: ReturnType<typeof setTimeout>
    const expires = Date.now() + login.expires_in * 1000
    async function poll() {
      if (Date.now() >= expires) {
        setLogin(null)
        setFailure(t('loginExpired'))
        return
      }
      try {
        const result = await request<{ connected: boolean; interval: number }>('/api/mail/connection/poll', {
          method: 'POST',
        })
        if (stopped) return
        if (result.connected) {
          setLogin(null)
          reload()
          setReport(await request<Report>('/api/mail/connection/sync', { method: 'POST' }))
          imported.current()
          reload()
        } else timer = setTimeout(() => void poll(), Math.max(5, result.interval) * 1000)
      } catch (cause) {
        if (!stopped) {
          setFailure(extractApiErrorMessage(cause))
          setLogin(null)
          reload()
        }
      }
    }
    timer = setTimeout(() => void poll(), login.interval * 1000)
    return () => {
      stopped = true
      clearTimeout(timer)
    }
  }, [login, canWrite, reload, t])

  async function scanViaBrowser() {
    const mailUrl = services.data?.mail_url
    if (!mailUrl) return
    setOwaBusy(true)
    setOwaFailure('')
    setOwaReport(null)
    setOwaPartial(false)
    setOwaProgress(0)
    try {
      try {
        await portalStatus('mail')
      } catch {
        await openUniversityMail(mailUrl)
      }
      const seenRows = workspaceValue<string[]>(OWA_SEEN_KEY, [], { valid: Array.isArray })
      const result = await readMailWindow(desktopCrawlBridge('mail'), new Set(seenRows), setOwaProgress)
      if (result.messages.length) {
        const sent = await request<OwaReport>('/api/mail/connection/owa-import', {
          method: 'POST',
          body: JSON.stringify({
            messages: result.messages.map((message) => ({
              message_key: message.messageKey,
              sender: message.sender,
              subject: message.subject,
              received_at: message.receivedAt,
              body: message.body,
            })),
          }),
        })
        setOwaReport(sent)
        rememberWorkspace(OWA_SEEN_KEY, [...seenRows, ...result.messages.map((m) => m.messageKey)].slice(-2000))
        imported.current()
        reload()
      } else {
        setOwaReport({ read: 0, created: 0, skipped: 0 })
      }
      setOwaPartial(result.partial)
    } catch (cause) {
      setOwaFailure(
        cause instanceof Error && cause.message === 'login-required'
          ? t('owaLoginNeeded')
          : cause instanceof Error && cause.message === 'traversal-unavailable'
            ? t('owaTraversalUnavailable')
            : extractApiErrorMessage(cause),
      )
    } finally {
      setOwaBusy(false)
    }
  }

  async function disconnect() {
    setBusy(true)
    setFailure('')
    try {
      await request('/api/mail/connection', { method: 'DELETE' })
      setLogin(null)
      setReport(null)
      reload()
    } catch (cause) {
      setFailure(extractApiErrorMessage(cause))
    } finally {
      setBusy(false)
    }
  }
  const hasId = /^[0-9a-f]{8}-[0-9a-f-]{27}$/i.test(clientId.trim() || data?.client_id || '')
  return (
    <Panel title={t('connectionTitle')}>
      <p className="muted-text">{t('connectionIntro')}</p>
      {data?.connected ? (
        <>
          <p>
            {t('connected')}
            {data.last_success_at && ` · ${t('lastRead', { date: localDate(data.last_success_at) })}`}
          </p>
          <div className="page-actions">
            <Button disabled={!canWrite || busy} onClick={() => void sync()}>
              {busy ? t('reading') : t('readNow')}
            </Button>
            <Button variant="ghost" disabled={!canWrite || busy} onClick={() => void disconnect()}>
              {t('disconnect')}
            </Button>
          </div>
        </>
      ) : (
        <>
          {!data?.client_id && <p>{t('registrationMissing')}</p>}
          <details className="mt-3">
            <summary>{t('registrationSettings')}</summary>
            <p className="muted-text">{t('registrationHelp')}</p>
            <label className="form-stack">
              {t('clientId')}
              <input
                className="native-input"
                value={clientId || data?.client_id || ''}
                onChange={(event) => setClientId(event.target.value)}
                maxLength={36}
                autoComplete="off"
              />
            </label>
            <a
              href="https://learn.microsoft.com/en-us/graph/tutorials/powershell#register-the-application"
              target="_blank"
              rel="noopener noreferrer"
            >
              {t('registrationDocs')}
            </a>
          </details>
          <Button
            className="mt-3"
            disabled={!canWrite || !data?.keyring_available || !hasId || busy || !!login}
            onClick={() => void begin()}
          >
            {t('connectMicrosoft')}
          </Button>
        </>
      )}
      {login && (
        <div role="status" className="mt-3">
          <p>
            {t('loginCode')} <strong>{login.user_code}</strong>
          </p>
          <p className="muted-text">{t('loginInstructions')}</p>
          <Button
            variant="outline"
            onClick={() => {
              if (isDesktopApp())
                void openExternalUrl(login.verification_url).catch((cause) => setFailure(extractApiErrorMessage(cause)))
              else window.open(login.verification_url, '_blank', 'noopener,noreferrer')
            }}
          >
            {t('openMicrosoft')}
          </Button>
        </div>
      )}
      {report && (
        <p role="status" className="mt-3">
          {t('readReport', report)}
          {report.limited && ` ${t('readLimit')}`}
          {report.skipped > 0 && ` ${t('skipped', report)}`}
        </p>
      )}
      {data && !data.keyring_available && <p>{t('keyringUnavailable')}</p>}
      {(error || failure || data?.last_error) && <Failure message={error || failure || data?.last_error || ''} />}
      {isDesktopApp() && (
        <div className="mt-3">
          <p className="muted-text">{t('owaScanIntro')}</p>
          <Button
            variant="outline"
            disabled={!canWrite || owaBusy || !services.data?.mail_url}
            onClick={() => void scanViaBrowser()}
          >
            {owaBusy ? t('owaScanBusy') : t('owaScanButton')}
          </Button>
          {owaBusy && owaProgress > 0 && <p role="status">{t('owaScanProgress', { count: owaProgress })}</p>}
          {owaReport && (
            <p role="status">
              {t('owaReadReport', owaReport)}
              {owaPartial && ` ${t('owaScanPartial')}`}
            </p>
          )}
          {owaFailure && <Failure message={owaFailure} />}
        </div>
      )}
    </Panel>
  )
}

// SPDX-License-Identifier: AGPL-3.0-or-later

import { MailConnection } from '@/components/MailConnection'
import { MailImportConnection } from '@/components/MailImportConnection'
import { MailForwardingConnection, useMailForwarding } from '@/components/MailForwardingConnection'
import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Mail } from 'lucide-react'
import { useT } from '@/i18n/useT'
import { localDate, request, useApi } from '@/api'
import { Button } from '@/components/ui/button'
import { Shell } from '@/components/Shell'
import { Empty, Failure, ListRows, Loading, Panel } from '@/components/State'
import { useWritableHost } from '@/hooks/host'
import { calendarInputInstant } from '@/lib/calendarEditing'
import { extractApiErrorMessage } from '@/hooks/useApiMutation'
import './ProductPlatform.css'

type MailItem = {
  id: number
  sender: string
  subject: string
  received_at: string | null
  candidate_date: string | null
  status: 'info' | 'proposed' | 'accepted' | 'dismissed'
  deadline_id: number | null
  imported_at: string
}
type ImportResult = { id: number; created: boolean; candidate_date: string | null }

export function MailPage() {
  const { t } = useT('mail')
  const { data, error, loading, updatedAt, reload } = useApi<MailItem[]>('/api/mail', { refetchInterval: 60_000 })
  const canWrite = useWritableHost()
  const forwarding = useMailForwarding()
  const [file, setFile] = useState<File | null>(null)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const [actionError, setActionError] = useState('')
  const [activeId, setActiveId] = useState<number | null>(null)
  const [title, setTitle] = useState('')
  const [dueAt, setDueAt] = useState('')

  async function importSelected() {
    if (!file) return
    setBusy(true)
    setActionError('')
    setMessage('')
    try {
      const body = new FormData()
      body.append('file', file)
      const result = await request<ImportResult>('/api/mail/import', { method: 'POST', body })
      setMessage(
        result.created
          ? result.candidate_date
            ? t('importedWithDateMessage')
            : t('importedNoDateMessage')
          : t('alreadyImportedMessage'),
      )
      setFile(null)
      reload()
    } catch (cause) {
      setActionError(extractApiErrorMessage(cause))
    } finally {
      setBusy(false)
    }
  }

  async function confirm() {
    if (activeId === null || !title.trim() || !dueAt) return
    const dueInstant = calendarInputInstant(dueAt)
    if (!dueInstant) {
      setActionError(t('invalidCampusDateTime'))
      return
    }
    setBusy(true)
    setActionError('')
    try {
      await request(`/api/mail/${activeId}/confirm`, {
        method: 'POST',
        body: JSON.stringify({ title: title.trim(), due_at: dueInstant }),
      })
      setActiveId(null)
      setMessage(t('deadlineConfirmedMessage'))
      reload()
    } catch (cause) {
      setActionError(extractApiErrorMessage(cause))
    } finally {
      setBusy(false)
    }
  }

  async function dismiss(id: number) {
    setBusy(true)
    setActionError('')
    try {
      await request(`/api/mail/${id}/dismiss`, { method: 'POST' })
      setActiveId(null)
      reload()
    } catch (cause) {
      setActionError(extractApiErrorMessage(cause))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Shell title={t('pageTitle')} eyebrow={t('pageEyebrow')} cachedAt={updatedAt}>
      <MailConnection />
      {message && <p role="status">{message}</p>}
      {actionError && <Failure message={actionError} />}
      <Panel title={t('selectedMessagesPanelTitle')}>
        {loading && !data ? (
          <Loading />
        ) : error ? (
          <Failure message={error} />
        ) : data?.length ? (
          <ListRows>
            {data.map((item) => (
              <div className="data-row" key={item.id}>
                <div>
                  <strong>{item.subject}</strong>
                  <p className="row-subtitle">
                    {item.sender} · {localDate(item.received_at ?? item.imported_at)}
                  </p>
                  {item.status === 'proposed' && (
                    <p>{t('candidateDateLine', { date: item.candidate_date?.split('-').reverse().join('.') })}</p>
                  )}
                  {item.status === 'info' && <p>{t('noClearDeadlineText')}</p>}
                  {item.status === 'accepted' && (
                    <p>
                      {t('confirmedDeadlineText')} <Link to="/deadlines">{t('deadlinesLinkLabel')}</Link>.
                    </p>
                  )}
                  {item.status === 'dismissed' && <p>{t('dismissedText')}</p>}
                  {item.status === 'proposed' && activeId === item.id && (
                    <div className="form-stack">
                      <label>
                        {t('deadlineTitleLabel')}
                        <input
                          className="native-input"
                          value={title}
                          maxLength={500}
                          onChange={(event) => setTitle(event.target.value)}
                        />
                      </label>
                      <label>
                        {t('dateTimeLabel')}
                        <input
                          className="native-input"
                          type="datetime-local"
                          aria-label={t('dateTimeLabel')}
                          aria-describedby="mail-deadline-campus"
                          value={dueAt}
                          onChange={(event) => setDueAt(event.target.value)}
                        />
                        <small id="mail-deadline-campus">{t('campusTimeHint', { zone: 'Europe/Berlin' })}</small>
                      </label>
                      <Button disabled={!canWrite || busy || !title.trim() || !dueAt} onClick={() => void confirm()}>
                        {t('confirmDeadlineButton')}
                      </Button>
                    </div>
                  )}
                  {item.status === 'proposed' && activeId !== item.id && (
                    <Button
                      variant="outline"
                      disabled={!canWrite || busy}
                      onClick={() => {
                        setActiveId(item.id)
                        setTitle(item.subject)
                        setDueAt('')
                      }}
                    >
                      {t('checkDateButton')}
                    </Button>
                  )}
                  {(item.status === 'proposed' || item.status === 'info') && (
                    <Button variant="ghost" disabled={!canWrite || busy} onClick={() => void dismiss(item.id)}>
                      {t('finishWithoutDeadlineButton')}
                    </Button>
                  )}
                </div>
              </div>
            ))}
          </ListRows>
        ) : (
          <Empty icon={Mail} title={t('emptyTitle')} text={t('emptyText')} />
        )}
      </Panel>
      <details className="mail-settings">
        <summary>{t('connectionSettings')}</summary>
        {forwarding.error && <Failure message={forwarding.error} />}
        {forwarding.data?.configured ? (
          <>
            <MailForwardingConnection status={forwarding.data} reload={forwarding.reload} onImported={reload} />
            <details>
              <summary>{t('alternativeMicrosoft')}</summary>
              <MailImportConnection onImported={reload} />
            </details>
          </>
        ) : (
          <MailImportConnection onImported={reload} />
        )}
        <Panel title={t('chooseMessagePanelTitle')}>
          <p className="muted-text">{t('chooseMessageIntro')}</p>
          <div className="page-actions">
            <input
              aria-label={t('chooseSavedMailAria')}
              type="file"
              accept=".eml,message/rfc822"
              onChange={(event) => setFile(event.target.files?.[0] ?? null)}
            />
            <Button disabled={!canWrite || !file || busy} onClick={() => void importSelected()}>
              {busy ? t('checkingMessageButton') : t('checkMessageButton')}
            </Button>
          </div>
        </Panel>
      </details>
    </Shell>
  )
}

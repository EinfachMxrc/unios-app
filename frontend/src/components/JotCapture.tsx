// SPDX-License-Identifier: AGPL-3.0-or-later

import { useContext, useState } from 'react'
import type { FormEvent } from 'react'
import { useT } from '@/i18n/useT'
import { Button } from '@/components/ui/button'
import { ActionFeedback } from '@/components/ActionFeedback'
import { HostContext } from '@/hooks/host'
import { useHostOnline } from '@/hostAvailability'
import { queueJot } from '@/jotQueue'
import type { Jot } from '@/types'
import { useWorkspaceState, workspaceValue } from '@/lib/workspaceState'
import { extractApiErrorMessage } from '@/hooks/useApiMutation'

export function JotCapture({ compact = false }: { compact?: boolean }) {
  const { t } = useT('jots')
  const host = useContext(HostContext)
  const online = useHostOnline()
  const [kind, setKind] = useWorkspaceState<Jot['kind']>('capture:jot:kind', 'thought', { persist: false })
  const [body, setBody] = useWorkspaceState('capture:jot:body', '', { persist: false })
  const [busy, setBusy] = useWorkspaceState('capture:jot:pending', false, { persist: false })
  const [message, setMessage] = useState('')
  const [failed, setFailed] = useState(false)
  const canCapture = !online || host?.mode === 'host'

  async function submit(event: FormEvent) {
    event.preventDefault()
    if (workspaceValue('capture:jot:pending', false)) return
    setBusy(true)
    setMessage('')
    setFailed(false)
    try {
      await queueJot(kind, body)
      setBody('')
      setMessage(t('savedMessage'))
    } catch (cause) {
      setFailed(true)
      setMessage(t('saveFailedMessage', { error: extractApiErrorMessage(cause) }))
    } finally {
      setBusy(false)
    }
  }

  return (
    <form className={`jot-capture ${compact ? 'jot-capture-compact' : ''}`} onSubmit={submit}>
      <div className="jot-capture-fields">
        <select
          className="native-select"
          aria-label={t('captureKindAria')}
          value={kind}
          onChange={(event) => {
            setMessage('')
            setKind(event.target.value as Jot['kind'])
          }}
          disabled={busy || !canCapture}
        >
          <option value="thought">{t('kindThought')}</option>
          <option value="question">{t('kindQuestion')}</option>
          <option value="todo">{t('kindTodo')}</option>
        </select>
        <textarea
          aria-label={t('captureBodyAria')}
          className="jot-textarea"
          value={body}
          onChange={(event) => {
            setMessage('')
            setBody(event.target.value)
          }}
          maxLength={10_000}
          placeholder={t('capturePlaceholder')}
          disabled={busy || !canCapture}
          required
        />
      </div>
      <div className="jot-capture-actions">
        <Button type="submit" aria-busy={busy} disabled={busy || !canCapture || !body.trim()}>
          {busy ? t('savingButton') : t('captureButton')}
        </Button>
        {online && host?.mode !== 'host' && <span className="muted-text">{t('readOnlyDeviceText')}</span>}
        {!online && <span className="muted-text">{t('offlineQueuedText')}</span>}
      </div>
      {busy && <ActionFeedback tone="pending" message={t('savingFeedback')} />}
      {message && <ActionFeedback tone={failed ? 'error' : 'success'} message={message} />}
    </form>
  )
}

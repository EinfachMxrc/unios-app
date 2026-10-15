// SPDX-License-Identifier: AGPL-3.0-or-later
import { useState } from 'react'
import { Mail } from 'lucide-react'
import { useApi } from '@/api'
import { useT } from '@/i18n/useT'
import { isDesktopApp, openUniversityMail } from '@/lib/desktop'
import type { UniversityServices } from '@/lib/mensa'
import { setModule, usePreferences } from '@/preferences'
import { saveSidebarLayout, useSidebarLayout } from './sidebarLayout'
import { Button } from './ui/button'
import { Failure, Panel } from './State'
import { extractApiErrorMessage } from '@/hooks/useApiMutation'

export function MailConnection() {
  const { t } = useT('mensa')
  const { data, error } = useApi<UniversityServices>('/api/mensa/services')
  const preferences = usePreferences()
  const layout = useSidebarLayout(preferences)
  const [message, setMessage] = useState('')
  const [failure, setFailure] = useState('')
  const [busy, setBusy] = useState(false)
  const pinned = layout.workspace.includes('mail') || layout.library.includes('mail')
  async function open() {
    if (!data?.mail_url) return
    setFailure(''); setBusy(true)
    try {
      if (isDesktopApp()) await openUniversityMail(data.mail_url)
      else window.open(data.mail_url, '_blank', 'noopener,noreferrer')
      setMessage(t('mailOpened'))
    } catch (cause) { setFailure(extractApiErrorMessage(cause)) }
    finally { setBusy(false) }
  }
  function pin() {
    try {
      setModule('mail', true)
      saveSidebarLayout({ ...layout, library: [...layout.library.filter((id) => id !== 'mail'), 'mail'] })
      setMessage(t('saved'))
    } catch { setFailure(t('saveError')) }
  }
  return <Panel title={t('mailTitle')}>
    <p className="muted-text">{t('mailIntro')}</p>
    <div className="page-actions"><Button disabled={!data?.mail_url || busy} onClick={() => void open()}><Mail size={16} />{isDesktopApp() ? t('mailOpen') : t('mailBrowser')}</Button>
      {!pinned && <Button variant="outline" onClick={pin}>{t('mailEnable')}</Button>}</div>
    {data && !data.mail_url && <p>{t('mailUnavailable')}</p>}
    {message && <p role="status">{message}</p>}
    {(error || failure) && <Failure message={error || failure} />}
    <p className="row-subtitle mt-3">{t('mailNotice')}</p>
  </Panel>
}

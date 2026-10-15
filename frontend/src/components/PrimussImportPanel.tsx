// SPDX-License-Identifier: AGPL-3.0-or-later
import { useState } from 'react'
import { useT } from '@/i18n/useT'
import { notifySyncCompleted, request } from '@/api'
import { Button } from '@/components/ui/button'
import { capturePortalLogin, desktopCrawlBridge, isDesktopApp, openPortalLogin, portalStatus } from '@/lib/desktop'
import { readPrimussWindow } from '@/lib/primussCrawl'
import { extractApiErrorMessage } from '@/hooks/useApiMutation'

type Report = {
  pages: number
  documents: number
  files_stored: number
  skipped: number
  partial?: boolean
  warnings: string[]
}
export function PrimussImportPanel({ disabled, loginUrl }: { disabled: boolean; loginUrl?: string }) {
  const { t } = useT('setup')
  const [busy, setBusy] = useState(false)
  const [report, setReport] = useState<Report | null>(null)
  const [error, setError] = useState('')
  const [progress, setProgress] = useState(0)
  async function read() {
    setBusy(true)
    setError('')
    setReport(null)
    setProgress(0)
    try {
      let body: string | undefined
      if (isDesktopApp() && loginUrl) {
        try {
          await portalStatus('primuss')
        } catch {
          await openPortalLogin('primuss', loginUrl)
        }
        const collected = await readPrimussWindow(desktopCrawlBridge('primuss'), setProgress)
        const session = await capturePortalLogin('primuss')
        await request('/api/setup/portals/primuss/session', { method: 'POST', body: JSON.stringify(session) })
        body = JSON.stringify(collected)
      }
      setReport(await request<Report>('/api/primuss/import', { method: 'POST', body }))
      notifySyncCompleted()
    } catch (cause) {
      setError(
        cause instanceof Error && cause.message === 'login-required'
          ? t('primussLoginNeeded')
          : extractApiErrorMessage(cause),
      )
    } finally {
      setBusy(false)
    }
  }
  return (
    <div>
      <p className="muted-text">{t('primussImportHint')}</p>
      <Button variant="outline" disabled={disabled || busy} onClick={() => void read()}>
        {busy ? t('primussImportBusy') : t('primussImportButton')}
      </Button>
      {busy && progress > 0 && <p role="status">{t('primussReadProgress', { count: progress })}</p>}
      {report && (
        <div role="status">
          <p>
            {t('primussImportResult', {
              pages: report.pages,
              documents: report.documents,
              stored: report.files_stored,
            })}
          </p>
          {(report.partial || report.pages <= 1) && <p role="alert">{t('primussPartial')}</p>}
          {report.warnings.map((warning) => (
            <p className="muted-text" key={warning}>
              {warning}
            </p>
          ))}
        </div>
      )}
      {error && <p role="alert">{error}</p>}
    </div>
  )
}

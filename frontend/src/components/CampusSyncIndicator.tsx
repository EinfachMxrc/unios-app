// SPDX-License-Identifier: AGPL-3.0-or-later

import { useEffect, useRef, useState } from 'react'
import { Check, CircleAlert, RefreshCw } from 'lucide-react'
import { notifySyncCompleted } from '@/api'
import { useCampusImport } from '@/hooks/useCampusImport'
import { useHostOnline } from '@/hostAvailability'
import { useT } from '@/i18n/useT'

/** Stays mounted while the user navigates; never blocks the page or the import. */
export function CampusSyncIndicator() {
  const { t } = useT('campus')
  const { status } = useCampusImport()
  const online = useHostOnline()
  const previous = useRef(status?.state)
  const [finished, setFinished] = useState(false)
  useEffect(() => {
    let timer: number | undefined
    if (previous.current === 'running' && status?.state === 'done') {
      setFinished(true)
      notifySyncCompleted()
      timer = window.setTimeout(() => setFinished(false), 8_000)
    } else if (status?.state === 'running') {
      setFinished(false)
    }
    previous.current = status?.state
    return () => window.clearTimeout(timer)
  }, [status?.state])

  const running = status?.state === 'running'
  const failed = status?.state === 'error'
  if (!online || (!running && !failed && !finished)) return null
  const warnings = !!status?.report?.warnings.length
  const Icon = running ? RefreshCw : failed || warnings ? CircleAlert : Check
  return (
    <aside className="campus-sync-indicator" aria-label={t('syncStatusLabel')} data-state={status?.state}>
      <span role="status" aria-live="polite" aria-atomic="true" className="campus-sync-summary">
        <Icon size={17} aria-hidden="true" className={running ? 'action-feedback-spinner' : undefined} />
        <span>
          {running
            ? t('syncRunning')
            : failed
              ? t(status?.login_required ? 'syncLoginRequired' : 'syncFailed')
              : warnings
                ? t('syncPartial')
                : t('syncDone')}
        </span>
      </span>
      {running ? (
        <span className="campus-sync-hint">{t('syncContinue')}</span>
      ) : (
        <a href={failed ? '/setup' : '/campus'} className="subtle-link">
          {failed ? t(status?.login_required ? 'syncSignInAgain' : 'syncCheckConnection') : t('importOpenResults')}
        </a>
      )}
    </aside>
  )
}

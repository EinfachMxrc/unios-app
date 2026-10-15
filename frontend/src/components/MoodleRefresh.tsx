// SPDX-License-Identifier: AGPL-3.0-or-later
import { Link } from 'react-router-dom'
import { RefreshCw } from 'lucide-react'
import { useMoodleRefresh } from '@/hooks/useMoodleRefresh'
import { useWritableHost } from '@/hooks/host'
import { useT } from '@/i18n/useT'
import { Button } from '@/components/ui/button'
import { SyncWarningDetails } from '@/components/SyncWarningDetails'

/** The same refresh action is available where students work and manage connections. */
export function MoodleRefresh() {
  const { t } = useT('system')
  const canWrite = useWritableHost()
  const { busy, result, refresh } = useMoodleRefresh()
  return (
    <div className="moodle-refresh my-3">
      <Button variant="outline" disabled={busy || !canWrite} onClick={() => void refresh()}>
        <RefreshCw size={14} className={busy ? 'animate-spin' : ''} />
        {busy ? t('moodleRefreshing') : t('refreshMoodle')}
      </Button>
      {result === 'success' && (
        <p className="muted-text mt-2" role="status">
          {t('dataUpToDate')}
        </p>
      )}
      {result === 'warning' && (
        <>
          <p className="muted-text mt-2" role="status">
            {t('refreshWithWarnings')}
          </p>
          <SyncWarningDetails />
        </>
      )}
      {result === 'error' && (
        <p className="mt-2" role="alert">
          {t('refreshFailed')}{' '}
          <Link className="subtle-link" to="/setup">
            {t('checkMoodleLogin')}
          </Link>
        </p>
      )}
    </div>
  )
}

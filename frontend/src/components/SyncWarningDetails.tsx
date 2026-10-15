// SPDX-License-Identifier: AGPL-3.0-or-later

import { Link } from 'react-router-dom'
import { useApi } from '@/api'
import { useT } from '@/i18n/useT'
import type { SystemResponse } from '@/types'

export function SyncWarningDetails() {
  const { t } = useT('system')
  const { data } = useApi<SystemResponse>('/api/system')
  const moodle = data?.health.find((item) => item.connector === 'moodle' && item.status === 'warning')
  const message = moodle?.message?.includes('Moodle-Änderungsabfrage')
    ? t('moodleChangeCheckWarning')
    : t('syncWarningGeneric')
  return (
    <details className="mt-2">
      <summary>{t('viewRefreshHints')}</summary>
      <p className="muted-text mt-2">{message}</p>
      <Link className="subtle-link" to="/system">
        {t('viewConnections')}
      </Link>
    </details>
  )
}

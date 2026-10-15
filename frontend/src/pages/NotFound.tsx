// SPDX-License-Identifier: AGPL-3.0-or-later

import { useNavigate } from 'react-router-dom'
import { useT } from '@/i18n/useT'
import { Button } from '@/components/ui/button'
import { Shell } from '@/components/Shell'
import { Empty, Panel } from '@/components/State'

export function NotFound() {
  const { t } = useT('notFound')
  const navigate = useNavigate()
  return (
    <Shell title={t('pageTitle')}>
      <Panel title={t('panelTitle')}>
        <Empty title={t('emptyTitle')} text={t('emptyText')} />
        <Button onClick={() => navigate('/')}>{t('homeButton')}</Button>
      </Panel>
    </Shell>
  )
}

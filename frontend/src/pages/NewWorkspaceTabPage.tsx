// SPDX-License-Identifier: AGPL-3.0-or-later
import { Link } from 'react-router-dom'
import { Search } from 'lucide-react'
import { useT } from '@/i18n/useT'
import { useRecentObjects } from '@/lib/recentObjects'
import { usePreferences } from '@/preferences'
import { areaForPath } from '@/components/sidebarCatalog'
import { Shell } from '@/components/Shell'
import { Button } from '@/components/ui/button'

export function NewWorkspaceTabPage() {
  const { t } = useT('shell')
  const preferences = usePreferences()
  const recent = useRecentObjects().filter((item) => {
    const area = areaForPath(item.to.split('?')[0])
    return area && (!area.module || preferences.modules[area.module])
  })
  return (
    <Shell title={t('newTab')}>
      <div className="workspace-tab-start">
        <p>{t('newTabHint')}</p>
        <Button variant="outline" onClick={() => window.dispatchEvent(new Event('unios:open-search'))}>
          <Search size={16} />
          {t('tabFindContent')}
        </Button>
        {!!recent.length && (
          <ul>
            {recent.map((item) => (
              <li key={item.to}>
                <Link to={item.to}>{item.title}</Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </Shell>
  )
}

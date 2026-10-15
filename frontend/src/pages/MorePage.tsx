// SPDX-License-Identifier: AGPL-3.0-or-later

import { Link } from 'react-router-dom'
import { useT } from '@/i18n/useT'
import { ExternalLink, Puzzle } from 'lucide-react'
import { sidebarCatalog } from '@/components/sidebarCatalog'
import { useSidebarLayout } from '@/components/sidebarLayout'
import { Shell } from '@/components/Shell'
import { SidebarCustomize } from '@/components/SidebarCustomize'
import type { CoursesResponse } from '@/types'
import { usePreferences } from '@/preferences'
import { useApi } from '@/api'
import { AddonWidgetSlot } from '@/addons/AddonWidgetSlot'
import { safeAddonHref } from '@/addons/types'
export function MorePage() {
  const preferences = usePreferences()
  const layout = useSidebarLayout(preferences)
  const pinned = new Set([...layout.workspace, ...layout.library])
  const { t } = useT('more')
  const { t: tNav } = useT('nav')
  const { t: tShell } = useT('shell')
  const { data: courseData } = useApi<CoursesResponse>('/api/courses')
  const { data: addonNavigation } = useApi<{ id: string; name: string; url: string }[]>('/api/addons/navigation')
  const catalog = sidebarCatalog(preferences, tNav, tShell, t)
  const groups = [
    { id: 'quick', title: t('groupQuickAccess') },
    { id: 'knowledge', title: t('groupKnowledge') },
    { id: 'learning', title: t('groupLearning') },
    { id: 'organization', title: t('groupOrganization') },
    { id: 'automation', title: t('groupAutomation') },
    { id: 'tools', title: t('toolsTitle') },
    { id: 'settings', title: t('groupSettings') },
  ].map((group) => ({
    ...group,
    items: catalog.filter((area) =>
      ((area.group === group.id && !area.parent) || (group.id === 'quick' && area.group === 'primary' && !pinned.has(area.id)))
      && area.id !== 'more',
    ),
  }))
  const renderGroups = (sections: typeof groups) => (
    <div className="more-groups">
      {sections
        .filter((group) => group.items.length)
        .map((group) => (
          <section className="more-group" key={group.title}>
            <h2>{group.title}</h2>
            <div>
              {group.items.map(({ to, label, icon: Icon }) => (
                <Link className="more-row" to={to} key={to}>
                  <Icon size={18} strokeWidth={1.8} />
                  <span>{label}</span>
                </Link>
              ))}
            </div>
          </section>
        ))}
    </div>
  )
  return (
    <Shell title={t('title')}>
      <p className="more-intro">{t('intro')}</p>
      <SidebarCustomize courses={courseData?.courses} className="mb-4" />
      {renderGroups(groups.slice(0, 4))}
      {preferences.modules.addons && !!addonNavigation?.length && (
        <section className="more-group">
          <h2>{t('activeAddons')}</h2>
          <div>
            {addonNavigation.map((addon) => {
              const href = safeAddonHref(addon.url)
              return href ? (
                <Link className="more-row" to={href} key={addon.id}>
                  <Puzzle size={18} strokeWidth={1.8} />
                  <span>{addon.name}</span>
                </Link>
              ) : null
            })}
          </div>
        </section>
      )}
      <details className="more-tools" open={preferences.advanced || undefined}>
        <summary>{t('toolsTitle')}</summary>
        <p>{t('toolsHint')}</p>
        {renderGroups(groups.slice(4, 6))}
      </details>
      {renderGroups(groups.slice(6))}
      {preferences.modules.addons && <AddonWidgetSlot slot="more.section" />}
      <a className="more-source" href="https://github.com/EinfachMxrc/unios-app" target="_blank" rel="noreferrer">
        <ExternalLink size={15} /> {t('sourceCode')}
      </a>
    </Shell>
  )
}

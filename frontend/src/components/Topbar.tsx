// SPDX-License-Identifier: AGPL-3.0-or-later

import { Link, useLocation, useNavigate } from 'react-router-dom'
import type { ReactNode } from 'react'
import { ArrowLeft, ArrowRight, ChevronRight, MoreHorizontal, PanelLeftOpen } from 'lucide-react'
import { useT } from '@/i18n/useT'
import { areaForPath, sidebarCatalog } from '@/components/sidebarCatalog'
import { usePreferences } from '@/preferences'
import { BrandMark } from '@/components/BrandMark'
import { Button } from '@/components/ui/button'
import { CommandPalette } from '@/components/CommandPalette'
import { NotificationPopover } from '@/components/NotificationPopover'
import { NewMenu } from '@/components/NewMenu'
export type Breadcrumb = { label: string; to?: string }
export function Topbar({
  title,
  breadcrumbs,
  sidebarHidden,
  toggleSidebar,
  workspaceAction,
}: {
  title: string
  breadcrumbs?: Breadcrumb[]
  sidebarHidden: boolean
  toggleSidebar: () => void
  workspaceAction?: ReactNode
}) {
  const { t } = useT('shell')
  const { t: nav } = useT('nav')
  const { t: more } = useT('more')
  const preferences = usePreferences()
  const location = useLocation()
  const navigate = useNavigate()
  // React Router numbers entries in this tab; the first one has nowhere to go back to.
  const canGoBack = typeof window !== 'undefined' && (window.history.state?.idx ?? 0) > 0
  const owner = areaForPath(location.pathname)
  const parent = sidebarCatalog(preferences, nav, t, more).find((area) => area.id === owner?.parent)
  const trail = breadcrumbs ?? [...(parent ? [{ label: parent.label, to: parent.to }] : []), { label: title }]
  return (
    <header className="app-topbar">
      <nav className="topbar-location" aria-label={t('breadcrumbs')}>
        {sidebarHidden && (
          <button
            type="button"
            className="topbar-sidebar-toggle"
            onClick={toggleSidebar}
            aria-label={t('showSidebar')}
            title={t('showSidebarTitle')}
          >
            <PanelLeftOpen size={18} />
          </button>
        )}
        <button
          type="button"
          className="topbar-history"
          aria-label={t('historyBack')}
          title={t('historyBack')}
          disabled={!canGoBack}
          onClick={() => navigate(-1)}
        >
          <ArrowLeft size={16} />
        </button>
        <button
          type="button"
          className="topbar-history"
          aria-label={t('historyForward')}
          title={t('historyForward')}
          onClick={() => navigate(1)}
        >
          <ArrowRight size={16} />
        </button>
        <ol>
          {trail.map((crumb, index) => (
            <li key={`${index}:${crumb.label}`}>
              {index > 0 && <ChevronRight size={14} aria-hidden="true" />}
              {crumb.to && index < trail.length - 1 ? (
                <Link to={crumb.to}>{crumb.label}</Link>
              ) : (
                <strong aria-current="page">{crumb.label}</strong>
              )}
            </li>
          ))}
        </ol>
      </nav>
      <div className="mobile-brand">
        <BrandMark />
        <strong>{t('brandName')}</strong>
      </div>
      <div className="topbar-search">
        <CommandPalette />
      </div>
      <div className="topbar-actions">
        {workspaceAction && <div className="topbar-workspace-action">{workspaceAction}</div>}
        {preferences.modules.notifications && <NotificationPopover />}
        <Button asChild variant="ghost" size="icon" className="more-top-link" title={t('more')}>
          <Link to="/more" aria-label={t('more')}>
            <MoreHorizontal size={17} />
          </Link>
        </Button>
        <NewMenu />
      </div>
    </header>
  )
}

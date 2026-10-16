// SPDX-License-Identifier: AGPL-3.0-or-later

import { useWorkspaceState } from '@/lib/workspaceState'
import { useContext, useEffect } from 'react'
import type { CSSProperties, ReactNode } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { useT } from '@/i18n/useT'
import { ShieldCheck } from 'lucide-react'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Sidebar } from '@/components/Sidebar'
import { Topbar, type Breadcrumb } from '@/components/Topbar'
import { useSidebarState } from '@/hooks/useSidebarState'
import { useStudyKeyboard } from '@/hooks/keyboard'
import { activeArea, sidebarCatalog } from '@/components/sidebarCatalog'
import { useSidebarLayout } from '@/components/sidebarLayout'
import { HostContext } from '@/hooks/host'
import { useHostOnline } from '@/hostAvailability'
import { localDate, useApi } from '@/api'
import { usePreferences } from '@/preferences'
import type { CoursesResponse } from '@/types'
import { recordPage } from '@/lib/usageMetrics'
import { nameWorkspaceTab } from '@/lib/workspaceTabs'
import { WorkspaceTabs } from './WorkspaceTabs'
export function Shell({
  children,
  title,
  cachedAt = 0,
  breadcrumbs,
  compactNavigation = false,
}: {
  children: ReactNode
  title: string
  eyebrow?: string
  cachedAt?: number
  breadcrumbs?: Breadcrumb[]
  compactNavigation?: boolean
}) {
  useStudyKeyboard()
  const sidebar = useSidebarState()
  const { sidebarHidden, sidebarWidth } = sidebar
  const [readerNavigationExpanded, setReaderNavigationExpanded] = useWorkspaceState(
    'reader:navigation-expanded',
    false,
    { persist: false },
  )
  const sidebarCompact = compactNavigation && !sidebarHidden && !readerNavigationExpanded
  const toggleNavigation = () => {
    if (compactNavigation && !sidebarHidden) setReaderNavigationExpanded((value) => !value)
    else sidebar.toggleSidebar()
  }
  const location = useLocation()
  const { t: quality } = useT('quality')
  const [focusMode, setFocusMode] = useWorkspaceState(`focus:${location.pathname}`, false)
  const focusAvailable = ['/material/', '/learning/focus/', '/coding', '/assessment', '/exercises'].some((path) =>
    location.pathname.startsWith(path),
  )
  useEffect(() => {
    recordPage(location.pathname)
  }, [location.pathname])
  useEffect(() => {
    nameWorkspaceTab(title, `${location.pathname}${location.search}${location.hash}`)
  }, [title, location.pathname, location.search, location.hash])
  const preferences = usePreferences()
  const { t } = useT('shell')
  const { t: tNav } = useT('nav')
  const { t: tMore } = useT('more')
  const layout = useSidebarLayout(preferences)
  const catalog = sidebarCatalog(preferences, tNav, t, tMore)
  const entriesFor = (group: 'workspace' | 'library') =>
    layout[group].flatMap((id) => catalog.find((entry) => entry.id === id) ?? [])
  const mobileItems = entriesFor('workspace').slice(0, 5)
  const activeId = activeArea(location.pathname, [...layout.workspace, ...layout.library])
  const mobileActiveId = activeArea(
    location.pathname,
    mobileItems.map((item) => item.id),
  )
  const { data: courseData } = useApi<CoursesResponse>('/api/courses')
  const courseRank = (id: number) => {
    const index = layout.courseOrder.indexOf(id)
    return index < 0 ? Number.MAX_SAFE_INTEGER : index
  }
  const sidebarCourses = (courseData?.courses ?? [])
    .filter((course) => !layout.hiddenCourses.includes(course.id))
    .sort((a, b) => courseRank(a.id) - courseRank(b.id))
  const host = useContext(HostContext)
  const online = useHostOnline()
  const focusControl = focusAvailable && (
    <Button variant="outline" size="sm" aria-pressed={focusMode} onClick={() => setFocusMode((value) => !value)}>
      {focusMode ? quality('exitFocus') : quality('focus')}
    </Button>
  )
  return (
    <div
      data-density={preferences.density}
      className={`app-shell ${compactNavigation ? 'reader-workspace-shell' : ''} ${sidebarCompact ? 'sidebar-compact' : ''} ${focusAvailable && focusMode ? 'focus-layout' : ''} ${sidebarHidden ? 'sidebar-hidden' : ''} ${location.pathname === '/' ? 'today-shell' : location.pathname.startsWith('/material/') ? 'material-shell' : location.pathname.startsWith('/courses/') ? 'course-shell' : location.pathname === '/notes' ? 'notes-shell' : ''}`}
      style={{ '--sidebar-width': `${sidebarWidth}px` } as CSSProperties}
    >
      <a className="skip-link" href="#main-content">
        {t('skipContent')}
      </a>
      <Sidebar
        state={{ ...sidebar, toggleSidebar: toggleNavigation }}
        compact={sidebarCompact}
        layout={layout}
        catalog={catalog}
        courses={courseData?.courses}
        sidebarCourses={sidebarCourses}
        activeId={activeId}
      />
      <div className="app-main">
        <Topbar
          title={title}
          breadcrumbs={breadcrumbs}
          sidebarHidden={sidebarHidden}
          toggleSidebar={toggleNavigation}
          workspaceAction={compactNavigation && !focusMode ? focusControl : undefined}
        />
        <WorkspaceTabs />
        <main
          id="main-content"
          data-workspace-key={location.key}
          tabIndex={-1}
          className={`content ${location.pathname.startsWith('/courses/') ? 'course-page' : ''}`}
        >
          <div className={`page-heading ${compactNavigation && !focusMode ? 'reader-workspace-heading' : ''}`}>
            <h1 className={compactNavigation && !focusMode ? 'sr-only' : undefined}>{title}</h1>
            {(!compactNavigation || focusMode) && focusControl}
          </div>
          {!online && (
            <Alert role="status" className="notice mb-5">
              <AlertTitle>
                {t('offlineTitle', {
                  date: cachedAt ? localDate(new Date(cachedAt).toISOString()) : t('offlineNoData'),
                })}
              </AlertTitle>
              <AlertDescription>
                {t('offlineDescription')}
                <details className="offline-capabilities">
                  <summary>{quality('offlineDetails')}</summary>
                  <p>{quality('offlineCapabilities')}</p>
                </details>
              </AlertDescription>
            </Alert>
          )}
          {(host?.mode === 'standby' || host?.mode === 'released') && (
            <Alert className="notice mb-5">
              <ShieldCheck className="size-4" />
              <AlertTitle>{host.mode === 'released' ? t('hostReleasedTitle') : t('hostStandbyTitle')}</AlertTitle>
              <AlertDescription>
                {host.mode === 'released' ? t('hostReleasedDescription') : t('hostStandbyDescription')}{' '}
                {t('hostDescriptionSuffix')}
              </AlertDescription>
            </Alert>
          )}
          {children}
          {location.pathname !== '/settings' && (
            <div className="mt-10 text-right">
              <Link
                className="text-sm text-muted-foreground underline-offset-4 hover:underline"
                to={`/settings?feedback=problem&from=${encodeURIComponent(location.pathname)}#feedback`}
              >
                {t('reportProblemLink')}
              </Link>
            </div>
          )}
        </main>
      </div>
      <nav className="mobile-nav" aria-label={t('mobileNavigation')}>
        {mobileItems.map(({ id, to, label, icon: Icon }) => (
          <Link
            key={id}
            to={to}
            className={mobileActiveId === id ? 'active' : ''}
            aria-current={mobileActiveId === id ? 'page' : undefined}
          >
            <Icon size={19} strokeWidth={1.8} />
            <span>{label}</span>
          </Link>
        ))}
      </nav>
    </div>
  )
}

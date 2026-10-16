// SPDX-License-Identifier: AGPL-3.0-or-later
import { useSidebarScroll } from '@/hooks/useSidebarScroll'
import { courseName } from '@/lib/courseNames'

import './Sidebar.css'

import { Link, NavLink, useLocation } from 'react-router-dom'
import {
  BookOpen,
  ChevronDown,
  Clock3,
  FileText,
  FolderKanban,
  MoreHorizontal,
  PanelLeftClose,
  PanelLeftOpen,
  PenLine,
  Plus,
  Search,
  Settings2,
} from 'lucide-react'
import { useT } from '@/i18n/useT'
import { usePreferences } from '@/preferences'
import { BrandMark } from '@/components/BrandMark'
import { SidebarCustomize } from '@/components/SidebarCustomize'
import { areaForPath, type sidebarCatalog } from '@/components/sidebarCatalog'
import type { SidebarLayout } from '@/components/sidebarLayout'
import type { useSidebarState } from '@/hooks/useSidebarState'
import type { CoursesResponse } from '@/types'
import { recentHandle, useRecentObjects } from '@/lib/recentObjects'
import { useWorkspaceState } from '@/lib/workspaceState'
import { beginNewFreeNote } from '@/lib/sourceNoteSave'
type Props = {
  state: ReturnType<typeof useSidebarState>
  layout: SidebarLayout
  catalog: ReturnType<typeof sidebarCatalog>
  courses?: CoursesResponse['courses']
  sidebarCourses: CoursesResponse['courses']
  activeId?: string
  compact?: boolean
}
export function Sidebar({ state, layout, catalog, courses, sidebarCourses, activeId, compact = false }: Props) {
  const { sidebarWidth, collapsedSections, openCourse, toggleSidebar, toggleSection, toggleCourse, resizeSidebar } =
    state
  const { t } = useT('shell')
  const { t: palette } = useT('commandPalette')
  const preferences = usePreferences()
  const location = useLocation()
  const scroll = useSidebarScroll(courses !== undefined)
  const [, setPaletteOpen] = useWorkspaceState('palette:open', false, { persist: false })
  const recent = useRecentObjects()
    .filter((item) => {
      const area = areaForPath(item.to.split('?')[0])
      if (!area || (area.module && !preferences.modules[area.module])) return false
      if (item.to.startsWith('/courses/')) {
        const id = Number(item.to.split('/')[2])
        if (layout.hiddenCourses.includes(id) || !layout.showCourses) return false
        if (sidebarCourses.some((course) => course.id === id)) return false
      }
      return true
    })
    .slice(0, 5)
  const currentObject = recentHandle(location.pathname, location.search)
  const hasNavigation = [...layout.workspace, ...layout.library].some((id) => catalog.some((entry) => entry.id === id))
  const entriesFor = (group: 'workspace' | 'library') =>
    layout[group].flatMap((id) => catalog.find((entry) => entry.id === id) ?? [])
  return (
    <aside className="app-sidebar">
      <div className="sidebar-workspace">
        <Link to="/" className="app-brand" aria-label={compact ? t('brandName') : undefined}>
          <BrandMark />
          <span>
            {t('brandName')}
            <small>{t('brandTagline')}</small>
          </span>
        </Link>
        <button
          type="button"
          className="sidebar-visibility"
          onClick={toggleSidebar}
          aria-label={t(compact ? 'showSidebar' : 'hideSidebar')}
          title={t(compact ? 'showSidebarTitle' : 'hideSidebarTitle')}
        >
          {compact ? <PanelLeftOpen size={17} /> : <PanelLeftClose size={17} />}
        </button>
      </div>
      <nav {...scroll} aria-label={t('mainNavigation')} className="app-nav" style={{ overflowAnchor: 'none' }}>
        {hasNavigation && (
          <div className="sidebar-tools">
            <button
              type="button"
              className="sidebar-search"
              onClick={() => setPaletteOpen(true)}
              aria-label={palette(preferences.modules.search ? 'triggerText' : 'navigationText')}
            >
              <Search size={16} aria-hidden="true" />
              <span>{preferences.modules.search ? t('search') : palette('navigationText')}</span>
              <kbd aria-hidden="true">
                {palette(/Mac|iPhone|iPad/i.test(navigator.platform) ? 'shortcutHintMac' : 'shortcutHintOther')}
              </kbd>
            </button>
            <Link to="/notes?new=1" className="sidebar-new-note" onClick={() => beginNewFreeNote()}>
              <Plus size={16} aria-hidden="true" /> {t('newNote')}
            </Link>
          </div>
        )}
        {(['workspace', 'library'] as const)
          .filter((group) => entriesFor(group).length)
          .map((group) => (
            <div className="sidebar-group" key={group}>
              <button
                type="button"
                className="sidebar-label sidebar-toggle"
                aria-expanded={!collapsedSections[group]}
                onClick={() => toggleSection(group)}
              >
                {t(group)} <ChevronDown size={14} />
              </button>
              {(compact || !collapsedSections[group]) &&
                entriesFor(group).map(({ id, to, label, icon: Icon }) => (
                  <Link
                    key={id}
                    to={to}
                    aria-label={label}
                    title={compact ? label : undefined}
                    className={`nav-item ${activeId === id && !(id === 'courses' && layout.showCourses && sidebarCourses.some((course) => location.pathname === `/courses/${course.id}`)) ? 'active' : ''}`}
                    aria-current={
                      activeId === id &&
                      !(
                        id === 'courses' &&
                        layout.showCourses &&
                        sidebarCourses.some((course) => location.pathname === `/courses/${course.id}`)
                      )
                        ? 'page'
                        : undefined
                    }
                  >
                    <Icon size={16} strokeWidth={1.8} aria-hidden="true" />
                    <span>{label}</span>
                    <span className="sidebar-action-slot" aria-hidden="true" />
                  </Link>
                ))}
            </div>
          ))}
        {preferences.modules.courses && layout.showCourses && (sidebarCourses.length > 0 || courses?.length === 0) ? (
          <div className="sidebar-group sidebar-courses">
            <button
              type="button"
              className="sidebar-label sidebar-toggle"
              aria-expanded={!collapsedSections.courses}
              onClick={() => toggleSection('courses')}
            >
              {t('currentCourses')} <span>{sidebarCourses.length}</span>
              <ChevronDown size={14} />
            </button>
            {!collapsedSections.courses && courses?.length === 0 && (
              <div className="sidebar-empty">
                <p>{t('coursesEmpty')}</p>
                <Link to="/courses">{t('openCourses')}</Link>
              </div>
            )}
            {!collapsedSections.courses &&
              sidebarCourses.map((course) => (
                <div key={course.id} className="sidebar-course-group">
                  <div className="sidebar-course-row">
                    <NavLink
                      to={`/courses/${course.id}`}
                      aria-label={t('courseAriaLabel', { name: courseName(course) })}
                      className={({ isActive }) => `nav-item sidebar-course ${isActive ? 'active' : ''}`}
                    >
                      <BookOpen size={16} strokeWidth={1.8} />
                      <span title={course.name}>{courseName(course)}</span>
                    </NavLink>
                    <button
                      type="button"
                      className="sidebar-course-toggle"
                      aria-expanded={openCourse === course.id}
                      aria-label={
                        openCourse === course.id
                          ? t('courseChildrenClose', { name: courseName(course) })
                          : t('courseChildrenOpen', { name: courseName(course) })
                      }
                      onClick={() => toggleCourse(course.id)}
                    >
                      <ChevronDown size={15} />
                    </button>
                  </div>
                  {openCourse === course.id && (
                    <div className="sidebar-course-children">
                      <NavLink to={`/courses/${course.id}`} end className="sidebar-child">
                        {t('materials')}
                      </NavLink>
                      <NavLink
                        to={`/notes?course_id=${course.id}`}
                        className={({ isActive }) =>
                          isActive && new URLSearchParams(location.search).get('course_id') === String(course.id)
                            ? 'sidebar-child active'
                            : 'sidebar-child'
                        }
                      >
                        {t('notes')}
                      </NavLink>
                    </div>
                  )}
                </div>
              ))}
          </div>
        ) : null}
        {hasNavigation && layout.showRecent !== false && (
          <div className="sidebar-group sidebar-recents" aria-label={t('recentObjects')}>
            <p className="sidebar-label sidebar-recent-heading">
              <Clock3 size={13} aria-hidden="true" /> {t('recentObjects')}
            </p>
            {recent.length === 0 && <p className="sidebar-empty">{t('recentEmpty')}</p>}
            {recent.map((item) => {
              const isPdf = item.to.startsWith('/material/')
              const Icon = isPdf
                ? FileText
                : item.to.startsWith('/notes?')
                  ? PenLine
                  : item.to.startsWith('/courses/')
                    ? BookOpen
                    : FolderKanban
              const page = isPdf ? new URL(item.to, 'https://unios.invalid').searchParams.get('page') : null
              const detail = isPdf
                ? [t('recentPdf'), page ? t('recentPage', { page }) : null].filter(Boolean).join(' · ')
                : item.to.startsWith('/notes?')
                  ? t('recentNote')
                  : item.to.startsWith('/courses/')
                    ? t('currentCourses')
                    : t('recentProject')
              return (
                <Link
                  key={item.to}
                  to={item.to}
                  title={`${item.title} · ${detail}`}
                  aria-current={currentObject === item.to ? 'page' : undefined}
                  className={`sidebar-recent ${currentObject === item.to ? 'active' : ''}`}
                >
                  <Icon size={16} strokeWidth={1.8} aria-hidden="true" />
                  <span>
                    <strong>{item.title}</strong>
                    <small>{detail}</small>
                  </span>
                </Link>
              )
            })}
          </div>
        )}
      </nav>
      <div className="sidebar-bottom">
        <SidebarCustomize courses={courses} />
        <NavLink
          to="/more"
          aria-label={t('more')}
          title={compact ? t('more') : undefined}
          className={activeId === 'more' ? 'active' : ''}
        >
          <MoreHorizontal size={16} /> <span>{t('more')}</span>
        </NavLink>
        <NavLink
          to="/settings"
          aria-label={t('settings')}
          title={compact ? t('settings') : undefined}
          className={({ isActive }) => (isActive ? 'active' : '')}
        >
          <Settings2 size={16} /> <span>{t('settings')}</span>
        </NavLink>
      </div>
      <div
        className="sidebar-resize-handle"
        role="separator"
        aria-label={t('sidebarWidth')}
        aria-orientation="vertical"
        aria-valuemin={220}
        aria-valuemax={360}
        aria-valuenow={sidebarWidth}
        tabIndex={0}
        onPointerDown={(event) => event.currentTarget.setPointerCapture(event.pointerId)}
        onPointerMove={(event) => {
          if (event.currentTarget.hasPointerCapture(event.pointerId)) resizeSidebar(event.clientX)
        }}
        onKeyDown={(event) => {
          if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
            event.preventDefault()
            resizeSidebar(sidebarWidth + (event.key === 'ArrowRight' ? 16 : -16))
          }
        }}
      />
    </aside>
  )
}

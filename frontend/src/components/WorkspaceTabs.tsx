// SPDX-License-Identifier: AGPL-3.0-or-later
import { useEffect, useRef } from 'react'
import { Plus, RotateCcw, X } from 'lucide-react'
import { useT } from '@/i18n/useT'
import { useLocation } from 'react-router-dom'
import { useMediaQuery } from '@/hooks/useMediaQuery'
import { useWorkspaceTabNavigation } from '@/hooks/useWorkspaceTabNavigation'
import {
  MAX_WORKSPACE_TABS,
  moveWorkspaceTab,
  tabIdentity,
  useWorkspaceTabs,
  type WorkspaceTab,
} from '@/lib/workspaceTabs'
import { useRecentObjects } from '@/lib/recentObjects'
import { areaForPath, sidebarCatalog } from './sidebarCatalog'
import { usePreferences } from '@/preferences'
import './WorkspaceTabs.css'

export function WorkspaceTabs() {
  const { t } = useT('shell')
  const { t: nav } = useT('nav')
  const { t: more } = useT('more')
  const preferences = usePreferences()
  const location = useLocation()
  const tabs = useWorkspaceTabs()
  const navigation = useWorkspaceTabNavigation()
  const recent = useRecentObjects()
  const mobile = useMediaQuery('(max-width: 700px)')
  const rail = useRef<HTMLDivElement>(null)
  const dragging = useRef<string | null>(null)
  const catalog = sidebarCatalog(preferences, nav, t, more)
  const label = (tab: WorkspaceTab) =>
    recent.find((item) => tabIdentity(item.to) === tabIdentity(tab.to))?.title ??
    tab.title ??
    (tab.to.startsWith('/workspace/new')
      ? t('newTab')
      : tab.to.startsWith('/notes')
        ? t('tabNote')
        : /^\/(material|document)\//.test(tab.to)
          ? t('tabDocument')
          : (catalog.find((item) => item.id === areaForPath(tab.to.split('?')[0])?.id)?.label ?? t('tabDocument')))
  useEffect(() => {
    const selected = rail.current?.querySelector<HTMLElement>('[aria-current="page"]')
    if (selected && rail.current) {
      const parent = rail.current.getBoundingClientRect(),
        child = selected.getBoundingClientRect()
      if (child.left < parent.left) rail.current.scrollLeft -= parent.left - child.left
      else if (child.right > parent.right) rail.current.scrollLeft += child.right - parent.right
    }
  }, [tabs.active, tabs.items.length])
  if (!tabs.items.length || ['/welcome', '/import', '/setup'].includes(location.pathname)) return null
  return (
    <div className="workspace-tabs-bar">
      {mobile ? (
        <select
          aria-label={t('switchWorkspaceTab', { count: tabs.items.length })}
          value={tabs.active}
          onChange={(event) => navigation.select(event.target.value)}
        >
          {tabs.items.map((tab) => (
            <option key={tab.id} value={tab.id}>
              {label(tab)}
            </option>
          ))}
        </select>
      ) : (
        <nav className="workspace-tabs-rail" ref={rail} aria-label={t('workspaceTabs')}>
          {tabs.items.map((tab, index) => (
            <div
              key={tab.id}
              className={`workspace-tab ${tab.id === tabs.active ? 'is-active' : ''}`}
              draggable
              onDragStart={(event) => {
                dragging.current = tab.id
                event.dataTransfer.effectAllowed = 'move'
              }}
              onDragOver={(event) => {
                if (dragging.current) event.preventDefault()
              }}
              onDrop={(event) => {
                event.preventDefault()
                if (dragging.current) moveWorkspaceTab(dragging.current, index)
                dragging.current = null
              }}
              onDragEnd={() => {
                dragging.current = null
              }}
            >
              <button
                type="button"
                data-workspace-tab
                aria-current={tab.id === tabs.active ? 'page' : undefined}
                aria-controls="main-content"
                tabIndex={tab.id === tabs.active ? 0 : -1}
                title={label(tab)}
                onClick={() => navigation.select(tab.id)}
                onKeyDown={(event) => {
                  if (event.altKey && event.shiftKey && ['ArrowLeft', 'ArrowRight'].includes(event.key)) {
                    event.preventDefault()
                    moveWorkspaceTab(tab.id, index + (event.key === 'ArrowLeft' ? -1 : 1))
                    return
                  }
                  if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return
                  event.preventDefault()
                  const target =
                    event.key === 'Home'
                      ? 0
                      : event.key === 'End'
                        ? tabs.items.length - 1
                        : (index + (event.key === 'ArrowLeft' ? -1 : 1) + tabs.items.length) % tabs.items.length
                  navigation.select(tabs.items[target].id, true)
                }}
              >
                <span>{label(tab)}</span>
              </button>
              <button
                type="button"
                className="workspace-tab-close"
                aria-label={t('closeWorkspaceTab', { title: label(tab) })}
                onClick={() => navigation.close(tab.id)}
              >
                <X size={13} />
              </button>
            </div>
          ))}
        </nav>
      )}
      {mobile && (
        <button type="button" aria-label={t('closeCurrentTab')} onClick={() => navigation.close(tabs.active)}>
          <X size={16} />
        </button>
      )}
      <button
        type="button"
        aria-label={t('newTab')}
        disabled={tabs.items.length >= MAX_WORKSPACE_TABS}
        title={t(tabs.items.length >= MAX_WORKSPACE_TABS ? 'tabLimit' : 'newTab')}
        onClick={() => navigation.open('/workspace/new')}
      >
        <Plus size={17} />
      </button>
      <button
        type="button"
        aria-label={t('reopenWorkspaceTab')}
        disabled={!tabs.closed.length}
        title={t('reopenWorkspaceTab')}
        onClick={navigation.reopen}
      >
        <RotateCcw size={15} />
      </button>
    </div>
  )
}

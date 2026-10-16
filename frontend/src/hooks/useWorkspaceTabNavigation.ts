// SPDX-License-Identifier: AGPL-3.0-or-later
import { useNavigate } from 'react-router-dom'
import {
  closeWorkspaceTab,
  openWorkspaceTab,
  reopenWorkspaceTab,
  selectWorkspaceTab,
  workspaceTabsSnapshot,
  type WorkspaceTab,
} from '@/lib/workspaceTabs'

export function useWorkspaceTabNavigation() {
  const navigate = useNavigate()
  function visit(tab: WorkspaceTab | null | undefined, focusTab = false) {
    if (!tab) return
    // Flush scroll/focus before the router removes the current document.
    window.dispatchEvent(new Event('unios:before-tab-switch'))
    const state = tab.routeState && typeof tab.routeState === 'object' ? tab.routeState : {}
    navigate(tab.to, { state: { ...state, workspaceTabRestoreKey: tab.locationKey, workspaceTabFocus: focusTab } })
  }
  return {
    open: (to: string) => visit(openWorkspaceTab(to)),
    select: (id: string, focusTab = false) => visit(selectWorkspaceTab(id), focusTab),
    close: (id: string) => {
      const active = workspaceTabsSnapshot().active === id
      const next = closeWorkspaceTab(id)
      if (active) visit(next)
    },
    reopen: () => visit(reopenWorkspaceTab()),
  }
}

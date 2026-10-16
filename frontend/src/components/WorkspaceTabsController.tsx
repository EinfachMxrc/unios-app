// SPDX-License-Identifier: AGPL-3.0-or-later
import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { createPortal } from 'react-dom'
import { useT } from '@/i18n/useT'
import { isDesktopApp } from '@/lib/desktop'
import { inAppTarget, withCitedQuote } from '@/lib/inAppLinks'
import { observeWorkspaceTab, tabTarget, workspaceTabsSnapshot } from '@/lib/workspaceTabs'
import { useWorkspaceTabNavigation } from '@/hooks/useWorkspaceTabNavigation'

export function WorkspaceTabsController() {
  const location = useLocation()
  const navigate = useNavigate()
  const navigation = useWorkspaceTabNavigation()
  const { t } = useT('shell')
  const [menu, setMenu] = useState<{ to: string; x: number; y: number; anchor: HTMLElement } | null>(null)
  const menuRef = useRef<HTMLButtonElement>(null)
  useLayoutEffect(() => {
    observeWorkspaceTab(`${location.pathname}${location.search}${location.hash}`, location.key, location.state)
  }, [location])
  useEffect(() => {
    const clear = () => {
      setMenu(null)
      navigate('/', { replace: true })
    }
    window.addEventListener('unios:workspace-cleared', clear)
    return () => window.removeEventListener('unios:workspace-cleared', clear)
  }, [navigate])
  useEffect(() => {
    function target(event: MouseEvent) {
      if (!(event.target instanceof Element)) return null
      const link = event.target.closest('a[href]')
      if (!(link instanceof HTMLAnchorElement)) return null
      const to = inAppTarget(
        link,
        { button: 0, ctrlKey: false, metaKey: false, shiftKey: false, altKey: false },
        { desktop: true, origin: window.location.origin },
      )
      return to && tabTarget(to) ? { link, to: withCitedQuote(to, link) } : null
    }
    const context = (event: MouseEvent) => {
      const result = target(event)
      if (!result) return
      event.preventDefault()
      setMenu({
        to: result.to,
        x: Math.max(8, Math.min(event.clientX, innerWidth - 265)),
        y: Math.min(event.clientY, innerHeight - 65),
        anchor: result.link,
      })
    }
    const modified = (event: MouseEvent) => {
      if (
        !isDesktopApp() ||
        event.defaultPrevented ||
        event.altKey ||
        event.shiftKey ||
        !(event.button === 1 || (event.button === 0 && (event.metaKey || event.ctrlKey)))
      )
        return
      const result = target(event)
      if (!result) return
      event.preventDefault()
      event.stopImmediatePropagation()
      navigation.open(result.to)
    }
    const shortcut = (event: KeyboardEvent) => {
      if (event.defaultPrevented || !isDesktopApp() || event.altKey) return
      const tabs = workspaceTabsSnapshot()
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 't') {
        event.preventDefault()
        if (event.shiftKey) navigation.reopen()
        else navigation.open('/workspace/new')
      } else if ((event.metaKey || event.ctrlKey) && !event.shiftKey && event.key.toLowerCase() === 'w') {
        event.preventDefault()
        navigation.close(tabs.active)
      } else if (event.ctrlKey && event.key === 'Tab' && tabs.items.length > 1) {
        event.preventDefault()
        const index = tabs.items.findIndex((tab) => tab.id === tabs.active)
        navigation.select(tabs.items[(index + (event.shiftKey ? -1 : 1) + tabs.items.length) % tabs.items.length].id)
      }
    }
    document.addEventListener('contextmenu', context)
    document.addEventListener('click', modified, true)
    document.addEventListener('auxclick', modified, true)
    window.addEventListener('keydown', shortcut)
    return () => {
      document.removeEventListener('contextmenu', context)
      document.removeEventListener('click', modified, true)
      document.removeEventListener('auxclick', modified, true)
      window.removeEventListener('keydown', shortcut)
    }
  }, [navigation])
  useEffect(() => {
    if (!menu) return
    menuRef.current?.focus()
    const dismiss = (event: Event) => {
      if (event.type === 'keydown' && (!(event instanceof KeyboardEvent) || event.key !== 'Escape')) return
      setMenu(null)
      if (event.type === 'keydown') menu.anchor.focus()
    }
    document.addEventListener('pointerdown', dismiss)
    document.addEventListener('keydown', dismiss)
    window.addEventListener('scroll', dismiss, true)
    return () => {
      document.removeEventListener('pointerdown', dismiss)
      document.removeEventListener('keydown', dismiss)
      window.removeEventListener('scroll', dismiss, true)
    }
  }, [menu])
  return menu
    ? createPortal(
        <div
          className="workspace-link-menu"
          role="menu"
          aria-label={t('tabLinkActions')}
          style={{ left: menu.x, top: menu.y }}
          onPointerDown={(event) => event.stopPropagation()}
        >
          <button
            ref={menuRef}
            type="button"
            role="menuitem"
            onClick={() => {
              navigation.open(menu.to)
              setMenu(null)
            }}
          >
            {t('openInWorkspaceTab')}
          </button>
        </div>,
        document.body,
      )
    : null
}

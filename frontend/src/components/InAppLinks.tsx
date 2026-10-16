// SPDX-License-Identifier: AGPL-3.0-or-later

import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { isDesktopApp } from '@/lib/desktop'
import { inAppTarget, withCitedQuote } from '@/lib/inAppLinks'

/**
 * Keeps every link to an app screen inside the app. Without this, a link
 * written as plain HTML (notes, Markdown, target="_blank") reloads the page
 * or, in the desktop app, opens the system browser. Router links handle
 * themselves first and are left alone.
 */
export function InAppLinks() {
  const navigate = useNavigate()
  useEffect(() => {
    const follow = (event: MouseEvent) => {
      if (event.defaultPrevented || !(event.target instanceof Element)) return
      // The tab controller owns desktop modifier clicks, including links inside
      // the editor whose capture listener runs before ordinary router links.
      if (isDesktopApp() && (event.ctrlKey || event.metaKey) && !event.shiftKey && !event.altKey) return
      const link = event.target.closest('a[href]')
      if (!(link instanceof HTMLAnchorElement)) return
      const target = inAppTarget(link, event, { desktop: isDesktopApp(), origin: window.location.origin })
      if (!target) return
      event.preventDefault()
      navigate(withCitedQuote(target, link))
    }
    // ProseMirror can consume the click before document's bubble listener.
    // Plain Markdown links in notes must be caught before the editor does so;
    // custom wiki/peek links keep their own component interaction.
    const followNote = (event: MouseEvent) => {
      if (!(event.target instanceof Element)) return
      const link = event.target.closest('a[target="_blank"]')
      if (!link?.closest('.studio-document, .rendered-note, .reader-note-preview')) return
      follow(event)
    }
    // WKWebView may request a new window through keyboard/accessibility
    // activation. The shell forwards local links here instead of to Safari.
    const nativeLink = (event: Event) => {
      if (!isDesktopApp() || !(event instanceof CustomEvent) || typeof event.detail !== 'string') return
      const link = document.createElement('a')
      link.setAttribute('href', event.detail)
      const target = inAppTarget(
        link,
        { button: 0, ctrlKey: false, metaKey: false, shiftKey: false, altKey: false },
        { desktop: true, origin: window.location.origin },
      )
      if (target) navigate(target)
    }
    document.addEventListener('click', followNote, true)
    document.addEventListener('click', follow)
    window.addEventListener('unios-open-link', nativeLink)
    return () => {
      document.removeEventListener('click', followNote, true)
      document.removeEventListener('click', follow)
      window.removeEventListener('unios-open-link', nativeLink)
    }
  }, [navigate])
  return null
}

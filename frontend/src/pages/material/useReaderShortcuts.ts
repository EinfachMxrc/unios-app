// SPDX-License-Identifier: AGPL-3.0-or-later

import { useEffect, useLayoutEffect, useRef } from 'react'
import { isReaderSplitToggle, readerZoomCommand } from './readerGestures'

type ReaderShortcutActions = {
  zoom: (direction: -1 | 1) => void
  fitWidth: () => void
  toggleNoteBeside: () => void
  jumpToPage: () => void
  focusSearch: () => void
}

/**
 * Reader keyboard: Cmd/Ctrl +/-/0 zoom the PDF instead of the webview, and
 * Cmd/Ctrl+Shift+B toggles the note beside it. G ("go to") opens the page
 * field, so a page is three keys away without the mouse. Cmd/Ctrl+F searches the
 * PDF itself rather than the visible part of the webview. Handlers always see the
 * latest page state without re-registering the window listener.
 */
export function useReaderShortcuts(actions: ReaderShortcutActions) {
  const current = useRef(actions)
  useLayoutEffect(() => { current.current = actions })
  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.defaultPrevented) return
      if (isReaderSplitToggle(event)) {
        // A modifier chord types nothing, so it works while writing in the note too.
        event.preventDefault()
        current.current.toggleNoteBeside()
        return
      }
      const target = event.target instanceof HTMLElement ? event.target : null
      const typing = Boolean(target?.closest('input, textarea, select, [contenteditable="true"]'))
      if (event.key.toLowerCase() === 'g' && !event.ctrlKey && !event.metaKey && !event.altKey && !typing) {
        event.preventDefault()
        current.current.jumpToPage()
        return
      }
      if (event.key.toLowerCase() === 'f' && (event.ctrlKey || event.metaKey) && !event.altKey && !event.shiftKey && !typing) {
        event.preventDefault()
        current.current.focusSearch()
        return
      }
      const command = readerZoomCommand(event)
      if (!command) return
      // Editors keep their own shortcuts; the reader owns zoom everywhere else on the page.
      if (typing) return
      event.preventDefault()
      if (command.kind === 'fit') current.current.fitWidth()
      else current.current.zoom(command.direction)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])
}

// SPDX-License-Identifier: AGPL-3.0-or-later

import { useLayoutEffect, useRef } from 'react'

/** Capture the first Escape before a surrounding PDF dialog's document listener.
 * A portalled child is outside its parent helper's DOM, so only the focused
 * helper consumes the key. Layout registration precedes MathLive's first focus. */
export function useStudyDialogEscape(onClose: () => void) {
  const content = useRef<HTMLDivElement>(null)
  const close = useRef(onClose)
  close.current = onClose
  useLayoutEffect(() => {
    function escape(event: KeyboardEvent) {
      if (event.key !== 'Escape' || event.isComposing || !content.current?.contains(document.activeElement)) return
      event.preventDefault()
      event.stopImmediatePropagation()
      close.current()
    }
    window.addEventListener('keydown', escape, { capture: true })
    return () => window.removeEventListener('keydown', escape, { capture: true })
  }, [])
  return content
}

// SPDX-License-Identifier: AGPL-3.0-or-later

import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { beginNewFreeNote } from '@/lib/sourceNoteSave'

export function useStudyKeyboard() {
  const navigate = useNavigate()
  useEffect(() => {
    const handle = (event: KeyboardEvent) => {
      const element = event.target instanceof Element ? event.target : null
      if (event.defaultPrevented || event.ctrlKey || event.metaKey || event.altKey ||
        element?.closest('input,textarea,select,[contenteditable="true"],[role="textbox"],[role="dialog"]')) return
      if (document.querySelector('[role="dialog"]')) return
      if (event.key.toLowerCase() === 'n') { event.preventDefault(); beginNewFreeNote(); navigate('/notes?new=1') }
      if (event.key === '/') { event.preventDefault(); window.dispatchEvent(new Event('unios:actions')) }
      if (event.key === 'j' || event.key === 'k') {
        const links = [...document.querySelectorAll<HTMLElement>('main [data-keyboard-list] a[href],main [data-keyboard-list] button:not(:disabled)')]
          .filter(item => item.getClientRects().length > 0)
        if (!links.length) return
        const index = links.indexOf(document.activeElement as HTMLElement)
        const next = index < 0 ? (event.key === 'j' ? 0 : links.length - 1) : Math.max(0, Math.min(links.length - 1, index + (event.key === 'j' ? 1 : -1)))
        event.preventDefault(); links[next].focus(); links[next].scrollIntoView({ block: 'nearest' })
      }
    }
    window.addEventListener('keydown', handle)
    return () => window.removeEventListener('keydown', handle)
  }, [navigate])
}

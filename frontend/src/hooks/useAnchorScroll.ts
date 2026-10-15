// SPDX-License-Identifier: AGPL-3.0-or-later

import { useEffect } from 'react'
import { useLocation } from 'react-router-dom'

export function useAnchorScroll(ready: boolean, revision = 0) {
  const { hash } = useLocation()
  useEffect(() => {
    if (!ready || !hash) return
    const target = document.getElementById(hash.slice(1))
    target?.scrollIntoView({ block: 'center' })
    target?.focus({ preventScroll: true })
  }, [ready, hash, revision])
}

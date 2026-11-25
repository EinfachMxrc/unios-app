// SPDX-License-Identifier: AGPL-3.0-or-later

import { useEffect, useState } from 'react'
import { campusClock } from '@/lib/mensa'

/** The current campus day (`YYYY-MM-DD`) and minute of day, refreshed while the page is open. */
export function useCampusDay() {
  const [now, setNow] = useState(() => new Date())
  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 30_000)
    return () => window.clearInterval(timer)
  }, [])
  return { ...campusClock(now, 'Europe/Berlin'), now }
}

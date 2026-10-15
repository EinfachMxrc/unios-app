// SPDX-License-Identifier: AGPL-3.0-or-later
import { useEffect, useState } from 'react'

export function useDebouncedValue(value: string, delay = 200) {
  const [settled, setSettled] = useState(value)
  useEffect(() => {
    const timeout = window.setTimeout(() => setSettled(value), delay)
    return () => window.clearTimeout(timeout)
  }, [value, delay])
  return settled
}

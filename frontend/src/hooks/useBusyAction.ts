// SPDX-License-Identifier: AGPL-3.0-or-later

import { useState } from 'react'
import { extractApiErrorMessage } from '@/hooks/useApiMutation'

/**
 * Several actions of one panel that share a single busy state, so every control
 * stays disabled while any of them runs. A new attempt clears the last error.
 *
 * Prefer `useApiMutation` for a single independent write; use this when the
 * actions of a panel must not overlap.
 */
export function useBusyAction() {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  /**
   * Runs `action`; on failure shows `failure` (an already translated text) or
   * the server's readable message. Resolves to whether the action succeeded.
   */
  async function run(action: () => Promise<void>, failure?: string): Promise<boolean> {
    setBusy(true)
    setError('')
    try {
      await action()
      return true
    } catch (cause) {
      setError(failure ?? extractApiErrorMessage(cause))
      return false
    } finally {
      setBusy(false)
    }
  }

  return { busy, error, setError, run }
}

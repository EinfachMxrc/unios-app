// SPDX-License-Identifier: AGPL-3.0-or-later

import { createContext, useContext } from 'react'
import type { HostStatus } from '@/types'
import { useHostOnline, useHostVerified } from '@/hostAvailability'
import { useRuntimeVerified } from '@/lib/runtimeAccess'

export const HostContext = createContext<HostStatus | null>(null)

export function useWritableHost() {
  const online = useHostOnline()
  const verified = useHostVerified()
  const runtimeVerified = useRuntimeVerified()
  return useContext(HostContext)?.mode === 'host' && online && verified && runtimeVerified
}

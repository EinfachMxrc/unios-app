// SPDX-License-Identifier: AGPL-3.0-or-later
// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest'
afterEach(() => {
  vi.unstubAllGlobals()
  vi.resetModules()
})
it('loads coordination and creates a secure document identity when randomUUID is unavailable', async () => {
  const getRandomValues = crypto.getRandomValues.bind(crypto)
  vi.stubGlobal('crypto', { getRandomValues })
  vi.stubGlobal('BroadcastChannel', undefined)
  vi.resetModules()
  const { manualWriterInstanceId } = await import('./manualDraftCoordination')
  expect(manualWriterInstanceId).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i)
})

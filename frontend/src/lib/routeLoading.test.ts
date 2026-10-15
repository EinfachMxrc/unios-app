// SPDX-License-Identifier: AGPL-3.0-or-later

import { describe, expect, it, vi } from 'vitest'
import { lazyRoute, preloadRoute } from './routeLoading'

describe('route intent loading', () => {
  it('deduplicates repeated intent and matches only the chosen route', async () => {
    const loader = vi.fn(async () => ({ default: () => null }))
    lazyRoute('/test-route/:id', loader)
    const first = preloadRoute('/test-route/4')
    expect(preloadRoute('/test-route/4')).toBe(first)
    await first
    expect(loader).toHaveBeenCalledTimes(1)
    expect(preloadRoute('/test-route/4/extra')).toBeUndefined()
    expect(preloadRoute('/external')).toBeUndefined()
  })
  it('allows a failed speculative download to retry on the next intent', async () => {
    const loader = vi.fn().mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValue({ default: () => null })
    lazyRoute('/retry-route', loader)
    await expect(preloadRoute('/retry-route')).rejects.toThrow('offline')
    await expect(preloadRoute('/retry-route')).resolves.toHaveProperty('default')
    expect(loader).toHaveBeenCalledTimes(2)
  })
})

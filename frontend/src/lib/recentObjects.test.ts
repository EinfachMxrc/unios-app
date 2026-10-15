// SPDX-License-Identifier: AGPL-3.0-or-later
// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, renderHook, act } from '@testing-library/react'
import { clearRecentObjects, recentHandle, rememberObject, useRecentObjects } from './recentObjects'
import { clearWorkspace } from './workspaceState'

afterEach(() => {
  cleanup()
  clearRecentObjects()
})
describe('recent object navigation', () => {
  it('only keeps stable object handles, stripping unrelated query parameters', () => {
    expect(recentHandle('/search', '?q=private')).toBeNull()
    expect(recentHandle('/setup', '?token=private')).toBeNull()
    expect(recentHandle('/notes', '?new=1')).toBeNull()
    expect(recentHandle('/notes', '?id=abc-123&token=private&title=private')).toBe('/notes?id=abc-123')
    expect(recentHandle('/material/34', '?page=14&token=private')).toBe('/material/34?page=14')
    expect(recentHandle('/material/34', '?page=-1')).toBe('/material/34')
  })
  it('deduplicates documents, updates their page, bounds history and clears it at a workspace change', () => {
    const { result } = renderHook(useRecentObjects)
    act(() => {
      rememberObject('/material/34?page=2', 'A PDF')
      rememberObject('/notes?id=abc', 'A note')
      rememberObject('/material/34?page=14', 'A PDF')
      rememberObject('https://outside.invalid/notes?id=abc', 'Foreign')
    })
    expect(result.current.map((item) => item.to)).toEqual(['/material/34?page=14', '/notes?id=abc'])
    act(() => {
      for (let index = 1; index <= 20; index++) rememberObject(`/courses/${index}`, `Course ${index}`)
    })
    expect(result.current).toHaveLength(12)
    expect(result.current[0].to).toBe('/courses/20')
    act(clearWorkspace)
    expect(result.current).toEqual([])
  })
})

// SPDX-License-Identifier: AGPL-3.0-or-later
// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { clearWorkspace } from '@/lib/workspaceState'
import { useSidebarScroll } from './useSidebarScroll'
function Navigation({ ready = true }: { ready?: boolean }) {
  const scroll = useSidebarScroll(ready)
  return <nav {...scroll} aria-label="fixture" />
}
beforeEach(() => {
  vi.spyOn(HTMLElement.prototype, 'getClientRects').mockReturnValue([{} as DOMRect] as unknown as DOMRectList)
})
afterEach(() => {
  cleanup()
  clearWorkspace()
  vi.restoreAllMocks()
})
it('restores the same navigation position across route shells and delayed course loading', () => {
  const first = render(<Navigation />)
  screen.getByRole('navigation').scrollTop = 260
  fireEvent.scroll(screen.getByRole('navigation'))
  first.unmount()
  const next = render(<Navigation ready={false} />)
  screen.getByRole('navigation').scrollTop = 0
  fireEvent.scroll(screen.getByRole('navigation'))
  next.rerender(<Navigation />)
  expect(screen.getByRole('navigation').scrollTop).toBe(260)
})

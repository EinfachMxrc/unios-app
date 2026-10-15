// SPDX-License-Identifier: AGPL-3.0-or-later
// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { TaskPeekDrawer } from './TaskPeekDrawer'

vi.mock('@/api', () => ({ useApi: () => ({ loading: false }), localDate: vi.fn() }))
vi.mock('@/i18n/useT', () => ({ useT: () => ({ t: (key: string) => key }) }))
vi.mock('@/components/PersonalTaskStatus', () => ({ PersonalTaskStatus: () => null }))
vi.mock('@/components/LinkedItems', () => ({ LinkedItems: () => null }))
vi.mock('@/components/State', () => ({ Loading: () => null, Failure: () => null }))
beforeEach(() => {
  vi.useFakeTimers()
  vi.stubGlobal('matchMedia', () => ({ matches: false }))
  Object.defineProperty(HTMLDialogElement.prototype, 'showModal', {
    configurable: true,
    value: function (this: HTMLDialogElement) {
      this.open = true
    },
  })
  Object.defineProperty(HTMLDialogElement.prototype, 'close', {
    configurable: true,
    value: function (this: HTMLDialogElement) {
      this.open = false
      this.dispatchEvent(new Event('close'))
    },
  })
})
afterEach(() => {
  cleanup()
  delete document.documentElement.dataset.reduceMotion
  Reflect.deleteProperty(HTMLDialogElement.prototype, 'showModal')
  Reflect.deleteProperty(HTMLDialogElement.prototype, 'close')
  vi.unstubAllGlobals()
  vi.useRealTimers()
})

describe('task sheet close timing', () => {
  it('closes immediately for the app preference without an invisible animation wait', () => {
    document.documentElement.dataset.reduceMotion = 'true'
    const closed = vi.fn()
    render(
      <MemoryRouter>
        <TaskPeekDrawer target={{ kind: 'deadline', id: 5 }} detail={<p>Fixture detail</p>} onClose={closed} />
      </MemoryRouter>,
    )
    fireEvent.click(screen.getByRole('button', { name: 'closeAria' }))
    expect(closed).toHaveBeenCalledOnce()
    expect(vi.getTimerCount()).toBe(0)
  })
  it('allows one close transition, ignores repeat clicks and resolves at 160ms', async () => {
    const closed = vi.fn()
    render(
      <MemoryRouter>
        <TaskPeekDrawer target={{ kind: 'deadline', id: 5 }} detail={<p>Fixture detail</p>} onClose={closed} />
      </MemoryRouter>,
    )
    const button = screen.getByRole('button', { name: 'closeAria' })
    fireEvent.click(button)
    fireEvent.click(button)
    expect(closed).not.toHaveBeenCalled()
    await vi.advanceTimersByTimeAsync(159)
    expect(closed).not.toHaveBeenCalled()
    await vi.advanceTimersByTimeAsync(1)
    expect(closed).toHaveBeenCalledOnce()
  })
})

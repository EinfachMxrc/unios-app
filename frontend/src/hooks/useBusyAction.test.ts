// SPDX-License-Identifier: AGPL-3.0-or-later
// @vitest-environment jsdom

import { act, cleanup, renderHook } from '@testing-library/react'
import { afterEach, expect, it } from 'vitest'
import { useBusyAction } from './useBusyAction'

afterEach(cleanup)

it('shows the server message itself, not "Error: …"', async () => {
  const { result } = renderHook(() => useBusyAction())
  let done = true
  await act(async () => {
    done = await result.current.run(async () => {
      throw new Error('Kurs nicht freigegeben')
    })
  })
  expect(done).toBe(false)
  expect(result.current.error).toBe('Kurs nicht freigegeben')
  expect(result.current.busy).toBe(false)
})

it('uses a translated failure text when the panel provides one, and clears it on the next try', async () => {
  const { result } = renderHook(() => useBusyAction())
  await act(async () => {
    await result.current.run(async () => {
      throw new Error('HTTP 500')
    }, 'Export fehlgeschlagen')
  })
  expect(result.current.error).toBe('Export fehlgeschlagen')
  let done = false
  await act(async () => {
    done = await result.current.run(async () => undefined)
  })
  expect(done).toBe(true)
  expect(result.current.error).toBe('')
})

it('keeps every action of the panel busy while one runs', async () => {
  const { result } = renderHook(() => useBusyAction())
  let finish = () => undefined as void
  let running: Promise<boolean> = Promise.resolve(true)
  act(() => {
    running = result.current.run(
      () =>
        new Promise<void>((resolve) => {
          finish = resolve
        }),
    )
  })
  expect(result.current.busy).toBe(true)
  finish()
  await act(() => running)
  expect(result.current.busy).toBe(false)
})

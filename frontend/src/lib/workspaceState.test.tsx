// SPDX-License-Identifier: AGPL-3.0-or-later
// @vitest-environment jsdom
import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { clearWorkspace, rememberWorkspace, useWorkspaceState, workspaceValue } from './workspaceState'
beforeEach(() => { clearWorkspace(); sessionStorage.clear() })
afterEach(() => vi.restoreAllMocks())
it('isolates course versions, functional updates and remounts', () => {
  const first = renderHook(() => useWorkspaceState('pdf:1:page', 1))
  act(() => first.result.current[1](page => page + 46))
  expect(first.result.current[0]).toBe(47)
  first.unmount()
  expect(renderHook(() => useWorkspaceState('pdf:1:page', 1)).result.current[0]).toBe(47)
  expect(workspaceValue('pdf:2:page', 1)).toBe(1)
})
it('keeps unsent assessment answers in RAM and clears all host context', () => {
  rememberWorkspace('answer', 'private draft', false)
  rememberWorkspace('calendar:day', '2026-10-04')
  expect(sessionStorage.getItem('unios-workspace-session-v1')).not.toContain('private draft')
  expect(workspaceValue('answer', '', { persist: false })).toBe('private draft')
  clearWorkspace()
  expect(workspaceValue('answer', '', { persist: false })).toBe('')
  expect(workspaceValue('calendar:day', '')).toBe('')
})
it('rejects malformed state and uses explicit shape validation', () => {
  rememberWorkspace('zoom', 'wrong')
  expect(workspaceValue('zoom', 760)).toBe(760)
  rememberWorkspace('page', NaN)
  expect(workspaceValue('page', 1)).toBe(1)
  rememberWorkspace('cursor', { wrong: true })
  expect(workspaceValue('cursor', null, { valid: (value): value is null => value === null })).toBeNull()
})
it('still works if session storage is denied', () => {
  vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('denied') })
  rememberWorkspace('course:3:filter', 'script')
  expect(workspaceValue('course:3:filter', '')).toBe('script')
})
it('bounds persisted UTF-8 data and least recently used entries', () => {
  for (let index = 0; index < 200; index++) rememberWorkspace(`course:${index}`, index)
  expect(JSON.parse(sessionStorage.getItem('unios-workspace-session-v1')!).length).toBeLessThanOrEqual(160)
  rememberWorkspace('large', '界'.repeat(300_000))
  expect(new TextEncoder().encode(sessionStorage.getItem('unios-workspace-session-v1')!).byteLength).toBeLessThanOrEqual(768 * 1024)
})

it('does not rewrite session storage on every editor cursor move', () => {
  const write = vi.spyOn(Storage.prototype, 'setItem')
  rememberWorkspace('editor:cursor', { from: 3, to: 3 }, false)
  rememberWorkspace('editor:cursor', { from: 4, to: 4 }, false)
  expect(write).not.toHaveBeenCalled()
})

it('keeps unsaved RAM drafts when large lists evict navigation history', () => {
  rememberWorkspace('exercise-proposal:1:draft', { question: 'Unsent correction' }, false)
  for (let index = 0; index < 300; index++) {
    rememberWorkspace(`exercise-proposal:${index + 2}:draft`, { question: `Draft ${index}` }, false)
    rememberWorkspace(`course:${index}:offset`, index)
  }
  expect(workspaceValue('exercise-proposal:1:draft', { question: '' }, { persist: false }))
    .toEqual({ question: 'Unsent correction' })
  expect(sessionStorage.getItem('unios-workspace-session-v1')).not.toContain('Unsent correction')
  expect(JSON.parse(sessionStorage.getItem('unios-workspace-session-v1')!).length).toBeLessThanOrEqual(160)
})

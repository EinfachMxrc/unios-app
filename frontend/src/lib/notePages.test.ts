// SPDX-License-Identifier: AGPL-3.0-or-later
// @vitest-environment jsdom
import { beforeEach, expect, it } from 'vitest'
import { clearWorkspace, workspaceValue } from './workspaceState'
import { pendingPageParentKey, rememberPageParentIntent, transferPageParentIntent } from './notePages'

const parent = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
const child = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
const other = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc'
beforeEach(() => {
  clearWorkspace()
  sessionStorage.clear()
})
const pending = (id: string) =>
  workspaceValue<string | null>(pendingPageParentKey(id), null, {
    valid: (value): value is string | null => value === null || typeof value === 'string',
  })

it('transfers an explicit parent to the acknowledged page exactly once', () => {
  rememberPageParentIntent(1, parent)
  transferPageParentIntent(1, child)
  expect(pending(child)).toBe(parent)
  transferPageParentIntent(1, other)
  expect(pending(other)).toBeNull()
  expect(sessionStorage.getItem('unios-workspace-session-v1')).toContain(parent)
})

it('keeps different course requests separate and a normal page save clears an old intent', () => {
  rememberPageParentIntent(1, parent)
  rememberPageParentIntent(2, other)
  rememberPageParentIntent(1, undefined)
  transferPageParentIntent(1, child)
  transferPageParentIntent(2, parent)
  expect(pending(child)).toBeNull()
  expect(pending(parent)).toBe(other)
})

it('rejects invalid and self parents and fences a late acknowledgement after a connection reset', () => {
  rememberPageParentIntent(1, 'https://outside.invalid')
  transferPageParentIntent(1, child)
  expect(pending(child)).toBeNull()
  rememberPageParentIntent(1, child)
  transferPageParentIntent(1, child)
  expect(pending(child)).toBeNull()
  rememberPageParentIntent(1, parent)
  clearWorkspace()
  transferPageParentIntent(1, child)
  expect(pending(child)).toBeNull()
})

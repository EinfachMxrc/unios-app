// SPDX-License-Identifier: AGPL-3.0-or-later
// @vitest-environment jsdom
import { beforeEach, expect, it, vi } from 'vitest'

const state = vi.hoisted(() => ({
  workspace: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
  read: null as null | (() => Promise<{ id: string }>),
  changed: null as null | (() => void),
}))
vi.mock('./manualDraftPersistence', () => ({
  readManualWorkspace: () => (state.read ? state.read() : Promise.resolve({ id: state.workspace })),
}))
vi.mock('./manualDraftCoordination', () => ({
  subscribeManualChanges: (changed: () => void) => {
    state.changed = changed
    return () => undefined
  },
}))

const id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
const other = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
const key = 'unios-source-note-targets-v1'
let targets: typeof import('./sourceNoteTarget')

beforeEach(async () => {
  vi.restoreAllMocks()
  vi.resetModules()
  state.workspace = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd'
  state.read = null
  state.changed = null
  localStorage.clear()
  sessionStorage.clear()
  targets = await import('./sourceNoteTarget')
})

it('restores the explicitly selected UUID after a new window while keeping document text out of metadata', async () => {
  targets.chooseSourceNoteTarget(2, 4, id)
  await targets.sourceNoteTargetsSettled()
  const saved = JSON.parse(localStorage.getItem(key)!)
  expect(saved).toEqual({ schema: 1, workspaceId: state.workspace, targets: [[2, 4, id]] })
  sessionStorage.clear()
  vi.resetModules()
  const nextWindow = await import('./sourceNoteTarget')
  expect(nextWindow.sourceNoteTarget(2, 4)).toBeNull()
  await nextWindow.restoreSourceNoteTarget(2, 4)
  expect(nextWindow.sourceNoteTarget(2, 4)).toBe(id)
  expect(nextWindow.sourceNoteTarget(2, 5)).toBeNull()
})

it('rejects a remembered handle from another pairing even when course and resource IDs overlap', async () => {
  localStorage.setItem(
    key,
    JSON.stringify({ schema: 1, workspaceId: 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee', targets: [[2, 4, id]] }),
  )
  await targets.restoreSourceNoteTarget(2, 4)
  expect(targets.sourceNoteTarget(2, 4)).toBeNull()
  expect(localStorage.getItem(key)).toBeNull()
})

it('does not replace a newer explicit selection when old durable restoration resolves later', async () => {
  localStorage.setItem(key, JSON.stringify({ schema: 1, workspaceId: state.workspace, targets: [[2, 4, id]] }))
  let release!: (value: { id: string }) => void
  state.read = () =>
    new Promise((resolve) => {
      release = resolve
    })
  const restore = targets.restoreSourceNoteTarget(2, 4)
  state.read = null
  targets.chooseSourceNoteTarget(2, 4, other)
  release({ id: state.workspace })
  await restore
  await targets.sourceNoteTargetsSettled()
  expect(targets.sourceNoteTarget(2, 4)).toBe(other)
  expect(JSON.parse(localStorage.getItem(key)!).targets).toEqual([[2, 4, other]])
})

it('remembers an explicit new-note choice without selecting an arbitrary old note next start', async () => {
  targets.chooseSourceNoteTarget(2, 4, id)
  targets.chooseSourceNoteTarget(2, 4, null)
  await targets.sourceNoteTargetsSettled()
  sessionStorage.clear()
  vi.resetModules()
  const restarted = await import('./sourceNoteTarget')
  await restarted.restoreSourceNoteTarget(2, 4)
  expect(restarted.sourceNoteTarget(2, 4)).toBeNull()
  expect(JSON.parse(localStorage.getItem(key)!).targets).toEqual([[2, 4, null]])
})

it('fences an outstanding metadata write when the workspace is cleared', async () => {
  let release!: (value: { id: string }) => void
  state.read = () =>
    new Promise((resolve) => {
      release = resolve
    })
  targets.chooseSourceNoteTarget(2, 4, id)
  await Promise.resolve()
  await Promise.resolve()
  window.dispatchEvent(new Event('unios:workspace-cleared'))
  release({ id: state.workspace })
  await targets.sourceNoteTargetsSettled()
  expect(targets.sourceNoteTarget(2, 4)).toBeNull()
  expect(localStorage.getItem(key)).toBeNull()
})

it('clears active handles after a pairing UUID rotates', async () => {
  targets.chooseSourceNoteTarget(2, 4, id)
  await targets.sourceNoteTargetsSettled()
  state.workspace = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee'
  state.changed!()
  await Promise.resolve()
  expect(targets.sourceNoteTarget(2, 4)).toBeNull()
  expect(localStorage.getItem(key)).toBeNull()
})

it('keeps a session choice when durable storage fails and reports the failed restart guarantee', async () => {
  vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
    throw new Error('Denied')
  })
  targets.chooseSourceNoteTarget(2, 4, id)
  await targets.sourceNoteTargetsSettled()
  expect(targets.sourceNoteTarget(2, 4)).toBe(id)
  const { workspaceValue } = await import('./workspaceState')
  expect(workspaceValue(`${targets.sourceNoteTargetKey(2, 4)}:resume-error`, false, { persist: false })).toBe(true)
})

it('rejects corrupt or unbounded remembered IDs', async () => {
  localStorage.setItem(
    key,
    JSON.stringify({ schema: 1, workspaceId: state.workspace, targets: [[2, 4, '../../foreign']] }),
  )
  await targets.restoreSourceNoteTarget(2, 4)
  expect(targets.sourceNoteTarget(2, 4)).toBeNull()
  expect(localStorage.getItem(key)).toBeNull()
  expect(() => targets.chooseSourceNoteTarget(2, 4, 'invalid')).toThrow('Invalid source note target')
})

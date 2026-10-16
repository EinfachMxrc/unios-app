// SPDX-License-Identifier: AGPL-3.0-or-later
// @vitest-environment jsdom
import { beforeEach, expect, it, vi } from 'vitest'

beforeEach(() => {
  sessionStorage.clear()
  vi.resetModules()
})

it('keeps distinct documents open and reuses a PDF tab across page links', async () => {
  const tabs = await import('./workspaceTabs')
  tabs.observeWorkspaceTab('/courses/1', 'course-key', null)
  const pdf = tabs.openWorkspaceTab('/material/7?page=12')!
  tabs.observeWorkspaceTab(pdf.to, 'pdf-key', { readerPageSync: true })
  tabs.openWorkspaceTab('/deadlines')
  expect(tabs.workspaceTabsSnapshot().items).toHaveLength(3)
  expect(tabs.openWorkspaceTab('/material/7?page=18')?.id).toBe(pdf.id)
  expect(tabs.workspaceTabsSnapshot().items).toHaveLength(3)
  expect(tabs.workspaceTabsSnapshot().items.find((item) => item.id === pdf.id)?.locationKey).toBe('pdf-key')
})

it('replaces the active destination on normal navigation and keeps different notes distinct', async () => {
  const tabs = await import('./workspaceTabs')
  const first = tabs.openWorkspaceTab('/notes?id=aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa')!
  const second = tabs.openWorkspaceTab('/notes?id=bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb')!
  tabs.observeWorkspaceTab(second.to, 'key-2', null)
  tabs.observeWorkspaceTab('/notes?id=aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa&revision=2', 'key-3', null)
  expect(tabs.workspaceTabsSnapshot().active).toBe(first.id)
  expect(tabs.workspaceTabsSnapshot().items).toHaveLength(2)
})

it('closing a tab preserves its document handle and restores it from closed history', async () => {
  const tabs = await import('./workspaceTabs')
  const course = tabs.openWorkspaceTab('/courses/1')!
  const note = tabs.openWorkspaceTab('/notes?new=1')!
  tabs.observeWorkspaceTab(note.to, 'draft-key', { selected: 3 })
  expect(tabs.closeWorkspaceTab(note.id)?.id).toBe(course.id)
  expect(tabs.reopenWorkspaceTab()).toMatchObject({ id: note.id, to: '/notes?new=1', locationKey: 'draft-key' })
  tabs.closeWorkspaceTab(course.id)
  tabs.closeWorkspaceTab(note.id)
  expect(tabs.workspaceTabsSnapshot().items[0].to).toBe('/workspace/new')
})

it('persists only bounded handles and does not write titles, searches, quotes or route state', async () => {
  const tabs = await import('./workspaceTabs')
  const tab = tabs.openWorkspaceTab('/material/7?page=12&workspace=1&quote=private-passage&token=secret')!
  tabs.observeWorkspaceTab(tab.to, 'a-key', { password: 'private-secret' })
  tabs.nameWorkspaceTab('Private lecture title', tab.to)
  const raw = sessionStorage.getItem('unios-workspace-tabs-v1')!
  expect(raw).toContain('/material/7?page=12&workspace=1')
  expect(raw).not.toMatch(/secret|private|Private|quote|title|password|routeState/)
  vi.resetModules()
  const reloaded = await import('./workspaceTabs')
  expect(reloaded.workspaceTabsSnapshot().items).toEqual([{ id: tab.id, to: '/material/7?page=12&workspace=1' }])
})

it('rejects external, API, download and setup targets and ignores invalid restored records', async () => {
  const tabs = await import('./workspaceTabs')
  for (const target of [
    'https://other.invalid/courses/1',
    '//other.invalid',
    '/api/notes',
    '/files/1',
    '/setup',
    '/welcome',
    '/import',
  ])
    expect(tabs.openWorkspaceTab(target)).toBeNull()
  sessionStorage.setItem(
    'unios-workspace-tabs-v1',
    JSON.stringify({
      active: 'bad',
      items: [
        { id: 'bad', to: '//other.invalid' },
        { id: 'valid', to: '/courses/1' },
        { id: 'copy', to: '/courses/1' },
      ],
    }),
  )
  vi.resetModules()
  const reloaded = await import('./workspaceTabs')
  expect(reloaded.workspaceTabsSnapshot()).toMatchObject({
    active: 'valid',
    items: [{ id: 'valid', to: '/courses/1' }],
  })
})

it('bounds tabs without evicting an open draft and supports explicit reordering', async () => {
  const tabs = await import('./workspaceTabs')
  for (let index = 1; index <= tabs.MAX_WORKSPACE_TABS; index++) tabs.openWorkspaceTab(`/material/${index}`)
  expect(tabs.openWorkspaceTab('/notes?new=1')).toBeNull()
  const first = tabs.workspaceTabsSnapshot().items[0]
  tabs.moveWorkspaceTab(first.id, 3)
  expect(tabs.workspaceTabsSnapshot().items[3].id).toBe(first.id)
  tabs.clearWorkspaceTabs()
  expect(tabs.workspaceTabsSnapshot().items).toEqual([])
  expect(sessionStorage.getItem('unios-workspace-tabs-v1')).toBeNull()
})

it('stays usable with denied storage without persisting a second copy', async () => {
  const write = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
    throw new DOMException('Denied')
  })
  try {
    const tabs = await import('./workspaceTabs')
    const note = tabs.openWorkspaceTab('/notes?new=1')!
    expect(tabs.workspaceTabsSnapshot().active).toBe(note.id)
    tabs.closeWorkspaceTab(note.id)
    expect(tabs.reopenWorkspaceTab()?.id).toBe(note.id)
  } finally {
    write.mockRestore()
  }
})

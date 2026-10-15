// SPDX-License-Identifier: AGPL-3.0-or-later
// @vitest-environment jsdom

import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { act, cleanup, renderHook, waitFor } from '@testing-library/react'
import { dehydrate } from '@tanstack/react-query'
import type { CourseDetail, NotesResponse } from '@/types'
import { queryClient } from '@/offlineCache'
import { request, requestResponse } from '@/api'
import {
  COURSE_FILE_CACHE,
  clearCourseOfflineData,
  courseOfflineScope,
  initialOfflineCatalog,
  inspectCourseOffline,
  offlineFileUrl,
  prepareCourseOffline,
  useOfflineFileUrl,
} from './courseOffline'

const state = vi.hoisted(() => ({
  scope: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  failBinding: false,
  persisted: null as unknown,
  desktop: false,
  listeners: [] as Array<() => void>,
}))
vi.mock('@/api', () => ({ request: vi.fn(), requestResponse: vi.fn() }))
vi.mock('./manualDraftPersistence', () => ({
  readManualWorkspace: async () => {
    if (state.failBinding) throw new Error('binding changing')
    return { id: state.scope, binding: 'ready' }
  },
}))
vi.mock('./manualDraftCoordination', () => ({
  subscribeManualChanges: (listener: () => void) => {
    state.listeners.push(listener)
    return () => {
      state.listeners = state.listeners.filter((item) => item !== listener)
    }
  },
}))
vi.mock('./desktop', () => ({ isDesktopApp: () => state.desktop }))
vi.mock('./routeLoading', () => ({ preloadRoute: vi.fn().mockResolvedValue(undefined) }))
vi.mock('@/offlineCache', async () => {
  const { QueryClient } = await import('@tanstack/react-query')
  return {
    queryClient: new QueryClient({ defaultOptions: { queries: { retry: false } } }),
    persistOptions: {},
    persister: { restoreClient: async () => state.persisted },
  }
})
vi.mock('@tanstack/react-query-persist-client', () => ({
  persistQueryClientSave: vi.fn(async ({ queryClient: client }) => {
    state.persisted = { clientState: dehydrate(client) }
  }),
}))

const stores = new Map<string, Map<string, Response>>()
const keyFor = (input: RequestInfo | URL) =>
  new URL(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url, 'http://localhost').href
function cache(name: string) {
  let entries = stores.get(name)
  if (!entries) {
    entries = new Map()
    stores.set(name, entries)
  }
  return {
    match: async (input: RequestInfo | URL) => entries.get(keyFor(input))?.clone(),
    put: async (input: RequestInfo | URL, response: Response) => {
      entries.set(keyFor(input), response.clone())
    },
    delete: async (input: RequestInfo | URL) => entries.delete(keyFor(input)),
    keys: async () => [...entries.keys()].map((url) => new Request(url)),
  } as unknown as Cache
}
const course = {
  course: { id: 1, name: 'Synthetic' },
  resources: [{ id: 10, filename: 'Synthetic.pdf', name: 'Synthetic.pdf', group_category: 'general' }],
  versions: { 10: [{ id: 17, mime_type: 'application/pdf', size: 10 }] },
  page: null,
} as unknown as CourseDetail
const noteId = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
const notes = {
  notes: [{ id: noteId, course_id: 1, current_revision: 2 }],
  courses: [],
  page: null,
} as unknown as NotesResponse
const noteDetail = {
  note: { id: noteId, course_id: 1, current_revision: 2 },
  body: '# Saved text',
  selected_revision: 2,
}
function fixtureReads() {
  vi.mocked(request).mockImplementation(async (path) => {
    if (path.startsWith('/api/courses/1')) return course
    if (path.startsWith('/api/notes?')) return notes
    if (path === `/api/notes/${noteId}`) return noteDetail
    if (path === '/api/material/17') return { course_id: 1, version_id: 17 }
    throw new Error(`Unexpected synthetic read ${path}`)
  })
  vi.mocked(requestResponse).mockResolvedValue(
    new Response('%PDF synthetic', { headers: { 'content-type': 'application/pdf' } }),
  )
}

beforeEach(async () => {
  state.failBinding = false
  state.scope = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
  state.desktop = false
  state.persisted = null
  queryClient.clear()
  stores.clear()
  vi.clearAllMocks()
  vi.stubGlobal('caches', {
    open: async (name: string) => cache(name),
    delete: async (name: string) => stores.delete(name),
  })
  await clearCourseOfflineData()
  fixtureReads()
})
afterEach(() => {
  cleanup()
  queryClient.clear()
  vi.unstubAllGlobals()
})

it('requires saved PDF bytes AND persisted metadata and current note bodies', async () => {
  const scope = await courseOfflineScope()
  const fallback = initialOfflineCatalog(course, notes)
  await cache(COURSE_FILE_CACHE).put(offlineFileUrl(17, scope), new Response('%PDF'))
  queryClient.setQueryData(['api', '/api/material/17'], { course_id: 1, version_id: 17 })
  queryClient.setQueryData(['api', `/api/notes/${noteId}`], noteDetail)
  expect(await inspectCourseOffline(scope, fallback)).toMatchObject({ filesSaved: 0, notesSaved: 0 })
  state.persisted = { clientState: dehydrate(queryClient) }
  expect(await inspectCourseOffline(scope, fallback)).toMatchObject({ filesSaved: 1, notesSaved: 1 })
  expect(
    await inspectCourseOffline(
      scope,
      initialOfflineCatalog(course, { ...notes, notes: [{ ...notes.notes[0], current_revision: 3 }] }),
    ),
  ).toMatchObject({ notesSaved: 0 })
})

it('prepares authenticated sequential reads, retains sources, and saves progress durably', async () => {
  const scope = await courseOfflineScope()
  const progress = vi.fn()
  const status = await prepareCourseOffline(1, scope, new AbortController().signal, progress)
  expect(status).toMatchObject({ filesSaved: 1, filesTotal: 1, notesSaved: 1, notesTotal: 1, complete: true })
  expect(status.savedAt).not.toBeNull()
  expect(requestResponse).toHaveBeenCalledExactlyOnceWith(
    '/files/17/inline',
    expect.objectContaining({ cache: 'no-store' }),
  )
  expect(progress).toHaveBeenLastCalledWith(2, 2)
  expect(await cache(COURSE_FILE_CACHE).match(offlineFileUrl(17, scope, ''))).toBeDefined()
})

it('does not count non-PDF downloads or an unsuccessful file as fully prepared', async () => {
  vi.mocked(requestResponse).mockResolvedValue(
    new Response('Unexpected login', { headers: { 'content-type': 'text/html' } }),
  )
  const status = await prepareCourseOffline(1, await courseOfflineScope(), new AbortController().signal, vi.fn())
  expect(status).toMatchObject({ filesSaved: 0, notesSaved: 1, complete: false })
  expect(
    initialOfflineCatalog(
      {
        ...course,
        resources: [{ ...course.resources[0], filename: 'Synthetic.mp4' }],
        versions: { 10: [{ ...course.versions[10][0], mime_type: 'video/mp4' }] },
      },
      notes,
    ),
  ).toMatchObject({ pdfs: [], unsupported: 1 })
})

it('skips oversized files without attempting their download', async () => {
  vi.mocked(request).mockImplementation(async (path) =>
    path.startsWith('/api/courses/1')
      ? { ...course, versions: { 10: [{ ...course.versions[10][0], size: 26 * 1024 * 1024 }] } }
      : path.startsWith('/api/notes?')
        ? { ...notes, notes: [] }
        : undefined,
  )
  const status = await prepareCourseOffline(1, await courseOfflineScope(), new AbortController().signal, vi.fn())
  expect(status).toMatchObject({ filesSaved: 0, complete: false })
  expect(requestResponse).not.toHaveBeenCalled()
})

it('never saves a late file response after a workspace rotation and removes the old scope', async () => {
  const scope = await courseOfflineScope()
  vi.mocked(requestResponse).mockImplementation(async () => {
    state.scope = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc'
    return new Response('%PDF synthetic', { headers: { 'content-type': 'application/pdf' } })
  })
  await expect(prepareCourseOffline(1, scope, new AbortController().signal, vi.fn())).rejects.toThrow(
    'OFFLINE_BINDING_CHANGED',
  )
  await courseOfflineScope()
  expect(await cache(COURSE_FILE_CACHE).match(offlineFileUrl(17, scope))).toBeUndefined()
  expect([...stores.get(COURSE_FILE_CACHE)!.keys()]).toHaveLength(0)
})

it('keeps normal PDF URLs stable until the specific file is explicitly saved', async () => {
  const { result } = renderHook(() => useOfflineFileUrl(17))
  await act(async () => {
    await courseOfflineScope()
  })
  expect(result.current).toBe('/files/17/inline')
  const scope = await courseOfflineScope()
  await cache(COURSE_FILE_CACHE).put(offlineFileUrl(17, scope), new Response('%PDF'))
  act(() => window.dispatchEvent(new Event('unios:course-prepared')))
  await waitFor(() => expect(result.current).toBe(offlineFileUrl(17, scope)))
  state.failBinding = true
  await act(async () => {
    state.listeners.forEach((listener) => listener())
  })
  await waitFor(() => expect(result.current).toBe('/files/17/inline'))
})

it('reads prepared PDFs natively without a service worker and revokes the active blob on binding reset', async () => {
  state.desktop = true
  const create = vi.fn().mockReturnValue('blob:synthetic-offline-file')
  const revoke = vi.fn()
  vi.stubGlobal('URL', Object.assign(URL, { createObjectURL: create, revokeObjectURL: revoke }))
  const scope = await courseOfflineScope()
  await cache(COURSE_FILE_CACHE).put(offlineFileUrl(17, scope), new Response('%PDF'))
  const { result } = renderHook(() => useOfflineFileUrl(17))
  await waitFor(() => expect(result.current).toBe('blob:synthetic-offline-file'))
  await act(async () => {
    state.listeners.forEach((listener) => listener())
  })
  expect(create).toHaveBeenCalledTimes(1)
  act(() => window.dispatchEvent(new Event('unios:workspace-cleared')))
  await waitFor(() => expect(revoke).toHaveBeenCalledWith('blob:synthetic-offline-file'))
})

it('prepares every course and note page instead of reporting the first visible page as the whole course', async () => {
  const secondId = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc'
  const secondResource = { ...course.resources[0], id: 11, name: 'Second.pdf', filename: 'Second.pdf' }
  const secondVersion = { ...course.versions[10][0], id: 18 }
  vi.mocked(request).mockImplementation(async (path) => {
    if (path === '/api/courses/1') return { ...course, page: { has_more: true, offset: 0, limit: 1, total: 2 } }
    if (path === '/api/courses/1?offset=1')
      return {
        ...course,
        resources: [secondResource],
        versions: { 11: [secondVersion] },
        page: { has_more: false, offset: 1, limit: 1, total: 2 },
      }
    if (path === '/api/notes?course_id=1') return { ...notes, page: { has_more: true, offset: 0, limit: 1, total: 2 } }
    if (path === '/api/notes?course_id=1&offset=1')
      return {
        ...notes,
        notes: [{ ...notes.notes[0], id: secondId }],
        page: { has_more: false, offset: 1, limit: 1, total: 2 },
      }
    if (path.startsWith('/api/notes/'))
      return { ...noteDetail, note: { ...noteDetail.note, id: path.split('/').pop() } }
    if (path.startsWith('/api/material/')) return { course_id: 1, version_id: Number(path.split('/').pop()) }
    throw new Error('Unexpected synthetic request')
  })
  vi.mocked(requestResponse).mockImplementation(
    async () => new Response('%PDF synthetic', { headers: { 'content-type': 'application/pdf' } }),
  )
  const progress = vi.fn()
  const status = await prepareCourseOffline(1, await courseOfflineScope(), new AbortController().signal, progress)
  expect(status).toMatchObject({ filesSaved: 2, filesTotal: 2, notesSaved: 2, notesTotal: 2, complete: true })
  expect(progress).toHaveBeenLastCalledWith(4, 4)
})

it('aborts preparation reads with TanStack cancellation before old pairing responses can persist', async () => {
  let readSignal: AbortSignal | undefined
  vi.mocked(request).mockImplementation(async (_path, options) => {
    readSignal = options?.signal ?? undefined
    return new Promise((_resolve, reject) => {
      readSignal!.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')), { once: true })
    })
  })
  const scope = await courseOfflineScope()
  const pending = prepareCourseOffline(1, scope, new AbortController().signal, vi.fn())
  const rejected = expect(pending).rejects.toBeDefined()
  await waitFor(() => expect(readSignal).toBeDefined())
  await queryClient.cancelQueries({ queryKey: ['api'] })
  await rejected
  expect(readSignal?.aborted).toBe(true)
  expect(state.persisted).toBeNull()
  expect([...stores.get(COURSE_FILE_CACHE)!.keys()]).toHaveLength(0)
})

it('replaces an old prepared resource version in the displayed readiness count', async () => {
  const scope = await courseOfflineScope()
  await prepareCourseOffline(1, scope, new AbortController().signal, vi.fn())
  const newerCourse = { ...course, versions: { 10: [{ ...course.versions[10][0], id: 18 }] } }
  expect(await inspectCourseOffline(scope, initialOfflineCatalog(newerCourse, notes))).toMatchObject({
    filesSaved: 0,
    filesTotal: 1,
    notesSaved: 1,
    complete: false,
  })
})

// SPDX-License-Identifier: AGPL-3.0-or-later

import { useEffect, useState } from 'react'
import { persistQueryClientSave } from '@tanstack/react-query-persist-client'
import { request, requestResponse } from '@/api'
import { queryClient, persistOptions, persister } from '@/offlineCache'
import type { CourseDetail, Material, NoteDetail, NotesResponse } from '@/types'
import { readManualWorkspace } from './manualDraftPersistence'
import { subscribeManualChanges } from './manualDraftCoordination'
import { preloadRoute } from './routeLoading'
import { isDesktopApp } from './desktop'

/** Only explicitly prepared PDFs use this cache. A binding UUID is never a credential. */
export const COURSE_FILE_CACHE = 'unios-course-files-v1'
const SCOPE_PARAM = 'unios-offline-scope'
const MAX_ITEMS = 200
const MAX_FILE_BYTES = 25 * 1024 * 1024
const MAX_COURSE_BYTES = 150 * 1024 * 1024
let revision = 0
let activeScope: string | null = null

type SavedPdf = { resourceId: number; versionId: number; name: string; size: number }
type SavedNote = { id: string; revision: number }
export type CourseOfflineCatalog = {
  schema: 1
  courseId: number
  savedAt: string
  pdfs: SavedPdf[]
  notes: SavedNote[]
  unsupported: number
  complete: boolean
}
export type CourseOfflineStatus = {
  filesSaved: number
  filesTotal: number
  notesSaved: number
  notesTotal: number
  unsupported: number
  complete: boolean
  savedAt: string | null
}

export function offlineFileUrl(versionId: number, scope: string, suffix: 'inline' | '' = 'inline') {
  return `/files/${versionId}${suffix ? `/${suffix}` : ''}?${SCOPE_PARAM}=${encodeURIComponent(scope)}`
}
const catalogUrl = (courseId: number, scope: string) =>
  `/__unios_offline__/courses/${courseId}?${SCOPE_PARAM}=${encodeURIComponent(scope)}`

async function cacheStore() {
  if (typeof caches === 'undefined') throw new Error('OFFLINE_STORAGE_UNAVAILABLE')
  return caches.open(COURSE_FILE_CACHE)
}

async function pruneScope(scope: string | null) {
  const cache = await cacheStore()
  for (const key of await cache.keys()) {
    if (new URL(key.url).searchParams.get(SCOPE_PARAM) !== scope) await cache.delete(key)
  }
}

/** Pairing fences and rotated workspaces are shared across windows by the existing binding store. */
export async function courseOfflineScope(): Promise<string> {
  const workspace = await readManualWorkspace()
  if (activeScope !== workspace.id) {
    activeScope = workspace.id
    revision += 1
    await pruneScope(workspace.id)
  }
  return workspace.id
}

export async function clearCourseOfflineData() {
  revision += 1
  activeScope = null
  if (typeof caches !== 'undefined') await caches.delete(COURSE_FILE_CACHE)
}

if (typeof window !== 'undefined') {
  window.addEventListener('unios:workspace-cleared', () => {
    void clearCourseOfflineData().catch(() => undefined)
  })
  subscribeManualChanges(() => {
    void readManualWorkspace()
      .then((workspace) => {
        if (activeScope && workspace.id !== activeScope) return clearCourseOfflineData()
      })
      .catch(() => clearCourseOfflineData())
      .catch(() => undefined)
  })
}

export function useOfflineFileUrl(versionId: number, suffix: 'inline' | '' = 'inline') {
  const [prepared, setPrepared] = useState<{ versionId: number; suffix: string; url: string } | null>(null)
  useEffect(() => {
    let alive = true
    let attempt = 0
    let blobUrl: string | null = null
    let resolvedScope: string | null = null
    const release = () => {
      setPrepared(null)
      resolvedScope = null
      if (blobUrl) {
        URL.revokeObjectURL(blobUrl)
        blobUrl = null
      }
    }
    const refresh = () => {
      const current = ++attempt
      void courseOfflineScope()
        .then(async (scope) => {
          const cache = await cacheStore()
          const url = offlineFileUrl(versionId, scope, suffix)
          const saved = await cache.match(url)
          if (!alive || current !== attempt) return
          if (!saved) {
            release()
            return
          }
          if (resolvedScope === scope) return
          // The native build deliberately has no service worker. Its explicit
          // local copy is read as a blob rather than sent to the HTTPS proxy.
          const resolved = isDesktopApp() ? URL.createObjectURL(await saved.blob()) : url
          if (!alive || current !== attempt) {
            if (resolved.startsWith('blob:')) URL.revokeObjectURL(resolved)
            return
          }
          if (resolved.startsWith('blob:')) blobUrl = resolved
          resolvedScope = scope
          setPrepared({ versionId, suffix, url: resolved })
        })
        .catch(() => {
          if (alive && current === attempt) release()
        })
    }
    refresh()
    const unsubscribe = subscribeManualChanges(refresh)
    const reset = () => {
      release()
      refresh()
    }
    window.addEventListener('unios:workspace-cleared', reset)
    window.addEventListener('unios:course-prepared', refresh)
    return () => {
      alive = false
      unsubscribe()
      window.removeEventListener('unios:workspace-cleared', reset)
      window.removeEventListener('unios:course-prepared', refresh)
      if (blobUrl) URL.revokeObjectURL(blobUrl)
    }
  }, [versionId, suffix])
  return prepared?.versionId === versionId && prepared.suffix === suffix
    ? prepared.url
    : `/files/${versionId}${suffix ? `/${suffix}` : ''}`
}

function pdfsFrom(detail: CourseDetail): SavedPdf[] {
  return detail.resources.flatMap((resource) => {
    if (resource.group_category === 'other_group') return []
    const version = detail.versions[resource.id]?.[0]
    if (!version || !(version.mime_type === 'application/pdf' || /\.pdf$/i.test(resource.filename ?? ''))) return []
    return [{ resourceId: resource.id, versionId: version.id, name: resource.name, size: version.size }]
  })
}

function unsupportedFrom(detail: CourseDetail) {
  const pdfIds = new Set(pdfsFrom(detail).map((item) => item.versionId))
  return detail.resources.filter(
    (resource) => resource.group_category !== 'other_group' && !pdfIds.has(detail.versions[resource.id]?.[0]?.id),
  ).length
}

export function initialOfflineCatalog(detail: CourseDetail, notes: NotesResponse | null): CourseOfflineCatalog {
  return {
    schema: 1,
    courseId: detail.course.id,
    savedAt: '',
    pdfs: pdfsFrom(detail),
    notes: (notes?.notes ?? []).map((note) => ({ id: note.id, revision: note.current_revision })),
    unsupported: unsupportedFrom(detail),
    complete:
      !(detail.page?.has_more || detail.page?.offset || notes?.page?.has_more || notes?.page?.offset) && notes !== null,
  }
}

function validCatalog(value: unknown, courseId: number): value is CourseOfflineCatalog {
  if (!value || typeof value !== 'object') return false
  const catalog = value as CourseOfflineCatalog
  return (
    catalog.schema === 1 &&
    catalog.courseId === courseId &&
    typeof catalog.savedAt === 'string' &&
    typeof catalog.complete === 'boolean' &&
    Number.isSafeInteger(catalog.unsupported) &&
    catalog.unsupported >= 0 &&
    Array.isArray(catalog.pdfs) &&
    catalog.pdfs.length <= MAX_ITEMS &&
    catalog.pdfs.every(
      (pdf) =>
        Number.isSafeInteger(pdf.resourceId) &&
        Number.isSafeInteger(pdf.versionId) &&
        pdf.versionId > 0 &&
        typeof pdf.name === 'string' &&
        Number.isFinite(pdf.size),
    ) &&
    Array.isArray(catalog.notes) &&
    catalog.notes.length <= MAX_ITEMS &&
    catalog.notes.every(
      (note) =>
        typeof note.id === 'string' && /^[0-9a-f-]{1,80}$/i.test(note.id) && Number.isSafeInteger(note.revision),
    )
  )
}

/** Count actual stored file responses and persisted current note bodies, rather than page visits. */
export async function inspectCourseOffline(
  scope: string,
  fallback: CourseOfflineCatalog,
): Promise<CourseOfflineStatus> {
  const cache = await cacheStore()
  const stored = await cache.match(catalogUrl(fallback.courseId, scope))
  let catalog = fallback
  if (stored) {
    const parsed: unknown = await stored.json()
    if (validCatalog(parsed, fallback.courseId)) {
      // An already known newer file or note must immediately invalidate its readiness.
      const files = new Map(parsed.pdfs.map((pdf) => [pdf.resourceId, pdf]))
      for (const pdf of fallback.pdfs) files.set(pdf.resourceId, pdf)
      const notes = new Map(parsed.notes.map((note) => [note.id, note]))
      for (const note of fallback.notes) notes.set(note.id, note)
      catalog = { ...parsed, pdfs: [...files.values()], notes: [...notes.values()] }
    }
  }
  const persisted = await persister.restoreClient()
  const queries = persisted?.clientState.queries ?? []
  let filesSaved = 0
  for (const pdf of catalog.pdfs) {
    const file = await cache.match(offlineFileUrl(pdf.versionId, scope))
    const metadata = queries.find(
      (query) => query.queryKey[0] === 'api' && query.queryKey[1] === `/api/material/${pdf.versionId}`,
    )?.state.data as Material | undefined
    if (file?.ok && metadata?.version_id === pdf.versionId && metadata.course_id === catalog.courseId) filesSaved += 1
  }
  let notesSaved = 0
  for (const note of catalog.notes) {
    const data = queries.find((query) => query.queryKey[0] === 'api' && query.queryKey[1] === `/api/notes/${note.id}`)
      ?.state.data as NoteDetail | undefined
    if (
      typeof data?.body === 'string' &&
      data.note.course_id === catalog.courseId &&
      data.note.current_revision === note.revision &&
      data.selected_revision === note.revision
    )
      notesSaved += 1
  }
  return {
    filesSaved,
    filesTotal: catalog.pdfs.length,
    notesSaved,
    notesTotal: catalog.notes.length,
    unsupported: catalog.unsupported,
    complete:
      catalog.complete &&
      catalog.unsupported === 0 &&
      filesSaved === catalog.pdfs.length &&
      notesSaved === catalog.notes.length,
    savedAt: catalog.savedAt || null,
  }
}

async function saveRead<T>(path: string, signal: AbortSignal): Promise<T> {
  return queryClient.fetchQuery<T>({
    queryKey: ['api', path],
    queryFn: ({ signal: querySignal }) => request<T>(path, { signal: AbortSignal.any([signal, querySignal]) }),
    meta: { offlineCache: true },
    staleTime: 0,
    networkMode: 'always',
  })
}

/** Downloads sequentially, only from UniOS. Limits keep an accidental whole-course download bounded. */
export async function prepareCourseOffline(
  courseId: number,
  scope: string,
  signal: AbortSignal,
  progress: (done: number, total: number) => void,
): Promise<CourseOfflineStatus> {
  const started = revision
  const assertBinding = async () => {
    if (signal.aborted) throw new DOMException('Aborted', 'AbortError')
    const workspace = await readManualWorkspace()
    if (workspace.id !== scope || revision !== started) throw new Error('OFFLINE_BINDING_CHANGED')
  }
  await assertBinding()
  const cache = await cacheStore()
  const resources: CourseDetail['resources'] = []
  const versions: CourseDetail['versions'] = {}
  let detail: CourseDetail
  let offset = 0
  let complete = true
  do {
    await assertBinding()
    detail = await saveRead<CourseDetail>(`/api/courses/${courseId}${offset ? `?offset=${offset}` : ''}`, signal)
    if (detail.course.id !== courseId) throw new Error('OFFLINE_COURSE_MISMATCH')
    resources.push(...detail.resources)
    Object.assign(versions, detail.versions)
    offset += detail.resources.length
    if (!detail.page?.has_more) break
    if (!detail.resources.length || offset >= MAX_ITEMS) {
      complete = false
      break
    }
  } while (offset < MAX_ITEMS)
  const allNotes: NotesResponse['notes'] = []
  offset = 0
  do {
    await assertBinding()
    const notes = await saveRead<NotesResponse>(
      `/api/notes?course_id=${courseId}${offset ? `&offset=${offset}` : ''}`,
      signal,
    )
    allNotes.push(...notes.notes.filter((note) => note.course_id === courseId))
    offset += notes.notes.length
    if (!notes.page?.has_more) break
    if (!notes.notes.length || offset >= MAX_ITEMS) {
      complete = false
      break
    }
  } while (offset < MAX_ITEMS)
  const catalog = initialOfflineCatalog(
    { ...detail!, resources: resources.slice(0, MAX_ITEMS), versions, page: null },
    { notes: allNotes.slice(0, MAX_ITEMS), courses: [], page: null },
  )
  catalog.complete = complete && resources.length <= MAX_ITEMS && allNotes.length <= MAX_ITEMS
  const total = catalog.pdfs.length + catalog.notes.length
  let done = 0
  let bytes = 0
  let failed = false
  progress(0, total)
  for (const pdf of catalog.pdfs) {
    await assertBinding()
    if (pdf.size > MAX_FILE_BYTES || bytes + pdf.size > MAX_COURSE_BYTES) {
      failed = true
      progress(++done, total)
      continue
    }
    try {
      const metadata = await saveRead<Material>(`/api/material/${pdf.versionId}`, signal)
      if (metadata.course_id !== courseId || metadata.version_id !== pdf.versionId)
        throw new Error('OFFLINE_MATERIAL_MISMATCH')
      const response = await requestResponse(`/files/${pdf.versionId}/inline`, { signal, cache: 'no-store' })
      if (response.headers.get('content-type')?.split(';')[0] !== 'application/pdf' || response.status !== 200)
        throw new Error('OFFLINE_NOT_PDF')
      const blob = await response.blob()
      if (blob.size > MAX_FILE_BYTES || bytes + blob.size > MAX_COURSE_BYTES) throw new Error('OFFLINE_SIZE_LIMIT')
      await assertBinding()
      const stored = new Response(blob, {
        headers: { 'Content-Type': 'application/pdf', 'Content-Length': String(blob.size) },
      })
      await cache.put(offlineFileUrl(pdf.versionId, scope), stored.clone())
      await cache.put(offlineFileUrl(pdf.versionId, scope, ''), stored)
      await assertBinding()
      bytes += blob.size
    } catch {
      await assertBinding()
      failed = true
    }
    progress(++done, total)
  }
  for (const note of catalog.notes) {
    await assertBinding()
    try {
      const data = await saveRead<NoteDetail>(`/api/notes/${note.id}`, signal)
      if (data.note.course_id !== courseId || data.note.id !== note.id) throw new Error('OFFLINE_NOTE_MISMATCH')
      note.revision = data.note.current_revision
    } catch {
      await assertBinding()
      failed = true
    }
    progress(++done, total)
  }
  await assertBinding()
  await Promise.all([preloadRoute('/material/1'), preloadRoute('/notes')])
  await persistQueryClientSave({ queryClient, ...persistOptions })
  await assertBinding()
  catalog.savedAt = new Date().toISOString()
  catalog.complete &&= !failed
  await cache.put(
    catalogUrl(courseId, scope),
    new Response(JSON.stringify(catalog), { headers: { 'Content-Type': 'application/json' } }),
  )
  await assertBinding()
  window.dispatchEvent(new Event('unios:course-prepared'))
  return inspectCourseOffline(scope, catalog)
}

// SPDX-License-Identifier: AGPL-3.0-or-later

import { request } from '@/api'
import { queryClient } from '@/offlineCache'

export type TrashKind = 'note' | 'jot'
export type TrashItem = {
  kind: TrashKind
  id: string
  title: string
  course_id: number | null
  course_name: string | null
  deleted_at: string
}

/** Every cached list that may show a note or a quick note, refreshed after the trash changes. */
const AFFECTED = ['/api/notes', '/api/jots', '/api/search', '/api/trash', '/api/links', '/api/courses', '/api/overview']

export function refreshAfterTrash() {
  return queryClient.invalidateQueries({
    predicate: (query) =>
      query.queryKey[0] === 'api' &&
      typeof query.queryKey[1] === 'string' &&
      AFFECTED.some((prefix) => (query.queryKey[1] as string).startsWith(prefix)),
  })
}

export async function moveToTrash(kind: TrashKind, id: string) {
  await request(`/api/${kind === 'note' ? 'notes' : 'jots'}/${encodeURIComponent(id)}/trash`, { method: 'POST' })
  void refreshAfterTrash()
}

export async function restoreFromTrash(kind: TrashKind, id: string) {
  await request(`/api/trash/${kind}/${encodeURIComponent(id)}/restore`, { method: 'POST' })
  void refreshAfterTrash()
}

export async function eraseFromTrash(kind: TrashKind, id: string) {
  await request(`/api/trash/${kind}/${encodeURIComponent(id)}`, { method: 'DELETE' })
  void refreshAfterTrash()
}

export async function emptyTrash(): Promise<number> {
  const result = await request<{ erased: number }>('/api/trash', { method: 'DELETE' })
  void refreshAfterTrash()
  return result.erased
}

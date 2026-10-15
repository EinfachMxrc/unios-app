// SPDX-License-Identifier: AGPL-3.0-or-later

import { request, useApi } from '@/api'
import { queryClient } from '@/offlineCache'
import { markMaterialsSeen } from '@/hooks/useSeenMaterials'
import type { Overview } from '@/types'

export type NotificationItem = {
  id: number
  title: string
  body: string
  course_id: number | null
  kind: string
  created_at: string
  read_at: string | null
  muted: boolean
  url: string
}
export type NotificationCenter = {
  unread: number
  muted_scopes: string[]
  courses: Array<{ id: number; name: string }>
  items: NotificationItem[]
  latest_id?: number
  seen_material_changes?: number[]
}

const path = '/api/notifications'

export function useNotifications() {
  return useApi<NotificationCenter>(path, { refetchInterval: 60_000 })
}

export async function setNotificationRead(identifier: number, read: boolean) {
  await request(`${path}/${identifier}`, { method: 'PATCH', body: JSON.stringify({ read }) })
  const center = await request<NotificationCenter>(path)
  queryClient.setQueryData(['api', path], center)
  return center
}

export async function markAllNotificationsSeen(throughId: number) {
  // Portal imports can have a Today change without a notification of their own.
  // Capture them before acknowledging; later arrivals must remain new.
  const overview =
    queryClient.getQueryData<Overview>(['api', '/api/overview']) ?? (await request<Overview>('/api/overview'))
  const materialChanges = overview.changes.filter((item) => item.kind === 'new').map((item) => item.id)
  const center = await request<NotificationCenter>(`${path}/read-all`, {
    method: 'POST',
    body: JSON.stringify({ through_id: throughId }),
  })
  queryClient.setQueryData(['api', path], center)
  markMaterialsSeen(materialChanges)
  return center
}

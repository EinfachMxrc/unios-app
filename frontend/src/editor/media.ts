// SPDX-License-Identifier: AGPL-3.0-or-later

import { request } from '@/api'

export const MAX_MEDIA_BYTES = 25_000_000
export const MEDIA_ACCEPT = 'image/png,image/jpeg,image/webp,audio/mpeg,audio/wav,audio/ogg,video/mp4,video/webm'

export type UploadedAsset = { src: string; kind: string }

/** Media is stored by the host; the document only keeps the returned asset address. */
export function uploadNoteAsset(file: File, signal: AbortSignal): Promise<UploadedAsset> {
  const form = new FormData()
  form.append('file', file)
  return request<UploadedAsset>('/api/note-assets', { method: 'POST', body: form, signal })
}

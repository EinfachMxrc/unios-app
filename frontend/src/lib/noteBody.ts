// SPDX-License-Identifier: AGPL-3.0-or-later

import { useMemo } from 'react'
import { useApi } from '@/api'
import { bodyFromApi, parseBody, serializeDoc } from '@/editor/doc'
import type { NoteDetail } from '@/types'

/**
 * Drafts, merges and conflict checks compare one string per note. The host stores a block
 * document; this is its draft form, so a stored note and its local draft compare equal.
 */
export function withDraftBody(detail: NoteDetail): NoteDetail {
  // A response cached before documents existed has only Markdown; keep its text rather than showing an empty note.
  const body = detail.document ? bodyFromApi(detail.document) : serializeDoc(parseBody(detail.body ?? ''))
  return { ...detail, body }
}

/** What the host expects when a draft body is saved. */
export function documentPayload(body: string) {
  return parseBody(body)
}

export function useNoteDetail(path: string, options?: { enabled?: boolean }) {
  const result = useApi<NoteDetail>(path, options)
  const data = useMemo(() => (result.data ? withDraftBody(result.data) : result.data), [result.data])
  return { ...result, data }
}

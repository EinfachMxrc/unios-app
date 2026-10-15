// SPDX-License-Identifier: AGPL-3.0-or-later

import { randomId } from '@/lib/uuid'

import { useLayoutEffect, useRef, useState } from 'react'
import { request } from '@/api'
import { queueAnnotation } from '@/annotationQueue'
import { isHostOnline } from '@/hostAvailability'
import { useT } from '@/i18n/useT'
import { useWorkspaceState } from '@/lib/workspaceState'
import type { Material, MaterialAnnotation } from '@/types'
import type { Selection } from './ReaderParts'
import { clearSavedBrowserSelection, readReaderSelection } from './readerSelection'
import { extractApiErrorMessage } from '@/hooks/useApiMutation'

function validSelection(value: unknown): value is Selection | null {
  return (
    value === null ||
    (!!value &&
      typeof value === 'object' &&
      typeof (value as Selection).quote === 'string' &&
      Number.isSafeInteger((value as Selection).page) &&
      Array.isArray((value as Selection).rects))
  )
}

/**
 * The reader's marking workflow: the current passage, its draft comment, and
 * saving it as highlight or question (queued while offline), editing, deleting
 * and re-anchoring marks. A save only clears what is still the same passage,
 * so a newer selection made while it ran survives.
 */
export function useReaderAnnotations({
  versionId,
  data,
  reload,
  canWrite,
  online,
}: {
  versionId: number
  data: Material | null
  reload: () => void
  canWrite: boolean
  online: boolean
}) {
  const { t } = useT('material')
  const [selection, setSelection] = useWorkspaceState<Selection | null>(`pdf:${versionId}:selection`, null, {
    persist: false,
    valid: validSelection,
  })
  const [comment, setComment] = useWorkspaceState(`pdf:${versionId}:comment`, '', { persist: false })
  const [reanchorId, setReanchorId] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [actionError, setActionError] = useState('')
  const [actionMessage, setActionMessage] = useState('')
  const savingGuard = useRef(false)
  const latest = useRef({ selection, comment })
  useLayoutEffect(() => {
    latest.current = { selection, comment }
  }, [selection, comment])

  function captureSelection() {
    const result = readReaderSelection(window.getSelection())
    if (result.kind !== 'selection') {
      setSelection(null)
      if (result.kind === 'constraint') setActionError(t('selectionConstraint'))
      return
    }
    setActionError('')
    setActionMessage('')
    setSelection(result.selection)
  }

  async function add(kind: 'highlight' | 'question') {
    if (!selection || savingGuard.current || (online && !canWrite)) return
    const captured = selection
    const capturedComment = comment
    savingGuard.current = true
    setSaving(true)
    setActionError('')
    setActionMessage('')
    const entry = {
      id: randomId(),
      versionId,
      kind,
      quote: captured.quote,
      page: captured.page,
      rects: captured.rects,
      comment: capturedComment,
      createdAt: new Date().toISOString(),
    }
    try {
      let queued = !canWrite
      if (!queued) {
        try {
          await request(`/api/material/${versionId}/annotations`, { method: 'POST', body: JSON.stringify(entry) })
        } catch (cause) {
          if (isHostOnline()) throw cause
          queued = true
        }
      }
      if (queued) {
        await queueAnnotation(entry)
        setActionMessage(t('annotationQueuedMessage'))
      } else {
        reload()
      }
      if (latest.current.selection === captured && latest.current.comment === capturedComment) {
        setSelection((current) => (current === captured ? null : current))
        setComment((current) => (current === capturedComment ? '' : current))
        clearSavedBrowserSelection(captured.quote)
      }
    } catch (cause) {
      setActionError(extractApiErrorMessage(cause))
    } finally {
      savingGuard.current = false
      setSaving(false)
    }
  }

  async function update(item: MaterialAnnotation, nextComment: string, resolved: boolean) {
    await request(`/api/material/annotations/${item.id}`, {
      method: 'PATCH',
      body: JSON.stringify({ expected_revision: item.revision, comment: nextComment, resolved }),
    })
    reload()
  }

  async function remove(item: MaterialAnnotation) {
    await request(`/api/material/annotations/${item.id}?expected_revision=${item.revision}`, { method: 'DELETE' })
    reload()
  }

  async function reassign() {
    if (!selection || !reanchorId || !data || !canWrite || savingGuard.current) return
    const item = data.annotations.find((entry) => entry.id === reanchorId)
    if (!item) return
    const captured = selection
    savingGuard.current = true
    setSaving(true)
    setActionError('')
    try {
      await request(`/api/material/${versionId}/annotations/${item.id}/reanchor`, {
        method: 'POST',
        body: JSON.stringify({
          expected_revision: item.revision,
          quote: captured.quote,
          page: captured.page,
          rects: captured.rects,
        }),
      })
      setReanchorId(null)
      if (latest.current.selection === captured) {
        setSelection((current) => (current === captured ? null : current))
        clearSavedBrowserSelection(captured.quote)
      }
      reload()
    } catch (cause) {
      setActionError(extractApiErrorMessage(cause))
    } finally {
      savingGuard.current = false
      setSaving(false)
    }
  }

  return {
    selection,
    setSelection,
    comment,
    setComment,
    reanchorId,
    setReanchorId,
    saving,
    actionError,
    setActionError,
    actionMessage,
    setActionMessage,
    captureSelection,
    add,
    update,
    remove,
    reassign,
  }
}

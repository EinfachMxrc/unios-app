// SPDX-License-Identifier: AGPL-3.0-or-later

import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Trash2 } from 'lucide-react'
import { useT } from '@/i18n/useT'
import { extractApiErrorMessage } from '@/hooks/useApiMutation'
import { restoreFromTrash, type TrashKind } from '@/lib/trash'
import './TrashUndo.css'

export type Trashed = { kind: TrashKind; id: string; title: string }

/** Says what just went to the trash and offers to take it back right here. */
export function TrashUndo({
  item,
  onRestored,
  onDismiss,
}: {
  item: Trashed
  onRestored: (item: Trashed) => void
  onDismiss: () => void
}) {
  const { t } = useT('trash')
  const [busy, setBusy] = useState(false)
  const [failure, setFailure] = useState('')
  async function undo() {
    setBusy(true)
    setFailure('')
    try {
      await restoreFromTrash(item.kind, item.id)
      onRestored(item)
    } catch (cause) {
      setFailure(t('failed', { reason: extractApiErrorMessage(cause) }))
      setBusy(false)
    }
  }
  return (
    <div className="trash-undo" role="status">
      <Trash2 size={16} aria-hidden="true" />
      <span>{failure || t('movedToTrash', { title: item.title })}</span>
      <button type="button" className="trash-undo-action" disabled={busy} onClick={() => void undo()}>
        {t('undo')}
      </button>
      <Link className="trash-undo-link" to="/trash" onClick={onDismiss}>
        {t('openTrash')}
      </Link>
    </div>
  )
}

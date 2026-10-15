// SPDX-License-Identifier: AGPL-3.0-or-later

import { useState } from 'react'
import { useT } from '@/i18n/useT'
import { Dialog, DialogContent, DialogDescription, DialogTitle } from './StudioDialog'
import { useStudyDialogEscape } from './useStudyDialogEscape'
import { emptyWritingGrid, type WritingGrid as Rows } from './writingGridModel'
import { WritingGrid } from './WritingGrid'
import { studyFence } from './studyModels'
import './StudyInsert.css'

export default function WritingGridDialog({
  initialRows,
  onApply,
  onClose,
}: {
  initialRows?: Rows
  onApply: (markdown: string) => void
  onClose: () => void
}) {
  const { t } = useT('notes')
  const [rows, setRows] = useState(initialRows ?? emptyWritingGrid)
  const content = useStudyDialogEscape(onClose)
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onClose()
      }}
    >
      <DialogContent
        ref={content}
        className="studio-dialog study-insert-dialog"
        onOpenAutoFocus={(event) => {
          event.preventDefault()
          content.current?.querySelector<HTMLInputElement>('[data-grid-cell="0"]')?.focus()
        }}
      >
        <DialogTitle>{t('grid.title')}</DialogTitle>
        <DialogDescription>{t('grid.description')}</DialogDescription>
        <WritingGrid rows={rows} onChange={setRows} />
        <div className="study-insert-actions">
          <button type="button" onClick={onClose}>
            {t('cancelButton')}
          </button>
          <button
            type="button"
            className="primary-button"
            onClick={() => onApply(studyFence('grid', JSON.stringify(rows)))}
          >
            {t('grid.apply')}
          </button>
        </div>
      </DialogContent>
    </Dialog>
  )
}

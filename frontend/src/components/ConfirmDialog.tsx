// SPDX-License-Identifier: AGPL-3.0-or-later

import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/editor/StudioDialog'
import { Button } from '@/components/ui/button'
import './ConfirmDialog.css'

/**
 * Asks once before something that cannot be undone. The safe choice has focus,
 * so Enter right away does nothing harmful.
 */
export function ConfirmDialog({
  title,
  text,
  confirm,
  cancel,
  busy = false,
  onConfirm,
  onCancel,
}: {
  title: string
  text: string
  confirm: string
  cancel: string
  busy?: boolean
  onConfirm: () => void
  onCancel: () => void
}) {
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open && !busy) onCancel()
      }}
    >
      <DialogContent className="confirm-dialog" role="alertdialog">
        <DialogTitle>{title}</DialogTitle>
        <DialogDescription>{text}</DialogDescription>
        <div className="confirm-dialog-actions">
          <Button variant="outline" autoFocus disabled={busy} onClick={onCancel}>
            {cancel}
          </Button>
          <Button variant="destructive" disabled={busy} onClick={onConfirm}>
            {confirm}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}

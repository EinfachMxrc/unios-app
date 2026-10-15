// SPDX-License-Identifier: AGPL-3.0-or-later

import { useState } from 'react'
import { useT } from '@/i18n/useT'
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/editor/StudioDialog'
import './ProofImageButton.css'

/**
 * Shows a stored exam-page proof inside the app. It used to be a link that
 * the desktop app handed to the system browser.
 */
export function ProofImageButton({ proofId, label, takenAt }: { proofId: string; label: string; takenAt?: string }) {
  const { t } = useT('grades')
  const [open, setOpen] = useState(false)
  return (
    <>
      <button type="button" className="subtle-link proof-image-button" onClick={() => setOpen(true)}>
        {label}
      </button>
      {open && (
        <Dialog open onOpenChange={setOpen}>
          <DialogContent className="proof-image-dialog">
            <DialogTitle>{t('proofRowLabel')}</DialogTitle>
            {takenAt ? (
              <DialogDescription>{takenAt}</DialogDescription>
            ) : (
              <DialogDescription className="sr-only">{label}</DialogDescription>
            )}
            <div className="proof-image-frame">
              <img src={`/api/primuss/proofs/${encodeURIComponent(proofId)}`} alt={t('proofRowLabel')} />
            </div>
          </DialogContent>
        </Dialog>
      )}
    </>
  )
}

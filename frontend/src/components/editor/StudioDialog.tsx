// SPDX-License-Identifier: AGPL-3.0-or-later

import { Dialog as Primitive } from 'radix-ui'
import { X } from 'lucide-react'
import type { ComponentProps } from 'react'
import { useT } from '@/i18n/useT'
import './StudioDialog.css'

export const Dialog = Primitive.Root
export const DialogTitle = Primitive.Title
export const DialogDescription = Primitive.Description
export function DialogContent({ children, className, ...props }: ComponentProps<typeof Primitive.Content>) {
  const { t } = useT('notes')
  return (
    <Primitive.Portal>
      <Primitive.Overlay className="command-overlay studio-floating-overlay" />
      <Primitive.Content {...props} className={`command-dialog studio-floating-dialog ${className ?? ''}`}>
        {children}
        <Primitive.Close aria-label={t('closeButton')} className="studio-dialog-close">
          <X size={17} />
        </Primitive.Close>
      </Primitive.Content>
    </Primitive.Portal>
  )
}

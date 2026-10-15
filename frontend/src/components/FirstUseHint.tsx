// SPDX-License-Identifier: AGPL-3.0-or-later
import { useState } from 'react'
import { X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useT } from '@/i18n/useT'
export function FirstUseHint({ name, message }: { name: string; message: string }) {
  const key = `unios-hint:${name}:v1`
  const { t } = useT('quality')
  const [hidden, setHidden] = useState(() => {
    try {
      return localStorage.getItem(key) === 'dismissed'
    } catch {
      return false
    }
  })
  if (hidden) return null
  return (
    <aside className="first-use-hint">
      <p>{message}</p>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        aria-label={t('dismissHint')}
        onClick={() => {
          setHidden(true)
          try {
            localStorage.setItem(key, 'dismissed')
          } catch {
            /* Optional hint preference. */
          }
        }}
      >
        <X size={16} />
      </Button>
    </aside>
  )
}

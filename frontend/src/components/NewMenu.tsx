// SPDX-License-Identifier: AGPL-3.0-or-later

import { DropdownMenu } from 'radix-ui'
import { FileText, Mic, Plus, StickyNote, Upload } from 'lucide-react'
import { Link } from 'react-router-dom'
import { useT } from '@/i18n/useT'
import { usePreferences } from '@/preferences'
import { Button } from '@/components/ui/button'
import { beginNewFreeNote } from '@/lib/sourceNoteSave'
export function NewMenu() {
  const { t } = useT('shell')
  const preferences = usePreferences()
  const items = [
    { to: '/notes?new=1', label: t('newNote'), icon: FileText },
    { to: '/jots', label: t('quickNotes'), icon: StickyNote },
    ...(preferences.modules.courses ? [{ to: '/drop', label: t('newFile'), icon: Upload }] : []),
    { to: '/voice', label: t('voiceNotes'), icon: Mic },
  ]
  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger asChild>
        <Button variant="outline" className="new-menu-trigger" aria-label={t('new')}>
          <Plus size={17} />
          <span>{t('new')}</span>
        </Button>
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content className="new-menu" align="end" sideOffset={8} aria-label={t('new')}>
          {items.map(({ to, label, icon: Icon }) => (
            <DropdownMenu.Item asChild key={to}>
              <Link to={to} className="new-menu-item" onClick={() => { if (to === '/notes?new=1') beginNewFreeNote() }}>
                <Icon size={17} />
                {label}
              </Link>
            </DropdownMenu.Item>
          ))}
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  )
}

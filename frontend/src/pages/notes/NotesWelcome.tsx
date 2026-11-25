// SPDX-License-Identifier: AGPL-3.0-or-later

import { Plus } from 'lucide-react'
import { localDate } from '@/api'
import { CourseChip } from '@/components/CourseChip'
import { UliBuddy } from '@/components/UliBuddy'
import { Button } from '@/components/ui/button'
import { useT } from '@/i18n/useT'
import type { NotesResponse } from '@/types'
import './NotesWelcome.css'

type Note = NotesResponse['notes'][number]
const SHOWN = 6

export const recentlyEdited = (notes: readonly Note[]) =>
  [...notes].sort((a, b) => b.updated_at.localeCompare(a.updated_at)).slice(0, SHOWN)

/** With no page open: carry on where you left off, or start a new page. */
export function NotesWelcome({
  notes,
  canWrite,
  onChoose,
  onNew,
}: {
  notes: readonly Note[]
  canWrite: boolean
  onChoose: (id: string) => void
  onNew: () => void
}) {
  const { t } = useT('notes')
  const recent = recentlyEdited(notes)
  return (
    <div className={`note-canvas note-welcome ${recent.length ? 'has-recent' : ''}`}>
      <header>
        <UliBuddy mood="awake" size={recent.length ? 44 : 72} />
        <div>
          <h2>{t('welcomeTitle')}</h2>
          <p>{t('welcomeText')}</p>
        </div>
        {canWrite && (
          <Button variant="outline" onClick={onNew}>
            <Plus size={16} /> {t('newNoteButton')}
          </Button>
        )}
      </header>
      {recent.length > 0 && (
        <section aria-labelledby="notes-continue">
          <h3 id="notes-continue">{t('continueWriting')}</h3>
          <ul>
            {recent.map((note) => (
              <li key={note.id}>
                <button type="button" className="note-card" onClick={() => onChoose(note.id)}>
                  <strong>{note.title}</strong>
                  <time dateTime={note.updated_at}>{localDate(note.updated_at)}</time>
                </button>
                <CourseChip id={note.course_id} name={note.course_name} />
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  )
}

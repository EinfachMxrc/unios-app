// SPDX-License-Identifier: AGPL-3.0-or-later

/*
 * Presentational pieces of the command palette: highlighted labels, one icon
 * per kind of search hit, and the keyboard footer. CommandPalette keeps the
 * state and the commands.
 */
import { FileText, Highlighter, Inbox, Megaphone, NotebookPen, NotebookText, StickyNote, type LucideIcon } from 'lucide-react'
import { activeIntlLocale } from '@/api'
import { useT } from '@/i18n/useT'
import type { CommandPaletteHitKind } from './commandPaletteHits'
import { highlightSegments } from './paletteHighlight'

/** Key caps are symbols, not words, so they stay the same in every language. */
export const KEYS = { up: '↑', down: '↓', enter: '↵', escape: 'esc' } as const

export const HIT_ICONS: Record<CommandPaletteHitKind, LucideIcon> = {
  document: FileText,
  annotation: Highlighter,
  announcement: Megaphone,
  course_note: NotebookText,
  note: NotebookPen,
  jot: StickyNote,
  clip: Inbox,
}

/** The label with the typed words marked, so every result shows why it matched. */
export function Highlighted({ text, query }: { text: string; query: string }) {
  return highlightSegments(text, query, activeIntlLocale()).map((segment, index) =>
    segment.match ? <mark key={index} className="command-mark">{segment.text}</mark> : <span key={index}>{segment.text}</span>,
  )
}

/** The row Enter would run carries this hint, so the default action is never a guess. */
export function EnterHint() {
  return <kbd className="command-enter" aria-hidden="true">{KEYS.enter}</kbd>
}

/** Keys that work inside the palette, plus the app-wide shortcuts behind a disclosure. */
export function PaletteFooter({ status }: { status?: string }) {
  const { t } = useT('commandPalette')
  return (
    <div className="command-footer">
      <span><kbd>{KEYS.up}</kbd><kbd>{KEYS.down}</kbd> {t('footerNavigate')}</span>
      <span><kbd>{KEYS.enter}</kbd> {t('footerOpen')}</span>
      <span><kbd>{KEYS.escape}</kbd> {t('footerClose')}</span>
      {status && <span className="command-footer-status" role="status">{status}</span>}
      <details className="command-shortcuts">
        <summary>{t('moreShortcuts')}</summary>
        <p>{t('keyboardHint')}</p>
      </details>
    </div>
  )
}

/** The type chips: one kind at a time, like a segmented control; "all" clears it. */
export const HIT_FILTERS = {
  documents: ['document'],
  annotations: ['annotation'],
  notes: ['note', 'course_note'],
  forum: ['announcement'],
  captures: ['jot', 'clip'],
} as const satisfies Record<string, readonly CommandPaletteHitKind[]>
export type HitFilter = keyof typeof HIT_FILTERS

const FILTER_LABELS = {
  documents: 'filterDocuments',
  annotations: 'filterAnnotations',
  notes: 'filterNotes',
  forum: 'filterForum',
  captures: 'filterCaptures',
} as const

/** Narrows the search hits by kind and course; Tab reaches it from the search field. */
export function HitFilters({ kind, onKind, course, onCourse, courses }: {
  kind: HitFilter | null
  onKind: (kind: HitFilter | null) => void
  course: string
  onCourse: (course: string) => void
  courses: string[]
}) {
  const { t } = useT('commandPalette')
  return (
    <div className="command-filters" role="group" aria-label={t('filterLabel')}>
      <button type="button" aria-pressed={kind === null} onClick={() => onKind(null)}>{t('filterAll')}</button>
      {(Object.keys(HIT_FILTERS) as HitFilter[]).map((key) => (
        <button type="button" key={key} aria-pressed={kind === key} onClick={() => onKind(kind === key ? null : key)}>
          {t(FILTER_LABELS[key])}
        </button>
      ))}
      {courses.length > 0 && (
        <select className="native-select" aria-label={t('courseFilterLabel')} value={course} onChange={(event) => onCourse(event.target.value)}>
          <option value="">{t('allCourses')}</option>
          {courses.map((name) => <option key={name} value={name}>{name}</option>)}
        </select>
      )}
    </div>
  )
}

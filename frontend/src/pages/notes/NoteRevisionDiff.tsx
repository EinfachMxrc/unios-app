// SPDX-License-Identifier: AGPL-3.0-or-later

import { useMemo } from 'react'
import { docFromApi, inlineText, type NoteBlock } from '@/editor/doc'
import { useT } from '@/i18n/useT'
import { useNoteDetail } from '@/lib/noteBody'
import type { NoteDetail } from '@/types'

type Change = { id: string; kind: 'added' | 'removed' | 'changed'; before: string; after: string }

function flat(blocks: NoteBlock[]): NoteBlock[] {
  return blocks.flatMap((block) => [block, ...flat(block.children)])
}
const textOf = (block: NoteBlock) =>
  inlineText(block.content) || String(block.props.label ?? block.props.latex ?? block.props.alt ?? block.type)

/** What the current version changed compared with an older one, matched by stable block ids. */
export function revisionChanges(older: NoteDetail, current: NoteDetail): Change[] {
  const before = new Map(flat(docFromApi(older.document).blocks).map((block) => [block.id, block]))
  const after = new Map(flat(docFromApi(current.document).blocks).map((block) => [block.id, block]))
  const changes: Change[] = []
  for (const [id, block] of after) {
    const previous = before.get(id)
    if (!previous) changes.push({ id, kind: 'added', before: '', after: textOf(block) })
    else if (
      JSON.stringify([previous.type, previous.props, previous.content]) !==
      JSON.stringify([block.type, block.props, block.content])
    )
      changes.push({ id, kind: 'changed', before: textOf(previous), after: textOf(block) })
  }
  for (const [id, block] of before)
    if (!after.has(id)) changes.push({ id, kind: 'removed', before: textOf(block), after: '' })
  return changes
}

/** Shown beside an old version: block by block, what happened since. */
export function NoteRevisionDiff({ older }: { older: NoteDetail }) {
  const { t } = useT('notes')
  const { data: current } = useNoteDetail(`/api/notes/${older.note.id}`)
  const changes = useMemo(() => (current ? revisionChanges(older, current) : []), [older, current])
  if (!current) return null
  return (
    <section className="note-revision-diff">
      <h3>{t('diffTitle', { revision: older.selected_revision })}</h3>
      {changes.length === 0 ? (
        <p className="muted-text">{t('diffNone')}</p>
      ) : (
        <ul>
          {changes.map((change) => (
            <li key={change.id} data-kind={change.kind}>
              <strong>{t(`diff_${change.kind}`)}</strong>
              {change.before && <del>{change.before}</del>}
              {change.after && <ins>{change.after}</ins>}
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}

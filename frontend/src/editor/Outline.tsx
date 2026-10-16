// SPDX-License-Identifier: AGPL-3.0-or-later

import type { Editor } from '@tiptap/core'
import { useMemo } from 'react'
import { useT } from '@/i18n/useT'

/** Headings of the page; selecting one moves the caret there. */
export function Outline({ editor, version }: { editor: Editor; version: number }) {
  const { t } = useT('editor')
  const headings = useMemo(() => {
    const found: { pos: number; level: number; text: string }[] = []
    editor.state.doc.descendants((node, pos) => {
      if (node.type.name === 'heading' && node.textContent.trim())
        found.push({ pos, level: Number(node.attrs.level) || 1, text: node.textContent })
    })
    return found
    // `version` re-reads the headings after each edit.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editor, version])
  return (
    <nav className="note-outline" aria-label={t('outline')}>
      {headings.length ? (
        <ol>
          {headings.map((heading) => (
            <li key={heading.pos} data-level={heading.level}>
              <button
                type="button"
                onClick={() => {
                  editor
                    .chain()
                    .focus()
                    .setTextSelection(heading.pos + 1)
                    .scrollIntoView()
                    .run()
                }}
              >
                {heading.text}
              </button>
            </li>
          ))}
        </ol>
      ) : (
        <p>{t('outlineEmpty')}</p>
      )}
    </nav>
  )
}

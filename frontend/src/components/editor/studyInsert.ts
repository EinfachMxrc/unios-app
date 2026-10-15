// SPDX-License-Identifier: AGPL-3.0-or-later

import type { Editor } from '@tiptap/core'

/** Leave a writing paragraph after a helper, rather than a caret in its last cell. */
export function insertStudyMarkdown(editor: Editor, markdown: string, range: { from: number; to: number }): boolean {
  if (editor.isDestroyed || !editor.markdown) return false
  const content = editor.markdown.parse(markdown).content ?? []
  if (!content.length) return false
  return editor
    .chain()
    .focus()
    .insertContentAt(range, [...content, { type: 'paragraph' }])
    .run()
}

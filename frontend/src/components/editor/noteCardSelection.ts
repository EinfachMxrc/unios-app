// SPDX-License-Identifier: AGPL-3.0-or-later
import { getTextBetween, getTextSerializersFromSchema, type Editor } from '@tiptap/core'

/** Preserve formulas and reference labels instead of silently skipping atom blocks. */
export function noteCardSelection(editor: Editor) {
  return getTextBetween(editor.state.doc, editor.state.selection, {
    blockSeparator: '\n',
    textSerializers: {
      wikiLink: ({ node }) => `[[${String(node.attrs.title ?? '')}]]`,
      entity: ({ node }) => String(node.attrs.label || node.attrs.id || ''),
      media: ({ node }) => String(node.attrs.alt || ''),
      image: ({ node }) => String(node.attrs.alt || ''),
      rawMarkdown: ({ node }) => String(node.attrs.raw || ''),
      ...getTextSerializersFromSchema(editor.schema),
    },
  }).trim()
}

// SPDX-License-Identifier: AGPL-3.0-or-later

import { useMemo } from 'react'
import { markdownToBody } from './markdownImport'
import { NoteView } from './NoteView'

/** Read-only view of Markdown text that is not a stored note: previews and Moodle pages. */
export function MarkdownView({ markdown }: { markdown: string }) {
  const body = useMemo(() => markdownToBody(markdown), [markdown])
  return <NoteView body={body} />
}

export default MarkdownView

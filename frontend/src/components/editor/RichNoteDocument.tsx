// SPDX-License-Identifier: AGPL-3.0-or-later

import type { NotesResponse } from '@/types'
import { EditorContent, useEditor } from '@tiptap/react'
import { useEffect, useMemo, useRef } from 'react'
import { editorExtensions } from './extensions'
import { NoteLinkTargetsContext, useNoteLinkTargets } from '@/hooks/useNoteLinks'
import { internalNoteHref } from '@/lib/noteLinks'
import { useNavigate } from 'react-router-dom'
import '@fontsource/fira-code/400.css'
import './NoteStudio.css'

type Notes = NotesResponse['notes']

export function NoteMarkdownDocument({ body }: { body: string; notes: Notes }) {
  const appliedBody = useRef(body)
  const navigate = useNavigate()
  const targets = useNoteLinkTargets(body)
  const extensions = useMemo(() => editorExtensions(), [])
  const editor = useEditor({
    extensions,
    content: body,
    contentType: 'markdown',
    editable: false,
    editorProps: { attributes: { class: 'studio-readonly' } },
  })
  useEffect(() => {
    // A restored draft can replace this reader during the same effect flush.
    // Do not use the command manager of an instance already torn down by Tiptap.
    // Initial content is already supplied to useEditor. Replacing it again
    // tears down wiki-link views, losing a hover/focus entered during hydration.
    if (editor && !editor.isDestroyed && appliedBody.current !== body) {
      editor.commands.setContent(body, { contentType: 'markdown', emitUpdate: false })
      appliedBody.current = body
    }
  }, [body, editor])
  return (
    <div
      className="rendered-note"
      onClick={(event) => {
        if (
          event.defaultPrevented ||
          event.button !== 0 ||
          event.metaKey ||
          event.ctrlKey ||
          event.altKey ||
          event.shiftKey ||
          !(event.target instanceof Element)
        )
          return
        const link = event.target.closest('a[href]')
        const href = internalNoteHref(link?.getAttribute('href') ?? null)
        if (!href || link?.hasAttribute('download')) return
        event.preventDefault()
        navigate(href)
      }}
    >
      <NoteLinkTargetsContext.Provider value={targets}>
        <EditorContent editor={editor?.isDestroyed ? null : editor} />
      </NoteLinkTargetsContext.Provider>
    </div>
  )
}

export default NoteMarkdownDocument

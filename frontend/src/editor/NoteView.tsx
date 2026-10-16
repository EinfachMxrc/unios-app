// SPDX-License-Identifier: AGPL-3.0-or-later

import { EditorContent, useEditor } from '@tiptap/react'
import { useEffect, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { internalNoteHref } from '@/lib/noteLinks'
import { NoteLinkTargetsContext, useNoteLinkTargets } from '@/hooks/useNoteLinks'
import { useT } from '@/i18n/useT'
import { docText, parseBody } from './doc'
import { editorExtensions } from './extensions'
import { docToPm } from './pmConvert'
import './editor.css'

/** Read-only rendering with exactly the same blocks as the editor. */
export function NoteView({ body }: { body: string }) {
  const { t } = useT('editor')
  const doc = useMemo(() => parseBody(body), [body])
  const targets = useNoteLinkTargets(useMemo(() => docText(doc), [doc]))
  const extensions = useMemo(
    () =>
      editorExtensions(
        '',
        () => undefined,
        (text) => t('checkItem', { text }),
      ),
    [t],
  )
  const editor = useEditor({
    extensions,
    content: docToPm(doc),
    editable: false,
    editorProps: { attributes: { class: 'note-document note-document-readonly', 'aria-label': t('contentLabel') } },
  })
  useEffect(() => {
    if (editor && !editor.isDestroyed) editor.commands.setContent(docToPm(doc), { emitUpdate: false })
  }, [editor, doc])
  const navigate = useNavigate()
  if (!editor) return null
  return (
    <div
      className="note-editor note-editor-readonly rendered-note"
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
        // Links inside UniOS move within the app instead of reloading it.
        event.preventDefault()
        navigate(href)
      }}
    >
      <NoteLinkTargetsContext.Provider value={targets}>
        <EditorContent editor={editor} />
      </NoteLinkTargetsContext.Provider>
    </div>
  )
}

export default NoteView

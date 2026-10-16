// SPDX-License-Identifier: AGPL-3.0-or-later

import { TextSelection } from '@tiptap/pm/state'
import { EditorContent, useEditor, type Editor } from '@tiptap/react'
import { Focus, ListTree, Plus, Redo2, Undo2 } from 'lucide-react'
import { DropdownMenu } from 'radix-ui'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import '@fontsource/fira-code/400.css'
import { NoteSelectionCardDialog } from '@/components/NoteSelectionCardDialog'
import { NoteLinkTargetsContext, useNoteLinkTargets } from '@/hooks/useNoteLinks'
import { useT } from '@/i18n/useT'
import { rememberWorkspace, useWorkspaceState, workspaceValue } from '@/lib/workspaceState'
import type { NoteCardContext } from '@/noteCardTypes'
import { BlockHandle } from './BlockHandle'
import { blockCommands, topBlockAt, type DialogOptions, type InsertDialog, type Range } from './commands'
import { docText, parseBody, serializeDoc } from './doc'
import { editorExtensions } from './extensions'
import { InsertDialogs, type OpenDialog } from './InsertDialogs'
import { InsertMenu } from './InsertMenu'
import { Outline } from './Outline'
import { docToPm, pmToDoc, type PmNode } from './pmConvert'
import { selectionText } from './selectionText'
import { SelectionToolbar } from './SelectionToolbar'
import './editor.css'

type CursorRange = { from: number; to: number }

function savedCursor(workspaceKey: string): CursorRange {
  return workspaceValue(
    `editor:${workspaceKey}:cursor`,
    { from: 1, to: 1 },
    {
      persist: false,
      valid: (value): value is CursorRange =>
        !!value &&
        typeof value === 'object' &&
        Number.isFinite((value as CursorRange).from) &&
        Number.isFinite((value as CursorRange).to),
    },
  )
}

/** Clamp to the current document, which may be shorter than when the cursor was saved. */
function placeSelection(editor: Editor, range: CursorRange) {
  const end = editor.state.doc.content.size
  editor.commands.setTextSelection({
    from: Math.max(0, Math.min(end, range.from)),
    to: Math.max(0, Math.min(end, range.to)),
  })
}

export type NoteEditorProps = {
  id: string
  workspaceKey?: string
  /** The note body in its draft form (see `serializeDoc`). */
  value: string
  onChange: (value: string) => void
  cardSource?: Omit<NoteCardContext, 'quote'>
  canCreateCard?: boolean
}

export function NoteEditor({
  id,
  workspaceKey = id,
  value,
  onChange,
  cardSource,
  canCreateCard = false,
}: NoteEditorProps) {
  const { t } = useT('editor')
  const [focused, setFocused] = useWorkspaceState(`editor:${workspaceKey}:focus`, false)
  const [outline, setOutline] = useWorkspaceState(`editor:${workspaceKey}:outline`, false)
  const [dialog, setDialog] = useState<OpenDialog>(null)
  const [cardContext, setCardContext] = useState<NoteCardContext | null>(null)
  const [feedback, setFeedback] = useState('')
  const [version, setVersion] = useState(0)
  const callback = useRef(onChange)
  callback.current = onChange
  const lastEmitted = useRef(value)
  const restoredEditor = useRef<unknown>(null)
  // Set by real pointer or key input only: focus alone is not a choice of caret position.
  const userPlacedCaret = useRef(false)
  const shortcuts = useRef<(event: KeyboardEvent) => boolean>(() => false)
  const uploadRef = useRef<((file: File, range?: Range) => void) | null>(null)
  const linkText = useMemo(() => docText(parseBody(value)), [value])
  const targets = useNoteLinkTargets(linkText)

  const extensions = useMemo(
    () =>
      editorExtensions(
        t('placeholder'),
        () => setFeedback(t('tooLong')),
        (text) => t('checkItem', { text }),
      ),
    [t],
  )
  const editor = useEditor({
    extensions,
    content: docToPm(parseBody(value)),
    editorProps: {
      attributes: {
        id,
        role: 'textbox',
        'aria-label': t('contentLabel'),
        'aria-multiline': 'true',
        class: 'note-prose',
        spellcheck: 'true',
      },
      handleKeyDown: (_view, event) => {
        userPlacedCaret.current = true
        return shortcuts.current(event)
      },
      handleDOMEvents: {
        mousedown: () => {
          userPlacedCaret.current = true
          return false
        },
        touchstart: () => {
          userPlacedCaret.current = true
          return false
        },
      },
      handlePaste: (_view, event) => {
        const file = event.clipboardData?.files[0]
        if (!file) return false
        event.preventDefault()
        uploadRef.current?.(file)
        return true
      },
      handleDrop: (view, event) => {
        const file = event.dataTransfer?.files[0]
        if (!file) return false
        event.preventDefault()
        const at = view.posAtCoords({ left: event.clientX, top: event.clientY })?.pos ?? view.state.selection.from
        uploadRef.current?.(file, { from: at, to: at })
        return true
      },
    },
    onUpdate({ editor: updated }) {
      const next = serializeDoc(pmToDoc(updated.getJSON() as PmNode))
      setVersion((n) => n + 1)
      // Structure-only transactions (folding a toggle) must not look like an edit.
      if (next === lastEmitted.current) return
      lastEmitted.current = next
      callback.current(next)
    },
    onBlur: ({ editor: current }) => {
      if (restoredEditor.current !== current || current.isDestroyed) return
      const selection = window.getSelection()
      const dom = current.view.dom
      if (
        selection?.anchorNode &&
        selection.focusNode &&
        dom.contains(selection.anchorNode) &&
        dom.contains(selection.focusNode)
      ) {
        const anchor = current.view.posAtDOM(selection.anchorNode, selection.anchorOffset)
        const focus = current.view.posAtDOM(selection.focusNode, selection.focusOffset)
        rememberWorkspace(
          `editor:${workspaceKey}:cursor`,
          { from: Math.min(anchor, focus), to: Math.max(anchor, focus) },
          false,
        )
      }
    },
    onSelectionUpdate: ({ editor: current }) => {
      if (restoredEditor.current === current && current.isFocused)
        rememberWorkspace(
          `editor:${workspaceKey}:cursor`,
          { from: current.state.selection.from, to: current.state.selection.to },
          false,
        )
      setVersion((n) => n + 1)
    },
  })

  useEffect(() => {
    if (!editor || editor.isDestroyed || restoredEditor.current === editor) return
    // Let the parent restore its draft before the cursor is restored.
    const frame = requestAnimationFrame(() => {
      if (editor.isDestroyed) return
      if (!userPlacedCaret.current) placeSelection(editor, savedCursor(workspaceKey))
      restoredEditor.current = editor
    })
    return () => cancelAnimationFrame(frame)
  }, [editor, workspaceKey, value])

  useEffect(() => {
    // useEditor may keep its previous instance for one render during teardown.
    if (editor && !editor.isDestroyed && value !== lastEmitted.current) {
      lastEmitted.current = value
      // Replacing the document moves the caret to the end; a draft that arrives after the
      // cursor was restored must not take the caret from where the person returned to.
      const restored = restoredEditor.current === editor
      const keep = restored && !userPlacedCaret.current ? savedCursor(workspaceKey) : editor.state.selection
      editor.commands.setContent(docToPm(parseBody(value)), { emitUpdate: false })
      if (restored) placeSelection(editor, keep)
    }
  }, [editor, value, workspaceKey])

  const openDialog = useCallback(
    (kind: InsertDialog, range: Range, options?: DialogOptions) => setDialog({ kind, range, options }),
    [],
  )
  const closeDialog = useCallback(() => setDialog(null), [])

  shortcuts.current = (event) => {
    if (!editor || editor.isDestroyed || dialog || event.isComposing || event.altKey) return false
    const mod = event.ctrlKey || event.metaKey
    if (mod && (event.key === 'Home' || event.key === 'End')) {
      const target =
        event.key === 'Home' ? TextSelection.atStart(editor.state.doc) : TextSelection.atEnd(editor.state.doc)
      // Model and browser selection move together; a late native selectionchange must not undo it.
      editor.view.dispatch(
        editor.state.tr.setSelection(
          event.shiftKey ? TextSelection.between(editor.state.selection.$anchor, target.$head) : target,
        ),
      )
      return true
    }
    if (mod && event.shiftKey && (event.key.toLowerCase() === 'm' || event.code === 'Space')) {
      const { from, to } = editor.state.selection
      setDialog({ kind: event.code === 'Space' ? 'helper' : 'math-inline', range: { from, to } })
      return true
    }
    return false
  }
  if (!editor) return null
  const canCard = !!cardSource && canCreateCard
  return (
    <div className="note-editor" data-focus={focused} data-outline={outline}>
      <div className="note-editor-bar" role="toolbar" aria-label={t('tools')}>
        <button
          type="button"
          aria-label={t('undo')}
          title={t('undo')}
          disabled={!editor.can().undo()}
          onClick={() => editor.chain().focus().undo().run()}
        >
          <Undo2 size={17} aria-hidden="true" />
        </button>
        <button
          type="button"
          aria-label={t('redo')}
          title={t('redo')}
          disabled={!editor.can().redo()}
          onClick={() => editor.chain().focus().redo().run()}
        >
          <Redo2 size={17} aria-hidden="true" />
        </button>
        <DropdownMenu.Root>
          <DropdownMenu.Trigger asChild>
            <button type="button" className="note-editor-insert">
              <Plus size={17} aria-hidden="true" />
              {t('insertMenu')}
            </button>
          </DropdownMenu.Trigger>
          <DropdownMenu.Portal>
            <DropdownMenu.Content
              className="note-block-menu note-insert-list"
              align="start"
              sideOffset={4}
              // Keep the caret in the note after a choice; the menu must not take focus back to its button.
              onCloseAutoFocus={(event) => {
                event.preventDefault()
                if (!editor.isDestroyed) editor.commands.focus()
              }}
            >
              {blockCommands.map((command) => (
                <DropdownMenu.Item
                  key={command.id}
                  onSelect={() => {
                    // Insert below the current block, in a fresh paragraph the command can take over.
                    const block = topBlockAt(editor, editor.state.selection.from)
                    const { $from } = editor.state.selection
                    const empty = $from.parent.isTextblock && $from.parent.content.size === 0
                    let at = $from.pos
                    if (!empty) {
                      at = (block ? block.pos + block.node.nodeSize : editor.state.doc.content.size) + 1
                      editor
                        .chain()
                        .insertContentAt(at - 1, { type: 'paragraph' })
                        .run()
                    }
                    command.run({ editor, range: { from: at, to: at }, openDialog })
                  }}
                >
                  <command.icon size={16} aria-hidden="true" />
                  {t(command.label)}
                </DropdownMenu.Item>
              ))}
            </DropdownMenu.Content>
          </DropdownMenu.Portal>
        </DropdownMenu.Root>
        <span className="note-editor-bar-space" />
        <button type="button" aria-pressed={outline} onClick={() => setOutline(!outline)}>
          <ListTree size={17} aria-hidden="true" />
          {t('outline')}
        </button>
        <button type="button" aria-pressed={focused} onClick={() => setFocused(!focused)}>
          <Focus size={17} aria-hidden="true" />
          {t('focusMode')}
        </button>
      </div>
      <div className="note-editor-main">
        <div className="note-editor-page">
          <BlockHandle editor={editor} />
          <SelectionToolbar
            editor={editor}
            onCard={
              canCard
                ? () => {
                    const quote = selectionText(editor)
                    if (cardSource && quote) setCardContext({ ...cardSource, quote })
                  }
                : undefined
            }
          />
          <NoteLinkTargetsContext.Provider value={targets}>
            <EditorContent editor={editor} />
          </NoteLinkTargetsContext.Provider>
          <InsertMenu editor={editor} version={version} openDialog={openDialog} />
        </div>
        {outline && <Outline editor={editor} version={version} />}
      </div>
      <footer className="note-editor-footer">
        <span>{t('hint')}</span>
        <span>{t('wordCount', { count: editor.getText().trim().split(/\s+/).filter(Boolean).length })}</span>
      </footer>
      {feedback && (
        <p role="status" className="note-editor-feedback">
          {feedback}
        </p>
      )}
      <InsertDialogs editor={editor} open={dialog} onClose={closeDialog} uploadRef={uploadRef} />
      {cardContext && (
        <NoteSelectionCardDialog
          context={cardContext}
          canWrite={canCreateCard}
          onClose={() => setCardContext(null)}
          onCloseAutoFocus={(event) => {
            event.preventDefault()
            if (!editor.isDestroyed) editor.commands.focus(undefined, { scrollIntoView: false })
          }}
        />
      )}
    </div>
  )
}

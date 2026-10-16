// SPDX-License-Identifier: AGPL-3.0-or-later

import { request, useApi } from '@/api'
import { NoteMarkdownDocument } from '@/components/NoteMarkdownDocument'
import { NoteMarkdownEditor as SourceEditor } from '@/components/NoteMarkdownEditor'
import { useT } from '@/i18n/useT'
import { rememberWorkspace, useWorkspaceState, workspaceValue } from '@/lib/workspaceState'
import { NoteLinkTargetsContext, useNoteLinkTargets, useNoteSuggestions } from '@/hooks/useNoteLinks'
import type { NotesResponse } from '@/types'
import '@fontsource/fira-code/400.css'
import { DragHandle } from '@tiptap/extension-drag-handle-react'
import { TextSelection } from '@tiptap/pm/state'
import { EditorContent, useEditor, type Editor } from '@tiptap/react'
import {
  Bold,
  Highlighter,
  FileText,
  Focus,
  GripVertical,
  Italic,
  Link2,
  ListTree,
  Plus,
  Redo2,
  Sigma,
  Table2,
  Undo2,
  Wrench,
  X,
  BookOpenCheck,
  type LucideIcon,
} from 'lucide-react'
import { lazy, Suspense, useEffect, useMemo, useRef, useState } from 'react'
import { editorExtensions, entityKinds, MAX_NOTE_LENGTH, type EditorEntityKind } from './extensions'
import './NoteStudio.css'
import { makeCommands, popupAt, type Entity, type StudioInsertKind } from './studioCommands'
import { StudioBlockActions, StudioButton, StudioContextBars, StudioOutline } from './StudioChrome'
import { Dialog, DialogContent, DialogDescription, DialogTitle } from './StudioDialog'
import { mathTemplates, type MathTemplate } from './mathTemplates'
import { quickStudyCommand, studyToolKeys } from './studyCommands'
import { insertStudyMarkdown } from './studyInsert'
import { MathTypingGuide } from './MathTypingGuide'
import { MarkdownTypingGuide } from './MarkdownTypingGuide'
import { NoteSelectionCardDialog } from '@/components/NoteSelectionCardDialog'
import type { NoteCardContext } from '@/noteCardTypes'
import { noteCardSelection } from './noteCardSelection'
import type { StudyTool } from './StudyHelperDialog'
const WritingGridDialog = lazy(() => import('./WritingGridDialog'))
const MathEntryDialog = lazy(() => import('./MathEntryDialog'))
const TruthTableDialog = lazy(() => import('./TruthTableDialog'))
const StudyHelperDialog = lazy(() => import('./StudyHelperDialog'))
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

export function NoteStudio({
  id,
  workspaceKey = id,
  value,
  onChange,
  notes,
  cardSource,
  canCreateCard = false,
}: {
  id: string
  workspaceKey?: string
  value: string
  onChange: (value: string) => void
  notes: NotesResponse['notes']
  cardSource?: Omit<NoteCardContext, 'quote'>
  canCreateCard?: boolean
}) {
  const { t } = useT('notes')
  const { t: cards } = useT('noteCards')
  const [cardContext, setCardContext] = useState<NoteCardContext | null>(null)
  const [sourceQuote, setSourceQuote] = useState('')
  const targets = useNoteLinkTargets(value)
  const [mode, setMode] = useWorkspaceState<'visual' | 'source' | 'preview'>(`editor:${workspaceKey}:mode`, 'visual')
  const [focused, setFocused] = useWorkspaceState(`editor:${workspaceKey}:focus`, false)
  const [outline, setOutline] = useWorkspaceState(`editor:${workspaceKey}:outline`, false)
  const [menu, setMenu] = useState(false)
  const [filter, setFilter] = useState('')
  const [dismissed, setDismissed] = useState(false)
  const [choice, setChoice] = useState(0)
  const [dialog, setDialog] = useState<StudioInsertKind | 'link' | null>(null)
  const [toolBase, setToolBase] = useState(2)
  const [truthView, setTruthView] = useState<'table' | 'forms' | 'kv'>('table')
  const [entityKind, setEntityKind] = useState<EditorEntityKind>('note')
  const [entityQuery, setEntityQuery] = useState('')
  const [debouncedQuery, setDebouncedQuery] = useState('')
  const [link, setLink] = useState('')
  const [mediaCaption, setMediaCaption] = useState('')
  const [uploading, setUploading] = useState(false)
  const [feedback, setFeedback] = useState('')
  const [, render] = useState(0)
  const callback = useRef(onChange)
  callback.current = onChange
  const lastEmitted = useRef(value)
  const uploadController = useRef<AbortController | null>(null)
  const keyboard = useRef<(event: KeyboardEvent) => boolean>(() => false)
  const restoredEditor = useRef<unknown>(null)
  // Set by real pointer or key input only. Focus alone is not a choice: going back
  // restores keyboard focus to the editor before the saved caret is applied.
  const userPlacedCaret = useRef(false)
  const insertPosition = useRef<{ from: number; to: number } | null>(null)
  const studioRoot = useRef<HTMLDivElement>(null)
  const modeFocusFrame = useRef<number | null>(null)
  const sourceSelection = useRef({ from: value.length, to: value.length })
  const extensions = useMemo(
    () =>
      editorExtensions(
        t('studio.placeholder'),
        () => setFeedback(t('studio.tooLong')),
        (text) => t('studio.checkItem', { text }),
      ),
    [t],
  )
  const editor = useEditor({
    extensions,
    content: value,
    contentType: 'markdown',
    editorProps: {
      attributes: {
        id,
        role: 'textbox',
        'aria-label': t('noteContentAria'),
        'aria-multiline': 'true',
        class: 'studio-document',
        spellcheck: 'true',
      },
      handleKeyDown: (_view, event) => {
        userPlacedCaret.current = true
        return keyboard.current(event)
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
        void uploadMedia(file)
        return true
      },
    },
    onUpdate({ editor: updated }) {
      const next = updated.getMarkdown()
      if (next.length > MAX_NOTE_LENGTH) {
        setFeedback(t('studio.tooLong'))
        return
      }
      lastEmitted.current = next
      callback.current(next)
      setDismissed(false)
      setChoice(0)
      render((n) => n + 1)
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
      render((n) => n + 1)
    },
    onTransaction: () => render((n) => n + 1),
  })
  useEffect(() => {
    if (!editor || editor.isDestroyed || restoredEditor.current === editor) return
    // Let the parent restore its draft and setContent before restoring a cursor.
    const frame = requestAnimationFrame(() => {
      if (editor.isDestroyed) return
      // An early click or keystroke already chose a live caret. Restoring a
      // saved cursor after that would move the user's next edit elsewhere.
      if (userPlacedCaret.current) {
        restoredEditor.current = editor
        return
      }
      placeSelection(editor, savedCursor(workspaceKey))
      restoredEditor.current = editor
    })
    return () => cancelAnimationFrame(frame)
  }, [editor, workspaceKey, value])
  useEffect(() => {
    // useEditor may retain its previous instance for one render during teardown.
    // Tiptap destroys its command manager along with the view.
    if (editor && !editor.isDestroyed && value !== lastEmitted.current) {
      lastEmitted.current = value
      // Replacing the document drops the selection to its end. A draft or refetch that
      // lands after the cursor was restored must not move the caret the user returned to.
      const restored = restoredEditor.current === editor
      const keep = restored && !userPlacedCaret.current ? savedCursor(workspaceKey) : editor.state.selection
      editor.commands.setContent(value, { contentType: 'markdown', emitUpdate: false })
      if (restored) placeSelection(editor, keep)
    }
  }, [editor, value, workspaceKey])
  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedQuery(entityQuery.trim()), 250)
    return () => window.clearTimeout(timer)
  }, [entityQuery])
  useEffect(() => () => uploadController.current?.abort(), [])
  useEffect(
    () => () => {
      if (modeFocusFrame.current !== null) cancelAnimationFrame(modeFocusFrame.current)
    },
    [],
  )
  function changeMode(next: typeof mode) {
    const source = studioRoot.current?.querySelector<HTMLTextAreaElement>('.note-textarea')
    if (source) sourceSelection.current = { from: source.selectionStart, to: source.selectionEnd }
    setMode(next)
    setMenu(false)
    if (modeFocusFrame.current !== null) cancelAnimationFrame(modeFocusFrame.current)
    // Restore typing only after an explicit mode click, never on opening a note.
    modeFocusFrame.current = requestAnimationFrame(() => {
      modeFocusFrame.current = null
      // Someone who already clicked or selected in the new view keeps that; restoring the
      // old caret a frame later would turn "select all, then type" into an append.
      if (next === 'visual' && editor && !editor.isDestroyed && !editor.isFocused)
        editor.commands.focus(undefined, { scrollIntoView: false })
      if (next === 'source') {
        const field = studioRoot.current?.querySelector<HTMLTextAreaElement>('.note-textarea')
        if (field && document.activeElement !== field) {
          field.focus({ preventScroll: true })
          field.setSelectionRange(
            Math.min(sourceSelection.current.from, field.value.length),
            Math.min(sourceSelection.current.to, field.value.length),
          )
        }
      }
    })
  }
  const entities = useApi<Entity[]>(
    `/api/entities/${entityKind}?limit=40${debouncedQuery.length >= 2 ? `&q=${encodeURIComponent(debouncedQuery)}` : ''}`,
    { enabled: dialog === 'entity' },
  )
  const entityChoices: Entity[] = entities.data ?? []
  const commands = makeCommands(t, (kind) => {
    rememberSelection()
    setToolBase(2)
    setTruthView('table')
    setDialog(kind)
  })
  const popup = editor && !editor.isDestroyed && !dismissed && mode === 'visual' ? popupAt(editor) : null
  const query = (menu ? filter : (popup?.query ?? '')).toLocaleLowerCase()
  const suggestions = useNoteSuggestions(
    popup?.query ?? '',
    !!popup && popup.kind === 'wiki' && !menu && mode === 'visual',
  )
  const options =
    popup?.kind === 'wiki' && !menu
      ? (suggestions.data ?? []).slice(0, 8).map((note) => ({
          id: note.id,
          label: note.title,
          icon: Link2,
          run: (e: Editor) => {
            e.commands.insertContent({ type: 'wikiLink', attrs: { title: note.title } })
          },
        }))
      : commands.filter((command) => `${command.id} ${command.label}`.toLocaleLowerCase().includes(query))
  const showMenu = mode === 'visual' && (menu || !!popup)
  function rememberSelection() {
    if (editor) insertPosition.current = { from: editor.state.selection.from, to: editor.state.selection.to }
  }
  function choose(index: number) {
    const option = options[index]
    if (!editor || !option) return
    if (!menu && popup) editor.chain().focus().deleteRange({ from: popup.from, to: popup.to }).run()
    option.run(editor)
    setMenu(false)
    setFilter('')
    setDismissed(true)
  }
  keyboard.current = (event) => {
    if (
      editor &&
      !editor.isDestroyed &&
      !dialog &&
      !event.isComposing &&
      !event.altKey &&
      editor.view.dom.contains(event.target as Node) &&
      (event.ctrlKey || event.metaKey) &&
      (event.key === 'Home' || event.key === 'End')
    ) {
      const target =
        event.key === 'Home' ? TextSelection.atStart(editor.state.doc) : TextSelection.atEnd(editor.state.doc)
      // Set model and DOM selection together; a delayed native selectionchange
      // must not put fast keyboard navigation back at the previous caret.
      editor.view.dispatch(
        editor.state.tr.setSelection(
          event.shiftKey ? TextSelection.between(editor.state.selection.$anchor, target.$head) : target,
        ),
      )
      return true
    }
    if (
      !dialog &&
      !event.isComposing &&
      (event.ctrlKey || event.metaKey) &&
      event.shiftKey &&
      (event.key.toLowerCase() === 'm' || event.code === 'Space')
    ) {
      rememberSelection()
      setToolBase(2)
      setTruthView('table')
      setDialog(event.code === 'Space' ? 'tools' : 'math')
      return true
    }
    if (popup?.kind === 'slash' && (event.key === 'Enter' || event.key === 'Tab') && !event.isComposing) {
      const quick = quickStudyCommand(popup.query)
      if (quick && editor) {
        // Replace the command only on Apply; cancelling keeps the typed note.
        insertPosition.current = { from: popup.from, to: popup.to }
        setToolBase(quick.kind === 'tool' ? (quick.base ?? 2) : 2)
        setTruthView(quick.kind === 'truth' ? (quick.view ?? 'table') : 'table')
        setDialog(
          quick.kind === 'math'
            ? (quick.template ?? (quick.block ? 'equation' : 'math'))
            : quick.kind === 'truth'
              ? 'truth'
              : quick.tool,
        )
        setMenu(false)
        setDismissed(true)
        return true
      }
    }
    if (event.key === 'Escape') {
      if (showMenu) {
        setMenu(false)
        setDismissed(true)
        return true
      }
      if (focused) {
        setFocused(false)
        return true
      }
    }
    if (showMenu && options.length) {
      if (event.key === 'ArrowDown') {
        setChoice((choice + 1) % options.length)
        return true
      }
      if (event.key === 'ArrowUp') {
        setChoice((choice + options.length - 1) % options.length)
        return true
      }
      if (event.key === 'Enter') {
        choose(Math.min(choice, options.length - 1))
        return true
      }
    }
    return false
  }
  function insertEntity(entity: Entity) {
    if (!editor) return
    const range = insertPosition.current ?? editor.state.selection
    const label = entity.title ?? entity.name ?? entity.filename ?? String(entity.id)
    editor
      .chain()
      .focus()
      .insertContentAt(range, [
        { type: 'entity', attrs: { kind: entityKind, id: String(entity.id), label } },
        { type: 'paragraph' },
      ])
      .run()
    setDialog(null)
  }
  function insertFormula(latex: string) {
    if (!editor || editor.isDestroyed) return
    const block = dialog === 'equation' || ['matrix', 'vector', 'steps', 'cases', 'system'].includes(dialog ?? '')
    editor
      .chain()
      .focus()
      .insertContentAt(
        insertPosition.current ?? editor.state.selection,
        block
          ? [{ type: 'blockMath', attrs: { latex } }, { type: 'paragraph' }]
          : [
              { type: 'inlineMath', attrs: { latex } },
              { type: 'text', text: ' ' },
            ],
      )
      .run()
    setDialog(null)
  }
  async function uploadMedia(file: File) {
    if (!editor || uploading) return
    if (file.size > 25_000_000) {
      setFeedback(t('studio.mediaTooLarge'))
      return
    }
    rememberSelection()
    const range = insertPosition.current!
    const original = editor.getMarkdown()
    const controller = new AbortController()
    uploadController.current = controller
    setUploading(true)
    setFeedback('')
    try {
      const form = new FormData()
      form.append('file', file)
      const asset = await request<{ src: string; kind: string }>('/api/note-assets', {
        method: 'POST',
        body: form,
        signal: controller.signal,
      })
      if (!controller.signal.aborted && !editor.isDestroyed && editor.getMarkdown() === original) {
        editor
          .chain()
          .focus()
          .insertContentAt(range, [
            { type: 'media', attrs: { ...asset, alt: mediaCaption || file.name } },
            { type: 'paragraph' },
          ])
          .run()
        setDialog(null)
        setMediaCaption('')
      }
    } catch {
      if (!controller.signal.aborted) setFeedback(t('studio.uploadFailed'))
    } finally {
      setUploading(false)
      uploadController.current = null
    }
  }
  // Keep the insertion range stable while a media upload is in progress.
  useEffect(() => {
    if (editor && !editor.isDestroyed) editor.setEditable(!uploading, false)
  }, [editor, uploading])
  const toolbarButton = (label: string, icon: LucideIcon, action: () => void, active = false, disabled = false) => (
    <StudioButton label={label} icon={icon} onClick={action} active={active} disabled={disabled || uploading} />
  )
  if (!editor || editor.isDestroyed) return null
  const quote = mode === 'source' ? sourceQuote.trim() : noteCardSelection(editor)
  const cardSelectionValid = quote.length > 0 && quote.length <= 8000
  return (
    <div ref={studioRoot} className={`note-studio ${focused ? 'studio-focused' : ''}`}>
      {/* One quiet bar: formatting where you write, view controls at the end. */}
      <div className="studio-bar">
        {mode === 'visual' && (
          <div className="studio-toolbar" role="toolbar" aria-label={t('studio.toolbar')}>
            <select
              aria-label={t('studio.blockType')}
              disabled={uploading}
              value={editor.isActive('heading') ? `h${editor.getAttributes('heading').level}` : 'paragraph'}
              onChange={(event) => {
                if (event.target.value === 'paragraph') editor.chain().focus().setParagraph().run()
                else
                  editor
                    .chain()
                    .focus()
                    .setHeading({ level: Number(event.target.value.slice(1)) as 1 | 2 | 3 | 4 | 5 | 6 })
                    .run()
              }}
            >
              <option value="paragraph">{t('studio.paragraph')}</option>
              {[1, 2, 3, 4, 5, 6].map((level) => (
                <option value={`h${level}`} key={level}>
                  {t('studio.heading', { level })}
                </option>
              ))}
            </select>
            {toolbarButton(
              t('boldTitle'),
              Bold,
              () => editor.chain().focus().toggleBold().run(),
              editor.isActive('bold'),
            )}
            {toolbarButton(
              t('italicTitle'),
              Italic,
              () => editor.chain().focus().toggleItalic().run(),
              editor.isActive('italic'),
            )}
            {toolbarButton(
              t('highlight.toggle'),
              Highlighter,
              () => editor.chain().focus().toggleMark('learningHighlight', { color: 'yellow' }).run(),
              editor.isActive('learningHighlight'),
            )}
            {toolbarButton(
              t('studio.link'),
              Link2,
              () => {
                rememberSelection()
                setLink(editor.getAttributes('link').href ?? '')
                setDialog('link')
              },
              editor.isActive('link'),
            )}
            <span className="studio-toolbar-divider" />
            {toolbarButton(t('math.inline'), Sigma, () => {
              rememberSelection()
              setDialog('math')
            })}
            {toolbarButton(t('grid.title'), Table2, () => {
              rememberSelection()
              setDialog('grid')
            })}
            {toolbarButton(t('logic.title'), Table2, () => {
              rememberSelection()
              setTruthView('table')
              setDialog('truth')
            })}
            {toolbarButton(t('study.title'), Wrench, () => {
              rememberSelection()
              setToolBase(2)
              setDialog('tools')
            })}
            {toolbarButton(
              t('studio.undo'),
              Undo2,
              () => editor.chain().focus().undo().run(),
              false,
              !editor.can().undo(),
            )}
            {toolbarButton(
              t('studio.redo'),
              Redo2,
              () => editor.chain().focus().redo().run(),
              false,
              !editor.can().redo(),
            )}
            <button
              type="button"
              className="studio-add"
              disabled={uploading}
              aria-expanded={menu}
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => {
                setMenu(!menu)
                setFilter('')
                setChoice(0)
              }}
            >
              <Plus size={16} />
              {t('studio.insert')}
            </button>
          </div>
        )}
        <div className="studio-bar-end">
          {cardSource && mode !== 'preview' && (
            <button
              type="button"
              className="studio-card-create"
              aria-label={cards('create')}
              disabled={!canCreateCard || !cardSelectionValid || uploading}
              title={!canCreateCard ? cards('saveFirst') : !cardSelectionValid ? cards('selectText') : cards('create')}
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => {
                if (canCreateCard && cardSelectionValid) setCardContext({ ...cardSource, quote })
              }}
            >
              <BookOpenCheck size={16} aria-hidden="true" />
              <span>{cards('createShort')}</span>
            </button>
          )}
          <div className="studio-modes" role="group" aria-label={t('studio.mode')}>
            {(['visual', 'source', 'preview'] as const).map((item) => (
              <button
                type="button"
                aria-pressed={mode === item}
                key={item}
                disabled={uploading}
                onClick={() => changeMode(item)}
              >
                {t(`studio.mode_${item}`)}
              </button>
            ))}
          </div>
          <div className="studio-view-actions">
            {toolbarButton(t('studio.outline'), ListTree, () => setOutline(!outline), outline)}
            {toolbarButton(
              focused ? t('studio.exitFocus') : t('studio.focus'),
              Focus,
              () => setFocused(!focused),
              focused,
            )}
          </div>
        </div>
      </div>
      {mode === 'source' ? (
        <SourceEditor
          id={id}
          workspaceKey={workspaceKey}
          value={value}
          onChange={onChange}
          notes={notes}
          onSelectedText={setSourceQuote}
        />
      ) : mode === 'preview' ? (
        <NoteMarkdownDocument body={value} notes={notes} />
      ) : (
        <>
          {showMenu && (
            <div className="studio-command-menu">
              {menu && (
                <input
                  className="native-input"
                  aria-label={t('studio.findBlock')}
                  placeholder={t('studio.findBlock')}
                  value={filter}
                  onChange={(event) => {
                    setFilter(event.target.value)
                    setChoice(0)
                  }}
                  onKeyDown={(event) => {
                    if (keyboard.current(event.nativeEvent)) event.preventDefault()
                  }}
                />
              )}
              <div
                role="listbox"
                aria-label={popup?.kind === 'wiki' && !menu ? t('linkNotesAria') : t('chooseBlockAria')}
              >
                {options.map((option, index) => (
                  <button
                    type="button"
                    role="option"
                    aria-selected={choice === index}
                    key={option.id}
                    onMouseDown={(event) => event.preventDefault()}
                    onClick={() => choose(index)}
                  >
                    <option.icon size={17} />
                    {option.label}
                  </button>
                ))}
              </div>
              {!options.length && <p>{t('studio.noResults')}</p>}
              <button
                type="button"
                className="studio-menu-close"
                onClick={() => {
                  setMenu(false)
                  setDismissed(true)
                }}
              >
                {t('closeButton')}
              </button>
            </div>
          )}
          <StudioContextBars editor={editor} />
          <div className="studio-body">
            <div
              className="studio-writing"
              onDragOver={(event) => {
                if (event.dataTransfer.types.includes('Files')) event.preventDefault()
              }}
              onDrop={(event) => {
                const file = event.dataTransfer.files[0]
                if (!file) return
                event.preventDefault()
                if (/\.(md|txt)$/i.test(file.name)) {
                  if (file.size > MAX_NOTE_LENGTH) {
                    setFeedback(t('studio.tooLong'))
                    return
                  }
                  void file.text().then((text) => {
                    if (!editor.isDestroyed) editor.commands.insertContent(text, { contentType: 'markdown' })
                  })
                } else void uploadMedia(file)
              }}
            >
              <DragHandle editor={editor} nested>
                <div className="studio-drag-handle" title={t('studio.dragBlock')} aria-label={t('studio.dragBlock')}>
                  <GripVertical size={16} />
                </div>
              </DragHandle>
              <NoteLinkTargetsContext.Provider value={targets}>
                <EditorContent editor={editor} />
              </NoteLinkTargetsContext.Provider>
            </div>
            {outline && <StudioOutline editor={editor} />}
          </div>
          <MathTypingGuide />
        </>
      )}
      {mode !== 'preview' && <MarkdownTypingGuide />}
      <footer className="studio-footer">
        {mode === 'visual' && <StudioBlockActions editor={editor} disabled={uploading} />}
        <span className="studio-footer-hint">{t('studio.hint')}</span>
        <span>{t('studio.wordCount', { count: editor.getText().trim().split(/\s+/).filter(Boolean).length })}</span>
      </footer>
      {feedback && (
        <p role="status" className="studio-feedback">
          {feedback}
        </p>
      )}
      {cardContext && (
        <NoteSelectionCardDialog
          context={cardContext}
          canWrite={canCreateCard}
          onClose={() => setCardContext(null)}
          onCloseAutoFocus={(event) => {
            event.preventDefault()
            if (mode === 'visual' && !editor.isDestroyed) editor.commands.focus(undefined, { scrollIntoView: false })
            else
              studioRoot.current?.querySelector<HTMLTextAreaElement>('.note-textarea')?.focus({ preventScroll: true })
          }}
        />
      )}
      <Dialog
        open={dialog === 'entity' || dialog === 'media' || dialog === 'link'}
        onOpenChange={(open) => {
          if (!open) {
            uploadController.current?.abort()
            setDialog(null)
          }
        }}
      >
        <DialogContent className="studio-dialog">
          <DialogTitle>
            {dialog === 'entity' ? t('studio.entity') : dialog === 'media' ? t('studio.media') : t('studio.link')}
          </DialogTitle>
          <DialogDescription>
            {dialog === 'media'
              ? t('studio.mediaDescription')
              : dialog === 'entity'
                ? t('studio.entityDescription')
                : t('studio.linkDescription')}
          </DialogDescription>
          {dialog === 'entity' && (
            <>
              <label>
                {t('studio.entityKind')}
                <select
                  className="native-select"
                  value={entityKind}
                  onChange={(event) => {
                    setEntityKind(event.target.value as EditorEntityKind)
                    setEntityQuery('')
                    setDebouncedQuery('')
                  }}
                >
                  {entityKinds.map((kind) => (
                    <option key={kind} value={kind}>
                      {t(`studio.entity_${kind}`)}
                    </option>
                  ))}
                </select>
              </label>
              <input
                className="native-input"
                aria-label={t('studio.findEntity')}
                placeholder={t('studio.findEntity')}
                maxLength={100}
                value={entityQuery}
                onChange={(event) => setEntityQuery(event.target.value)}
              />
              <div className="studio-entity-results">
                {entityChoices.map((entity) => (
                  <button type="button" key={entity.id} onClick={() => insertEntity(entity)}>
                    <FileText size={16} />
                    {entity.title ?? entity.name ?? entity.filename ?? String(entity.id)}
                  </button>
                ))}
              </div>
              {entities.error && <p role="status">{t('studio.entityFailed')}</p>}
              {!entityChoices.length && !entities.loading && !entities.error && <p>{t('studio.noResults')}</p>}
            </>
          )}
          {dialog === 'media' && (
            <>
              <label>
                {t('studio.caption')}
                <input
                  className="native-input"
                  value={mediaCaption}
                  maxLength={300}
                  onChange={(event) => setMediaCaption(event.target.value)}
                />
              </label>
              <input
                type="file"
                aria-label={t('studio.chooseMedia')}
                accept="image/png,image/jpeg,image/webp,audio/mpeg,audio/wav,audio/ogg,video/mp4,video/webm"
                disabled={uploading}
                onChange={(event) => {
                  if (event.target.files?.[0]) void uploadMedia(event.target.files[0])
                }}
              />
            </>
          )}
          {uploading && (
            <p role="status">
              {t('studio.uploading')}
              <button type="button" onClick={() => uploadController.current?.abort()}>
                <X size={14} />
                {t('cancelButton')}
              </button>
            </p>
          )}
          {feedback && <p role="status">{feedback}</p>}
          {dialog === 'link' && (
            <>
              <input
                className="native-input"
                type="url"
                aria-label={t('studio.url')}
                value={link}
                onChange={(event) => setLink(event.target.value)}
                placeholder="https://"
              />
              <button
                type="button"
                disabled={!/^https?:\/\/\S+$/i.test(link)}
                onClick={() => {
                  const range = insertPosition.current ?? editor.state.selection
                  if (range.from === range.to)
                    editor
                      .chain()
                      .focus()
                      .insertContentAt(range, {
                        type: 'text',
                        text: link,
                        marks: [{ type: 'link', attrs: { href: link } }],
                      })
                      .run()
                  else
                    editor.chain().focus().setTextSelection(range).extendMarkRange('link').setLink({ href: link }).run()
                  setDialog(null)
                }}
              >
                {t('studio.applyLink')}
              </button>
              <button
                type="button"
                onClick={() => {
                  editor.chain().focus().extendMarkRange('link').unsetLink().run()
                  setDialog(null)
                }}
              >
                {t('studio.removeLink')}
              </button>
            </>
          )}
        </DialogContent>
      </Dialog>
      {(dialog === 'math' || dialog === 'equation' || (dialog && Object.hasOwn(mathTemplates, dialog))) && (
        <Suspense fallback={<p role="status">{t('math.loading')}</p>}>
          <MathEntryDialog
            template={dialog && Object.hasOwn(mathTemplates, dialog) ? (dialog as MathTemplate) : undefined}
            displayMode={
              dialog === 'equation' || ['matrix', 'vector', 'steps', 'cases', 'system'].includes(dialog ?? '')
            }
            onApply={insertFormula}
            onClose={() => {
              setDialog(null)
              editor.commands.focus()
            }}
          />
        </Suspense>
      )}
      {(dialog === 'tools' || (dialog && studyToolKeys.includes(dialog as StudyTool))) && (
        <Suspense fallback={<p role="status">{t('math.loading')}</p>}>
          <StudyHelperDialog
            initialTool={dialog === 'tools' ? 'number' : (dialog as StudyTool)}
            initialBase={toolBase}
            onClose={() => {
              setDialog(null)
              editor.commands.focus()
            }}
            onApply={(markdown) => {
              insertStudyMarkdown(editor, markdown, insertPosition.current ?? editor.state.selection)
              setDialog(null)
            }}
          />
        </Suspense>
      )}
      {dialog === 'grid' && (
        <Suspense fallback={<p role="status">{t('math.loading')}</p>}>
          <WritingGridDialog
            onClose={() => {
              setDialog(null)
              editor.commands.focus()
            }}
            onApply={(markdown) => {
              insertStudyMarkdown(editor, markdown, insertPosition.current ?? editor.state.selection)
              setDialog(null)
            }}
          />
        </Suspense>
      )}
      {dialog === 'truth' && (
        <Suspense fallback={<p role="status">{t('math.loading')}</p>}>
          <TruthTableDialog
            initialView={truthView}
            onClose={() => {
              setDialog(null)
              editor.commands.focus()
            }}
            onApply={(markdown) => {
              insertStudyMarkdown(editor, markdown, insertPosition.current ?? editor.state.selection)
              setDialog(null)
            }}
          />
        </Suspense>
      )}
    </div>
  )
}

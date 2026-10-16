// SPDX-License-Identifier: AGPL-3.0-or-later

import { useEffect, useLayoutEffect, useRef, useState, type KeyboardEvent, type DragEvent } from 'react'
import { Link } from 'react-router-dom'
import { Bold, Code2, Eye, Heading2, Italic, Link2, List, ListChecks, Pencil, Table2 } from 'lucide-react'
import { useT } from '@/i18n/useT'
import type { TypedT } from '@/i18n/useT'
import { NoteMarkdownDocument } from '@/components/NoteMarkdownDocument'
import type { NotesResponse } from '@/types'
import { useNoteSuggestions } from '@/hooks/useNoteLinks'
import { StudyInsertTools } from '@/components/editor/StudyInsertTools'
import { insertStudyText, studyTextSelection } from '@/components/editor/studyTextInsertion'
import { markdownTypingEdit } from '@/components/editor/markdownTyping'
import { rememberWorkspace, workspaceValue } from '@/lib/workspaceState'

type Notes = NotesResponse['notes']
type Suggestion = { kind: 'wiki' | 'slash'; start: number; end: number; query: string }
type CommandId = 'heading' | 'list' | 'task' | 'code' | 'table'

function commandsFor(t: TypedT<'notes'>): { id: CommandId; label: string; search: string; text: string }[] {
  return [
    { id: 'heading', label: t('cmdHeadingLabel'), search: t('cmdHeadingSearch'), text: t('cmdHeadingText') },
    { id: 'list', label: t('cmdListLabel'), search: t('cmdListSearch'), text: t('cmdListText') },
    { id: 'task', label: t('cmdTaskLabel'), search: t('cmdTaskSearch'), text: t('cmdTaskText') },
    { id: 'code', label: t('cmdCodeLabel'), search: t('cmdCodeSearch'), text: t('cmdCodeText') },
    { id: 'table', label: t('cmdTableLabel'), search: t('cmdTableSearch'), text: t('cmdTableText') },
  ]
}

function suggestionAt(body: string, caret: number): Suggestion | null {
  const before = body.slice(0, caret)
  const wiki = before.match(/\[\[([^\]\n]*)$/)
  if (wiki) return { kind: 'wiki', start: caret - wiki[0].length, end: caret, query: wiki[1] }
  const lineStart = before.lastIndexOf('\n') + 1
  const slash = before.slice(lineStart).match(/^\s*\/([^\n]*)$/)
  if (slash) return { kind: 'slash', start: lineStart, end: caret, query: slash[1] }
  return null
}

export function NoteMarkdownEditor({
  id,
  value,
  onChange,
  notes,
  onSelectedText,
  workspaceKey,
}: {
  id: string
  value: string
  onChange: (value: string) => void
  notes: Notes
  onSelectedText?: (text: string) => void
  workspaceKey?: string
}) {
  const { t } = useT('notes')
  const commands = commandsFor(t)
  const editor = useRef<HTMLTextAreaElement>(null)
  const restoredSelection = useRef(false)
  const interacted = useRef(false)
  const selectionKey = workspaceKey ? `source-editor:${workspaceKey}:selection` : null
  function rememberSelection(field: HTMLTextAreaElement) {
    if (selectionKey)
      rememberWorkspace(
        selectionKey,
        { from: field.selectionStart, to: field.selectionEnd, top: field.scrollTop },
        false,
      )
  }
  useEffect(() => {
    if (!selectionKey || restoredSelection.current || interacted.current) return
    const frame = requestAnimationFrame(() => {
      const field = editor.current
      if (!field || interacted.current) return
      const saved = workspaceValue<{ from: number; to: number; top: number } | null>(selectionKey, null, {
        persist: false,
        valid: (value): value is { from: number; to: number; top: number } | null =>
          value === null ||
          (!!value &&
            typeof value === 'object' &&
            ['from', 'to', 'top'].every(
              (key) =>
                Number.isFinite((value as Record<string, unknown>)[key]) &&
                Number((value as Record<string, unknown>)[key]) >= 0,
            )),
      })
      if (saved) {
        field.setSelectionRange(Math.min(saved.from, field.value.length), Math.min(saved.to, field.value.length))
        field.scrollTop = saved.top
      }
      restoredSelection.current = true
    })
    return () => cancelAnimationFrame(frame)
  }, [selectionKey, value])
  const [caret, setCaret] = useState(0)
  const [hidden, setHidden] = useState(false)
  const [choice, setChoice] = useState(0)
  const [preview, setPreview] = useState(false)
  const [dragging, setDragging] = useState(false)
  const [dropMessage, setDropMessage] = useState('')
  const currentValue = useRef(value)
  currentValue.current = value
  const dropRequest = useRef(0)
  const previewSelection = useRef({ from: 0, to: 0 })
  const pendingSelection = useRef<{ value: string; start: number; end: number } | null>(null)
  useLayoutEffect(() => {
    const selection = pendingSelection.current
    const field = editor.current
    if (!selection || !field || field.value !== selection.value) return
    pendingSelection.current = null
    // Commit the caret with the controlled text before another input can arrive.
    // A later animation frame could move it behind a newly typed character.
    field.focus({ preventScroll: true })
    field.setSelectionRange(selection.start, selection.end)
  })
  useEffect(
    () => () => {
      dropRequest.current += 1
    },
    [],
  )
  const suggestion = !preview && !hidden ? suggestionAt(value, caret) : null
  const suggestions = useNoteSuggestions(suggestion?.query ?? '', suggestion?.kind === 'wiki')
  const options =
    suggestion?.kind === 'wiki'
      ? (suggestions.data ?? [])
          .slice(0, 6)
          .map((note) => ({ key: note.id, label: note.title, text: `[[${note.title}]]` }))
      : suggestion?.kind === 'slash'
        ? commands
            .filter((command) => command.search.includes(suggestion.query.toLocaleLowerCase('de-DE')))
            .slice(0, 6)
            .map((command) => ({ key: command.id, label: command.label, text: command.text }))
        : []

  function replace(
    start: number,
    end: number,
    text: string,
    selectionStart = text.length,
    selectionEnd = selectionStart,
  ) {
    const next = value.slice(0, start) + text + value.slice(end)
    pendingSelection.current = { value: next, start: start + selectionStart, end: start + selectionEnd }
    onChange(next)
    setHidden(true)
    setCaret(start + selectionEnd)
  }

  function wrap(before: string, after: string, placeholder: string) {
    const field = editor.current
    if (!field) return
    const start = field.selectionStart
    const end = field.selectionEnd
    const selected = value.slice(start, end) || placeholder
    replace(start, end, before + selected + after, before.length, before.length + selected.length)
  }

  function prefix(text: string) {
    const field = editor.current
    if (!field) return
    const start = value.lastIndexOf('\n', field.selectionStart - 1) + 1
    replace(start, start, text)
  }

  function insert(text: string) {
    const field = editor.current
    if (!field) return
    replace(field.selectionStart, field.selectionEnd, text)
  }

  function insertBlock(text: string) {
    const field = editor.current
    if (!field) return
    const start = field.selectionStart
    const end = field.selectionEnd
    const before = start > 0 && value[start - 1] !== '\n' ? '\n\n' : ''
    const after = end < value.length && value[end] !== '\n' ? '\n\n' : '\n'
    replace(start, end, before + text + after)
  }

  function choose(index: number) {
    if (!suggestion) return
    const option = options[index]
    if (!option) return
    replace(
      suggestion.start,
      suggestion.end,
      suggestion.kind === 'slash' && (option.key === 'table' || option.key === 'code')
        ? `${option.text}\n`
        : option.text,
    )
  }

  function togglePreview() {
    if (!preview)
      previewSelection.current = {
        from: editor.current?.selectionStart ?? value.length,
        to: editor.current?.selectionEnd ?? value.length,
      }
    setPreview(!preview)
    setHidden(true)
    if (preview)
      requestAnimationFrame(() => {
        editor.current?.focus({ preventScroll: true })
        editor.current?.setSelectionRange(
          Math.min(previewSelection.current.from, currentValue.current.length),
          Math.min(previewSelection.current.to, currentValue.current.length),
        )
      })
  }

  function onKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.defaultPrevented) return
    if ((event.ctrlKey || event.metaKey) && event.key.toLocaleLowerCase() === 'b') {
      event.preventDefault()
      wrap('**', '**', t('boldPlaceholder'))
      return
    }
    if ((event.ctrlKey || event.metaKey) && event.key.toLocaleLowerCase() === 'i') {
      event.preventDefault()
      wrap('*', '*', t('italicPlaceholder'))
      return
    }
    if (event.key === 'Escape' && suggestion) {
      event.preventDefault()
      setHidden(true)
      return
    }
    if (
      !suggestion &&
      !event.nativeEvent.isComposing &&
      !event.altKey &&
      !event.ctrlKey &&
      !event.metaKey &&
      (event.key === 'Tab' || (event.key === 'Enter' && !event.shiftKey))
    ) {
      const edit = markdownTypingEdit(
        value,
        event.currentTarget.selectionStart,
        event.currentTarget.selectionEnd,
        event.key,
        event.shiftKey,
      )
      if (edit && value.length - (edit.to - edit.from) + edit.text.length <= 100_000) {
        event.preventDefault()
        replace(edit.from, edit.to, edit.text, edit.caret - edit.from)
        return
      }
    }
    if (!suggestion || !options.length) return
    if (event.key === 'ArrowDown') {
      event.preventDefault()
      setChoice((choice + 1) % options.length)
    }
    if (event.key === 'ArrowUp') {
      event.preventDefault()
      setChoice((choice + options.length - 1) % options.length)
    }
    if (event.key === 'Enter') {
      event.preventDefault()
      choose(choice)
    }
  }

  async function onDrop(event: DragEvent<HTMLDivElement>) {
    if (!event.dataTransfer.files.length) return
    event.preventDefault()
    setDragging(false)
    const file = event.dataTransfer.files[0]
    const request = ++dropRequest.current
    if (
      event.dataTransfer.files.length === 1 &&
      /\.(md|txt)$/i.test(file.name) &&
      file.size + value.length <= 100_000
    ) {
      const range = studyTextSelection(
        value,
        editor.current?.selectionStart ?? value.length,
        editor.current?.selectionEnd ?? value.length,
      )
      try {
        const text = await file.text()
        if (dropRequest.current !== request || !editor.current) return
        const next = insertStudyText(currentValue.current, range, text, 100_000)
        if (typeof next === 'string') {
          setDropMessage(t(next === 'changed' ? 'fileChangedBeforeImportMessage' : 'studio.tooLong'))
          return
        }
        onChange(next.body)
        setHidden(true)
        setCaret(next.caret)
        requestAnimationFrame(() => {
          editor.current?.focus()
          editor.current?.setSelectionRange(next.caret, next.caret)
        })
        setDropMessage(t('fileInsertedMessage', { name: file.name }))
      } catch {
        if (dropRequest.current === request && editor.current) setDropMessage(t('fileReadFailedMessage'))
      }
    } else setDropMessage(t('fileNotSupportedMessage'))
  }

  return (
    <div className="note-writing">
      <div className="note-writing-bar" role="toolbar" aria-label={t('toolbarAria')}>
        {!preview && (
          <>
            <button
              type="button"
              title={t('headingTitle')}
              aria-label={t('headingInsertAria')}
              onClick={() => prefix('## ')}
            >
              <Heading2 size={17} />
            </button>
            <button
              type="button"
              title={t('boldTitle')}
              aria-label={t('boldAria')}
              onClick={() => wrap('**', '**', t('boldPlaceholder'))}
            >
              <Bold size={17} />
            </button>
            <button
              type="button"
              title={t('italicTitle')}
              aria-label={t('italicAria')}
              onClick={() => wrap('*', '*', t('italicPlaceholder'))}
            >
              <Italic size={17} />
            </button>
            <button type="button" title={t('listTitle')} aria-label={t('listInsertAria')} onClick={() => prefix('- ')}>
              <List size={17} />
            </button>
            <button
              type="button"
              title={t('taskTitle')}
              aria-label={t('taskInsertAria')}
              onClick={() => prefix('- [ ] ')}
            >
              <ListChecks size={17} />
            </button>
            <button
              type="button"
              title={t('codeblockTitle')}
              aria-label={t('codeblockInsertAria')}
              onClick={() => insertBlock(t('cmdCodeText'))}
            >
              <Code2 size={17} />
            </button>
            <button
              type="button"
              title={t('tableTitle')}
              aria-label={t('tableInsertAria')}
              onClick={() => insertBlock(t('cmdTableText'))}
            >
              <Table2 size={17} />
            </button>
            <button
              type="button"
              title={t('linkNoteTitle')}
              aria-label={t('linkNoteTitle')}
              onClick={() => {
                insert('[[')
                setHidden(false)
              }}
            >
              <Link2 size={17} />
            </button>
          </>
        )}
        <button type="button" className="note-preview-toggle" onClick={togglePreview}>
          {preview ? <Pencil size={16} /> : <Eye size={16} />}
          {preview ? t('writeMode') : t('previewMode')}
        </button>
      </div>
      {!preview && <StudyInsertTools field={editor} value={value} maxLength={100_000} onChange={onChange} />}
      {preview ? (
        <div className="note-writing-preview">
          <NoteMarkdownDocument body={value} notes={notes} />
        </div>
      ) : (
        <div
          className={`note-writing-field ${dragging ? 'is-dragging' : ''}`}
          onDragOver={(event) => {
            if (event.dataTransfer.types.includes('Files')) {
              event.preventDefault()
              setDragging(true)
            }
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={(event) => void onDrop(event)}
        >
          <textarea
            ref={editor}
            className="note-textarea"
            id={id}
            aria-label={t('noteContentAria')}
            maxLength={100_000}
            placeholder={t('editorPlaceholder')}
            value={value}
            onChange={(event) => {
              onChange(event.target.value)
              setCaret(event.target.selectionStart)
              setHidden(false)
              setChoice(0)
            }}
            onSelect={(event) => {
              rememberSelection(event.currentTarget)
              setCaret(event.currentTarget.selectionStart)
              onSelectedText?.(value.slice(event.currentTarget.selectionStart, event.currentTarget.selectionEnd))
            }}
            onPointerDown={() => {
              interacted.current = true
            }}
            onBlur={(event) => rememberSelection(event.currentTarget)}
            onScroll={(event) => rememberSelection(event.currentTarget)}
            onKeyDown={(event) => {
              interacted.current = true
              onKeyDown(event)
            }}
          />
          {suggestion && options.length > 0 && (
            <div
              className="note-suggestions"
              role="listbox"
              aria-label={suggestion.kind === 'wiki' ? t('linkNotesAria') : t('chooseBlockAria')}
            >
              {options.map((option, index) => (
                <button
                  type="button"
                  role="option"
                  aria-selected={choice === index}
                  className={choice === index ? 'active' : ''}
                  key={option.key}
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => choose(index)}
                >
                  {option.label}
                </button>
              ))}
            </div>
          )}
        </div>
      )}
      {dropMessage && (
        <p className="note-drop-message" role="status">
          {dropMessage} <Link to="/inbox">{t('goToInboxLink')}</Link>
        </p>
      )}
      <p className="note-writing-hint">{t('editorHint')}</p>
    </div>
  )
}

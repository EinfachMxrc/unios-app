// SPDX-License-Identifier: AGPL-3.0-or-later

import { lazy, Suspense, useCallback, useEffect, useRef, useState, type RefObject, type ReactNode } from 'react'
import { flushSync } from 'react-dom'
import { Sigma, Table2 } from 'lucide-react'
import { useT } from '@/i18n/useT'
import { quickStudyCommand, type QuickStudyCommand } from './studyCommands'
import { insertStudyText, studyTextSelection } from './studyTextInsertion'
import { MathTypingGuide } from './MathTypingGuide'
import { emptyWritingGrid, writingGridAt, type WritingGrid as Rows } from './writingGridModel'
import { markdownTypingEdit } from './markdownTyping'
import './StudyInsert.css'

const WritingGridDialog = lazy(() => import('./WritingGridDialog'))
const MathEntryDialog = lazy(() => import('./MathEntryDialog'))
const TruthTableDialog = lazy(() => import('./TruthTableDialog'))
const StudyHelperDialog = lazy(() => import('./StudyHelperDialog'))
const NoteMarkdownDocument = lazy(() => import('./RichNoteDocument'))

export function StudyInsertTools({
  field,
  value,
  maxLength,
  onChange,
  disabled = false,
  mathOnly = false,
  compact = false,
  children,
}: {
  field: RefObject<HTMLTextAreaElement | null>
  value: string
  maxLength: number
  onChange: (value: string) => void
  disabled?: boolean
  mathOnly?: boolean
  compact?: boolean
  children?: ReactNode
}) {
  const { t } = useT('notes')
  const { t: tq } = useT('mathQuick')
  const [dialog, setDialog] = useState<QuickStudyCommand | null>(null)
  const [preview, setPreview] = useState(false)
  const [gridRows, setGridRows] = useState<Rows | null>(null)
  const leaveByTab = useRef(false)
  const [error, setError] = useState<'long' | 'changed' | null>(null)
  const selection = useRef(studyTextSelection(value, 0, 0))
  const returnSelection = useRef({ from: 0, to: 0 })
  function open(kind: QuickStudyCommand) {
    selection.current = studyTextSelection(
      value,
      field.current?.selectionStart ?? value.length,
      field.current?.selectionEnd ?? value.length,
    )
    returnSelection.current = { from: selection.current.from, to: selection.current.to }
    setDialog(kind)
    setError(null)
  }
  const restoreSelection = useCallback(
    (caret?: number) => {
      requestAnimationFrame(() => {
        field.current?.focus({ preventScroll: true })
        field.current?.setSelectionRange(caret ?? returnSelection.current.from, caret ?? returnSelection.current.to)
      })
    },
    [field],
  )
  useEffect(() => {
    const textarea = field.current
    if (!textarea) return
    const hadClass = textarea.classList.contains('study-writing-source')
    textarea.classList.add('study-writing-source')
    function keydown(event: KeyboardEvent) {
      if (disabled || dialog || gridRows || event.isComposing || event.defaultPrevented) return
      if (event.key === 'Escape') leaveByTab.current = true
      let command: QuickStudyCommand | null = null,
        start = textarea!.selectionStart
      const end = textarea!.selectionEnd
      if ((event.ctrlKey || event.metaKey) && event.shiftKey && event.key.toLowerCase() === 'm')
        command = { kind: 'math' }
      else if ((event.ctrlKey || event.metaKey) && event.shiftKey && event.code === 'Space')
        command = { kind: 'tool', tool: 'number' }
      else if (
        (event.key === 'Enter' || event.key === 'Tab') &&
        !event.ctrlKey &&
        !event.metaKey &&
        !event.shiftKey &&
        start === end
      ) {
        const line = value.slice(0, start).match(/(?:^|\s)\/([^\s/]*)$/)
        if (line) {
          command = quickStudyCommand(line[1])
          if (command) start -= line[1].length + 1
        }
      }
      if (!command) {
        if (event.key !== 'Tab' || event.ctrlKey || event.metaKey || event.altKey) return
        if (leaveByTab.current) {
          leaveByTab.current = false
          return
        }
        if (markdownTypingEdit(value, start, end, 'Tab', event.shiftKey)) return
        // Let unfinished link/command menus keep their own keyboard behavior.
        if (/(?:\[\[[^\]\n]*|(?:^|\n)\s*\/[^\n]*)$/.test(value.slice(0, start))) return
        if (event.shiftKey) return
        const next = insertStudyText(value, studyTextSelection(value, start, end), '\t', maxLength)
        if (typeof next === 'string') return
        event.preventDefault()
        flushSync(() => onChange(next.body))
        textarea!.setSelectionRange(next.caret, next.caret)
        return
      }
      if (mathOnly && command.kind !== 'math') return
      event.preventDefault()
      returnSelection.current = { from: textarea!.selectionStart, to: end }
      selection.current = studyTextSelection(value, start, end)
      setDialog(command)
      setError(null)
    }
    textarea.addEventListener('keydown', keydown)
    return () => {
      textarea.removeEventListener('keydown', keydown)
      if (!hadClass) textarea.classList.remove('study-writing-source')
    }
  }, [disabled, dialog, gridRows, field, value, mathOnly, maxLength, onChange, restoreSelection])
  function close() {
    setDialog(null)
    setGridRows(null)
    restoreSelection()
  }
  function openGrid() {
    const from = field.current?.selectionStart ?? value.length,
      to = field.current?.selectionEnd ?? value.length
    const previous = value.slice(0, from).trimEnd().length
    const existing = writingGridAt(value, from, to) ?? (from === to ? writingGridAt(value, previous, previous) : null)
    returnSelection.current = { from, to }
    selection.current = studyTextSelection(value, existing?.from ?? from, existing?.to ?? to)
    setGridRows(existing?.rows ?? emptyWritingGrid())
    setError(null)
  }
  function insert(text: string) {
    if (disabled) {
      close()
      return
    }
    const next = insertStudyText(value, selection.current, text, maxLength)
    if (typeof next === 'string') {
      setError(next)
      setDialog(null)
      setGridRows(null)
      restoreSelection()
      return
    }
    onChange(next.body)
    setDialog(null)
    setGridRows(null)
    restoreSelection(next.caret)
  }
  return (
    <>
      <div className="study-insert-tools" role="group" aria-label={t('math.tools')}>
        <button type="button" disabled={disabled} onClick={() => open({ kind: 'math' })}>
          <Sigma size={15} aria-hidden="true" />
          {t('math.inline')}
        </button>
        <button type="button" disabled={disabled} onClick={() => open({ kind: 'math', block: true })}>
          {t('math.block')}
        </button>
        {!mathOnly && (
          <>
            <button type="button" disabled={disabled} onClick={openGrid}>
              <Table2 size={15} aria-hidden="true" />
              {t('grid.title')}
            </button>
            <button type="button" disabled={disabled} onClick={() => open({ kind: 'truth' })}>
              <Table2 size={15} aria-hidden="true" />
              {t('logic.title')}
            </button>
            <button type="button" disabled={disabled} onClick={() => open({ kind: 'tool', tool: 'number' })}>
              {t('study.title')}
            </button>
          </>
        )}
        <button type="button" aria-expanded={preview} onClick={() => setPreview(!preview)}>
          {t('math.preview')}
        </button>
      </div>
      {children}
      {compact ? (
        <details className="study-insert-help">
          <summary>{t('math.toolsHelp')}</summary>
          <p className="study-command-hint muted-text">{tq(mathOnly ? 'mathCommandHint' : 'commandHint')}</p>
          <p className="study-command-hint muted-text">{t('grid.tabHint')}</p>
        </details>
      ) : (
        <p className="study-command-hint muted-text">{tq(mathOnly ? 'mathCommandHint' : 'commandHint')}</p>
      )}
      <MathTypingGuide />
      {!compact && <p className="study-command-hint muted-text">{t('grid.tabHint')}</p>}
      {gridRows && (
        <Suspense fallback={<p role="status">{t('math.loading')}</p>}>
          <WritingGridDialog initialRows={gridRows} onApply={insert} onClose={close} />
        </Suspense>
      )}
      {error && <p role="status">{error === 'changed' ? tq('sourceChanged') : t('studio.tooLong')}</p>}
      {preview && (
        <div className="reader-note-preview">
          <Suspense fallback={<p role="status">{t('math.loading')}</p>}>
            <NoteMarkdownDocument body={value} notes={[]} />
          </Suspense>
        </div>
      )}
      {dialog && (
        <Suspense fallback={<p role="status">{t('math.loading')}</p>}>
          {dialog.kind === 'truth' ? (
            <TruthTableDialog initialView={dialog.view} onClose={close} onApply={insert} />
          ) : dialog.kind === 'tool' ? (
            <StudyHelperDialog initialTool={dialog.tool} initialBase={dialog.base} onClose={close} onApply={insert} />
          ) : (
            <MathEntryDialog
              template={dialog.template}
              displayMode={dialog.block}
              onClose={close}
              onApply={(latex) => insert(dialog.block ? `\n\n$$\n${latex}\n$$\n\n` : `$${latex}$`)}
            />
          )}
        </Suspense>
      )}
    </>
  )
}

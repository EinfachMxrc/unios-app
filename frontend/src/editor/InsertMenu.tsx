// SPDX-License-Identifier: AGPL-3.0-or-later

import type { Editor } from '@tiptap/core'
import { Link2, type LucideIcon } from 'lucide-react'
import { useEffect, useId, useMemo, useRef, useState } from 'react'
import { quickStudyCommand } from '@/components/editor/studyCommands'
import { useNoteSuggestions } from '@/hooks/useNoteLinks'
import { useT } from '@/i18n/useT'
import {
  filterCommands,
  insertWikiLink,
  triggerAt,
  type CommandContext,
  type DialogOptions,
  type InsertDialog,
  type Range,
  type Trigger,
} from './commands'

type Option = { id: string; label: string; icon: LucideIcon; group?: string; run: () => void }

/**
 * The "/" block menu and the "[[" note-link menu. Both open from typed text, so
 * the document stays the single source of truth and nothing has to be closed by hand.
 */
export function InsertMenu({
  editor,
  version,
  openDialog,
}: {
  editor: Editor
  /** Bumps on every editor transaction so the trigger is re-read. */
  version: number
  openDialog: (dialog: InsertDialog, range: Range, options?: DialogOptions) => void
}) {
  const { t } = useT('editor')
  const listId = useId()
  const [choice, setChoice] = useState(0)
  // A trigger the person has closed (or handed to a dialog) stays closed until its text changes.
  const [dismissed, setDismissed] = useState<{ from: number; query: string } | null>(null)
  const keys = useRef<(event: KeyboardEvent) => boolean>(() => false)

  const trigger: Trigger | null = editor.isDestroyed ? null : triggerAt(editor)
  const hidden = trigger !== null && dismissed?.from === trigger.from && dismissed.query === trigger.query
  const active = trigger && !hidden ? trigger : null
  const suggestions = useNoteSuggestions(active?.query ?? '', active?.kind === 'wiki')

  const options: Option[] = useMemo(() => {
    if (!active) return []
    if (active.kind === 'wiki') {
      return (suggestions.data ?? []).slice(0, 8).map((note) => ({
        id: note.id,
        label: note.title,
        icon: Link2,
        run: () => insertWikiLink(editor, { from: active.from, to: active.to }, note.title),
      }))
    }
    return filterCommands(active.query, t).map((command) => {
      const context: CommandContext = {
        editor,
        range: { from: active.from, to: active.to },
        openDialog: (dialog, range, options) => {
          setDismissed({ from: active.from, query: active.query })
          openDialog(dialog, range, options)
        },
      }
      return {
        id: command.id,
        label: t(command.label),
        icon: command.icon,
        group: command.group,
        run: () => command.run(context),
      }
    })
  }, [active, suggestions.data, editor, openDialog, t])

  useEffect(() => setChoice(0), [active?.query, active?.kind])
  const selected = Math.min(choice, Math.max(options.length - 1, 0))

  keys.current = (event) => {
    if (!active) return false
    if (event.key === 'Escape') {
      setDismissed({ from: active.from, query: active.query })
      return true
    }
    if ((event.key === 'Enter' || event.key === 'Tab') && active.kind === 'slash') {
      // Typed study commands ("/hex", "/matrix", "/kv") open their tool with the preset applied.
      const quick = quickStudyCommand(active.query)
      if (quick) {
        const range = { from: active.from, to: active.to }
        setDismissed({ from: active.from, query: active.query })
        if (quick.kind === 'math') openDialog(quick.block ? 'math' : 'math-inline', range, { template: quick.template })
        else if (quick.kind === 'truth') openDialog('truth', range, { view: quick.view })
        else openDialog('helper', range, { tool: quick.tool, base: quick.base })
        return true
      }
    }
    if (!options.length) return false
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      setChoice((selected + (event.key === 'ArrowDown' ? 1 : options.length - 1)) % options.length)
      return true
    }
    if (event.key === 'Enter' || event.key === 'Tab') {
      options[selected].run()
      return true
    }
    return false
  }
  useEffect(() => {
    let dom: HTMLElement | null = null
    const handler = (event: KeyboardEvent) => {
      if (keys.current(event)) {
        event.preventDefault()
        event.stopPropagation()
      }
    }
    // The view exists only once the editor content is mounted; attach when it is.
    const attach = () => {
      if (dom || editor.isDestroyed) return
      dom = editor.view.dom
      // Capture phase: the menu must see Enter before the list/paragraph keymaps do.
      dom.addEventListener('keydown', handler, true)
    }
    if (editor.isInitialized) attach()
    else editor.on('create', attach)
    return () => {
      editor.off('create', attach)
      dom?.removeEventListener('keydown', handler, true)
    }
  }, [editor])
  useEffect(() => {
    document.getElementById(`${listId}-${selected}`)?.scrollIntoView?.({ block: 'nearest' })
  }, [selected, listId])

  if (!active || version < 0) return null
  const coords = editor.view.coordsAtPos(active.to)
  const host = editor.view.dom.parentElement?.getBoundingClientRect()
  if (!host) return null
  const style = {
    top: coords.bottom - host.top + 6,
    left: Math.max(0, Math.min(coords.left - host.left, host.width - 280)),
  }
  return (
    <div className="note-insert-menu" style={style}>
      <ul role="listbox" id={listId} aria-label={t(active.kind === 'wiki' ? 'wikiMenu' : 'blockMenu')}>
        {options.map((option, index) => (
          <li
            key={option.id}
            id={`${listId}-${index}`}
            role="option"
            aria-selected={index === selected}
            data-group={option.group}
          >
            <button
              type="button"
              tabIndex={-1}
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => option.run()}
            >
              <option.icon size={17} aria-hidden="true" />
              {option.label}
            </button>
          </li>
        ))}
        {!options.length && (
          <li className="note-insert-empty" role="presentation">
            {active.kind === 'wiki' && active.query.trim().length < 2 ? t('wikiHint') : t('noResults')}
          </li>
        )}
      </ul>
    </div>
  )
}

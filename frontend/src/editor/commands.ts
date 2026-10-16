// SPDX-License-Identifier: AGPL-3.0-or-later

import type { Editor } from '@tiptap/core'
import type { Node as PMNode } from '@tiptap/pm/model'
import { TextSelection } from '@tiptap/pm/state'
import {
  CheckSquare,
  ChevronRight,
  Code2,
  FileText,
  Heading1,
  Heading2,
  Heading3,
  Image,
  Link2,
  List,
  ListOrdered,
  Minus,
  Pilcrow,
  Quote,
  Sigma,
  Table2,
  Brain,
  Workflow,
  Grid3x3,
  Calculator,
  Table,
  type LucideIcon,
} from 'lucide-react'
import { calloutIcons, type CalloutKind } from '@/components/editor/callouts'
import type { Keys } from '@/i18n/useT'

export type Range = { from: number; to: number }
/** What a command needs from the menu that runs it. */
export type CommandContext = {
  editor: Editor
  /** The typed trigger text ("/tab") that the command replaces. */
  range: Range
  openDialog: (dialog: InsertDialog, range: Range) => void
}
export type InsertDialog = 'media' | 'entity' | 'math' | 'recall' | 'diagram' | 'grid' | 'truth' | 'helper'
export type BlockCommand = {
  id: string
  group: 'basic' | 'learn' | 'media'
  icon: LucideIcon
  label: Keys<'editor'>
  keywords: string
  run: (context: CommandContext) => void
}

const clear = ({ editor, range }: CommandContext) => editor.chain().focus().deleteRange(range)

function insertBlock({ editor, range }: CommandContext, node: object, writeInside = false) {
  // Replace the (now empty) paragraph that held the trigger instead of leaving a blank line above.
  // A container leaves the caret inside it; a finished block leaves a paragraph to keep writing in.
  editor
    .chain()
    .focus()
    .deleteRange(range)
    .insertContent(writeInside ? [node] : [node, { type: 'paragraph' }])
    .run()
  // The container took the place of the paragraph that began one step before the typed text.
  if (writeInside) editor.commands.setTextSelection(range.from + 1)
}

const calloutKinds: { kind: CalloutKind; label: Keys<'editor'>; keywords: string }[] = [
  { kind: 'note', label: 'callout_note', keywords: 'hinweis note info' },
  { kind: 'definition', label: 'callout_definition', keywords: 'definition' },
  { kind: 'memory', label: 'callout_memory', keywords: 'merksatz merken satz' },
  { kind: 'example', label: 'callout_example', keywords: 'beispiel example' },
  { kind: 'tip', label: 'callout_tip', keywords: 'tipp lerntipp tip' },
  { kind: 'pitfall', label: 'callout_pitfall', keywords: 'fehler pitfall' },
  { kind: 'question', label: 'callout_question', keywords: 'frage question' },
  { kind: 'warning', label: 'callout_warning', keywords: 'wichtig warnung warning' },
  { kind: 'summary', label: 'callout_summary', keywords: 'zusammenfassung summary' },
]

export const blockCommands: BlockCommand[] = [
  {
    id: 'text',
    group: 'basic',
    icon: Pilcrow,
    label: 'cmd_text',
    keywords: 'text absatz paragraph',
    run: (c) => clear(c).setParagraph().run(),
  },
  {
    id: 'h1',
    group: 'basic',
    icon: Heading1,
    label: 'cmd_h1',
    keywords: 'überschrift heading h1 titel',
    run: (c) => clear(c).setHeading({ level: 1 }).run(),
  },
  {
    id: 'h2',
    group: 'basic',
    icon: Heading2,
    label: 'cmd_h2',
    keywords: 'überschrift heading h2',
    run: (c) => clear(c).setHeading({ level: 2 }).run(),
  },
  {
    id: 'h3',
    group: 'basic',
    icon: Heading3,
    label: 'cmd_h3',
    keywords: 'überschrift heading h3',
    run: (c) => clear(c).setHeading({ level: 3 }).run(),
  },
  {
    id: 'bullet',
    group: 'basic',
    icon: List,
    label: 'cmd_bullet',
    keywords: 'liste aufzählung bullet',
    run: (c) => clear(c).toggleBulletList().run(),
  },
  {
    id: 'numbered',
    group: 'basic',
    icon: ListOrdered,
    label: 'cmd_numbered',
    keywords: 'nummeriert liste numbered',
    run: (c) => clear(c).toggleOrderedList().run(),
  },
  {
    id: 'todo',
    group: 'basic',
    icon: CheckSquare,
    label: 'cmd_todo',
    keywords: 'aufgabe checkliste todo task',
    run: (c) => clear(c).toggleTaskList().run(),
  },
  {
    id: 'toggle',
    group: 'basic',
    icon: ChevronRight,
    label: 'cmd_toggle',
    keywords: 'aufklappen toggle details falten',
    run: (c) => insertBlock(c, { type: 'toggle', content: [{ type: 'paragraph' }] }, true),
  },
  {
    id: 'quote',
    group: 'basic',
    icon: Quote,
    label: 'cmd_quote',
    keywords: 'zitat quote',
    run: (c) => clear(c).toggleBlockquote().run(),
  },
  {
    id: 'divider',
    group: 'basic',
    icon: Minus,
    label: 'cmd_divider',
    keywords: 'trennlinie divider',
    run: (c) => clear(c).setHorizontalRule().run(),
  },
  {
    id: 'code',
    group: 'basic',
    icon: Code2,
    label: 'cmd_code',
    keywords: 'code programmcode',
    run: (c) => clear(c).setCodeBlock().run(),
  },
  {
    id: 'table',
    group: 'basic',
    icon: Table2,
    label: 'cmd_table',
    keywords: 'tabelle table',
    run: (c) => clear(c).insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run(),
  },
  ...calloutKinds.map(({ kind, label, keywords }): BlockCommand => ({
    id: `callout-${kind}`,
    group: 'learn',
    icon: calloutIcons[kind],
    label,
    keywords: `${keywords} hinweis callout`,
    run: (c) => insertBlock(c, { type: 'callout', attrs: { kind }, content: [{ type: 'paragraph' }] }, true),
  })),
  {
    id: 'math',
    group: 'learn',
    icon: Sigma,
    label: 'cmd_math',
    keywords: 'formel gleichung math latex equation',
    run: (c) => c.openDialog('math', c.range),
  },
  {
    id: 'recall',
    group: 'learn',
    icon: Brain,
    label: 'cmd_recall',
    keywords: 'abruf frage antwort recall karte',
    run: (c) => c.openDialog('recall', c.range),
  },
  {
    id: 'diagram',
    group: 'learn',
    icon: Workflow,
    label: 'cmd_diagram',
    keywords: 'diagramm ablauf diagram flow',
    run: (c) => c.openDialog('diagram', c.range),
  },
  {
    id: 'grid',
    group: 'learn',
    icon: Grid3x3,
    label: 'cmd_grid',
    keywords: 'raster schreibraster grid rechnen',
    run: (c) => c.openDialog('grid', c.range),
  },
  {
    id: 'truth',
    group: 'learn',
    icon: Table,
    label: 'cmd_truth',
    keywords: 'wahrheitstabelle logik truth table',
    run: (c) => c.openDialog('truth', c.range),
  },
  {
    id: 'helper',
    group: 'learn',
    icon: Calculator,
    label: 'cmd_helper',
    keywords: 'zahlensystem binär hexadezimal umrechnen rechnen helper',
    run: (c) => c.openDialog('helper', c.range),
  },
  {
    id: 'media',
    group: 'media',
    icon: Image,
    label: 'cmd_media',
    keywords: 'bild audio video datei upload media',
    run: (c) => c.openDialog('media', c.range),
  },
  {
    id: 'entity',
    group: 'media',
    icon: FileText,
    label: 'cmd_entity',
    keywords: 'verweis kurs material aufgabe projekt prüfung verknüpfung',
    run: (c) => c.openDialog('entity', c.range),
  },
  {
    id: 'notelink',
    group: 'media',
    icon: Link2,
    label: 'cmd_notelink',
    keywords: 'notiz link wiki verweis',
    run: ({ editor, range }) => editor.chain().focus().deleteRange(range).insertContent('[[').run(),
  },
]

export function filterCommands(query: string, t: (key: Keys<'editor'>) => string): BlockCommand[] {
  const needle = query.trim().toLocaleLowerCase()
  if (!needle) return blockCommands
  return blockCommands.filter((command) =>
    `${t(command.label)} ${command.keywords}`.toLocaleLowerCase().includes(needle),
  )
}

/** The text before the caret decides whether a menu is open: "/query" in an empty-start block or "[[query". */
export type Trigger = { kind: 'slash' | 'wiki'; from: number; to: number; query: string }
export function triggerAt(editor: Editor): Trigger | null {
  const { $from, empty } = editor.state.selection
  if (!empty || !$from.parent.isTextblock || $from.parent.type.name === 'codeBlock') return null
  const text = $from.parent.textBetween(0, $from.parentOffset, undefined, '￼')
  const wiki = text.match(/\[\[([^\]\n]*)$/)
  if (wiki) return { kind: 'wiki', from: $from.pos - wiki[0].length, to: $from.pos, query: wiki[1] }
  const slash = text.match(/^\/([^\n]*)$/)
  return slash ? { kind: 'slash', from: $from.start(), to: $from.pos, query: slash[1] } : null
}

export type TopBlock = { node: PMNode; pos: number; index: number }
export function topBlockAt(editor: Editor, position: number): TopBlock | null {
  let found: TopBlock | null = null
  editor.state.doc.forEach((node, pos, index) => {
    if (position >= pos && position < pos + node.nodeSize) found = { node, pos, index }
  })
  return found
}

/** Replace a typed trigger with a finished wiki link. */
export function insertWikiLink(editor: Editor, range: Range, title: string) {
  editor
    .chain()
    .focus()
    .insertContentAt(range, [
      { type: 'wikiLink', attrs: { title } },
      { type: 'text', text: ' ' },
    ])
    .run()
}

export function moveBlock(editor: Editor, pos: number, direction: -1 | 1): boolean {
  const { doc } = editor.state
  const block = topBlockAt(editor, pos)
  if (!block) return false
  const neighbour = doc.maybeChild(block.index + direction)
  if (!neighbour) return false
  const tr = editor.state.tr
  if (direction === -1) {
    const before = pos - neighbour.nodeSize
    tr.delete(pos, pos + block.node.nodeSize).insert(before, block.node)
    tr.setSelection(TextSelection.near(tr.doc.resolve(before + 1)))
  } else {
    const after = pos + neighbour.nodeSize
    tr.insert(pos + block.node.nodeSize + neighbour.nodeSize, block.node).delete(pos, pos + block.node.nodeSize)
    tr.setSelection(TextSelection.near(tr.doc.resolve(after + 1)))
  }
  editor.view.dispatch(tr.scrollIntoView())
  return true
}

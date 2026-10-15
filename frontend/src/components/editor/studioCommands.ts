// SPDX-License-Identifier: AGPL-3.0-or-later

import type { TypedT } from '@/i18n/useT'
import type { Node as PMNode } from '@tiptap/pm/model'
import { TextSelection } from '@tiptap/pm/state'
import type { Editor } from '@tiptap/react'
import {
  Braces,
  ChevronRight,
  Highlighter,
  CheckSquare,
  Code2,
  Heading,
  Link2,
  List,
  ListOrdered,
  Minus,
  Plus,
  Quote,
  Sigma,
  Table2,
  Upload,
} from 'lucide-react'
import { calloutKinds } from './extensions'
import { calloutIcons } from './callouts'
import type { MathTemplate } from './mathTemplates'
import { studyToolKeys } from './studyCommands'
import type { StudyTool } from './StudyHelperDialog'
export type Command = { id: string; label: string; icon: typeof Plus; run: (editor: Editor) => void }
export type Popup = { kind: 'slash' | 'wiki'; from: number; to: number; query: string }
export type Entity = { id: string | number; name?: string; title?: string; filename?: string }
export type TopBlock = { node: PMNode; pos: number; index: number }
export function currentBlock(editor: Editor): TopBlock | null {
  const from = editor.state.selection.from
  let selected: TopBlock | null = null
  editor.state.doc.forEach((node, pos, index) => {
    if (from >= pos && from < pos + node.nodeSize) selected = { node, pos, index }
  })
  return selected
}
export function popupAt(editor: Editor): Popup | null {
  const { $from, empty } = editor.state.selection
  if (!empty || !$from.parent.isTextblock || $from.parent.type.name === 'codeBlock') return null
  const text = $from.parent.textBetween(0, $from.parentOffset, undefined, '\ufffc')
  const wiki = text.match(/\[\[([^\]\n]*)$/)
  if (wiki) return { kind: 'wiki', from: $from.pos - wiki[0].length, to: $from.pos, query: wiki[1] }
  const slash = text.match(/^\/([^\n]*)$/)
  return slash ? { kind: 'slash', from: $from.start(), to: $from.pos, query: slash[1] } : null
}
export type StudioInsertKind =
  'grid' | 'entity' | 'media' | 'math' | 'equation' | 'truth' | 'tools' | MathTemplate | StudyTool
export function makeCommands(t: TypedT<'notes'>, open: (kind: StudioInsertKind) => void): Command[] {
  return [
    {
      id: 'highlight',
      label: t('highlight.toggle'),
      icon: Highlighter,
      run: (editor) => {
        editor.chain().focus().toggleMark('learningHighlight', { color: 'yellow' }).run()
      },
    },
    {
      id: 'fold',
      label: t('fold.insert'),
      icon: ChevronRight,
      run: (editor) => {
        editor
          .chain()
          .focus()
          .wrapIn('foldSection', { label: t('fold.defaultTitle') })
          .run()
      },
    },
    ...([1, 2, 3, 4, 5, 6] as const).map((level) => ({
      id: `h${level}`,
      label: t('studio.heading', { level }),
      icon: Heading,
      run: (editor: Editor) => {
        editor.chain().focus().setHeading({ level }).run()
      },
    })),
    {
      id: 'paragraph',
      label: t('studio.paragraph'),
      icon: Braces,
      run: (e) => {
        e.chain().focus().setParagraph().run()
      },
    },
    {
      id: 'list',
      label: t('cmdListLabel'),
      icon: List,
      run: (e) => {
        e.chain().focus().toggleBulletList().run()
      },
    },
    {
      id: 'ordered',
      label: t('studio.orderedList'),
      icon: ListOrdered,
      run: (e) => {
        e.chain().focus().toggleOrderedList().run()
      },
    },
    {
      id: 'task',
      label: t('studio.checklist'),
      icon: CheckSquare,
      run: (e) => {
        e.chain().focus().toggleTaskList().run()
      },
    },
    {
      id: 'code',
      label: t('cmdCodeLabel'),
      icon: Code2,
      run: (e) => {
        e.chain().focus().setCodeBlock({ language: 'plaintext' }).run()
      },
    },
    {
      id: 'table',
      label: t('cmdTableLabel'),
      icon: Table2,
      run: (e) => {
        e.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run()
      },
    },
    {
      id: 'quote',
      label: t('studio.quote'),
      icon: Quote,
      run: (e) => {
        e.chain().focus().toggleBlockquote().run()
      },
    },
    ...calloutKinds.map((kind) => ({
      id: kind,
      label: t(`studio.${kind}`),
      icon: calloutIcons[kind],
      run: (e: Editor) => {
        e.chain()
          .focus()
          .insertContent({ type: 'callout', attrs: { kind }, content: [{ type: 'paragraph' }] })
          .command(({ tr }) => {
            // InsertContent otherwise leaves the caret after the container. Place
            // it inside the new paragraph so typing and block options target it.
            let nearest = -1
            let distance = Number.POSITIVE_INFINITY
            tr.doc.descendants((node, pos) => {
              if (node.type.name === 'callout' && Math.abs(pos - tr.selection.from) < distance) {
                nearest = pos
                distance = Math.abs(pos - tr.selection.from)
              }
            })
            if (nearest >= 0) tr.setSelection(TextSelection.create(tr.doc, nearest + 2))
            return true
          })
          .run()
        e.view.focus()
      },
    })),
    {
      id: 'divider',
      label: t('studio.divider'),
      icon: Minus,
      run: (e) => {
        e.chain().focus().setHorizontalRule().run()
      },
    },
    { id: 'grid raster rechenraster', label: t('grid.title'), icon: Table2, run: () => open('grid') },
    { id: 'entity', label: t('studio.entity'), icon: Link2, run: () => open('entity') },
    { id: 'media', label: t('studio.media'), icon: Upload, run: () => open('media') },
    { id: 'math formula formel latex', label: t('math.inline'), icon: Sigma, run: () => open('math') },
    { id: 'equation gleichung', label: t('math.block'), icon: Sigma, run: () => open('equation') },
    { id: 'truth wahrheit logic logik', label: t('logic.title'), icon: Table2, run: () => open('truth') },
    ...(
      ['fraction', 'root', 'matrix', 'limit', 'derivative', 'partial', 'cases', 'steps', 'system', 'vector'] as const
    ).map((key) => ({
      id: `${key} ${key === 'limit' ? 'lim grenzwert' : ''}`,
      label: t(`math.${key}`),
      icon: Sigma,
      run: () => open(key),
    })),
    ...studyToolKeys.map((key) => ({
      id: `${key} ${key === 'number' ? 'bin hex zahlen' : key === 'code' ? 'trace codeablauf' : ''}`,
      label: t(`study.${key}`),
      icon: Table2,
      run: () => open(key),
    })),
  ]
}

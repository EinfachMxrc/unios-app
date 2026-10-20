// SPDX-License-Identifier: AGPL-3.0-or-later

import { Blockquote } from '@tiptap/extension-blockquote'
import { Extension, InputRule, mergeAttributes, wrappingInputRule, type Editor } from '@tiptap/core'
import CodeBlockLowlight from '@tiptap/extension-code-block-lowlight'
import TiptapLink from '@tiptap/extension-link'
import { ListItem, TaskItem, TaskList } from '@tiptap/extension-list'
import Placeholder from '@tiptap/extension-placeholder'
import { TableKit, TableView } from '@tiptap/extension-table'
import { Fragment, type Node as PMNodeType } from '@tiptap/pm/model'
import { Plugin, TextSelection } from '@tiptap/pm/state'
import { Markdown } from '@tiptap/markdown'
import StarterKit from '@tiptap/starter-kit'
import { common, createLowlight } from 'lowlight'
import { LearningHighlight } from '@/components/editor/learningHighlight'
import { BlockMath, InlineMath, LiteralDollar } from '@/components/editor/mathExtensions'
import { StudyBlock } from '@/components/editor/studyExtensions'
import { internalNoteHref } from '@/lib/noteLinks'
import { MAX_NOTE_LENGTH, newBlockId } from './doc'
import { BlockKeys, indentEnclosingList } from './blockKeys'
import { Callout, Entity, Media, Toggle, WikiLink } from './nodes'

const lowlight = createLowlight(common)

/** Node types that carry a stable block id; list containers do not, their items do. */
const IDENTIFIED = [
  'paragraph',
  'heading',
  'blockquote',
  'codeBlock',
  'horizontalRule',
  'listItem',
  'taskItem',
  'callout',
  'toggle',
  'table',
  'entity',
  'media',
  'blockMath',
  'studyBlock',
]

/** Blocks that lack an id or repeat another block's id; table cell contents are not blocks. */
function missingIds(doc: PMNodeType): { pos: number; id: string }[] {
  const seen = new Set<string>()
  const fixes: { pos: number; id: string }[] = []
  doc.descendants((node, pos) => {
    if (!IDENTIFIED.includes(node.type.name)) return
    const parent = doc.resolve(pos).parent.type.name
    if (parent === 'tableCell' || parent === 'tableHeader') return false
    const id = node.attrs.blockId
    if (typeof id === 'string' && id && !seen.has(id)) seen.add(id)
    else fixes.push({ pos, id: newBlockId() })
    return
  })
  return fixes
}

/**
 * A document that starts without ids (imported text) is identified before anyone edits it,
 * so the first typed character never has to change attributes as well.
 */
export function assignMissingIds(editor: Editor): void {
  const fixes = missingIds(editor.state.doc)
  if (!fixes.length || editor.isDestroyed) return
  const tr = editor.state.tr
  for (const { pos, id } of fixes) tr.setNodeMarkup(pos, undefined, { ...tr.doc.nodeAt(pos)?.attrs, blockId: id })
  editor.view.dispatch(tr.setMeta('addToHistory', false))
}

/**
 * Every block keeps an id for as long as it lives. Splitting a block (Enter) or pasting
 * produces nodes without or with repeated ids; they get fresh ones right in the same step.
 */
const BlockIds = Extension.create({
  name: 'blockIds',
  addGlobalAttributes: () => [
    {
      types: IDENTIFIED,
      attributes: { blockId: { default: null, rendered: false, keepOnSplit: false } },
    },
  ],
  onCreate() {
    assignMissingIds(this.editor)
  },
  addProseMirrorPlugins() {
    return [
      new Plugin({
        appendTransaction(transactions, _old, state) {
          if (!transactions.some((transaction) => transaction.docChanged)) return null
          // Typing "$$x$$" converts in one undoable step. Any follow-up change would make that
          // step impossible to take back, so new blocks get their id with the next transaction.
          if (
            transactions.some(
              (transaction) => transaction.getMeta('inputRule') || transaction.getMeta('applyInputRules'),
            )
          )
            return null
          const fixes = missingIds(state.doc)
          if (!fixes.length) return null
          const tr = state.tr
          for (const { pos, id } of fixes) {
            tr.setNodeMarkup(pos, undefined, { ...tr.doc.nodeAt(pos)?.attrs, blockId: id })
          }
          return tr.setMeta('addToHistory', false)
        },
      }),
    ]
  },
})

// Wide tables stay reachable by keyboard in both editing and reading.
class AccessibleTableView extends TableView {
  constructor(...args: ConstructorParameters<typeof TableView>) {
    super(...args)
    this.dom.tabIndex = 0
  }
}

/**
 * Tab on the first list item has nothing to sink under. Swallowing the key keeps focus
 * in the editor instead of jumping to the next control on the page.
 */
function keepFocus(editor: Editor, name: string, run: () => boolean): boolean {
  return run() || editor.isActive(name)
}

const listKeys = (name: string, editor: () => Editor) => ({
  Enter: () => editor().commands.splitListItem(name),
  Tab: () => keepFocus(editor(), name, () => editor().commands.sinkListItem(name) || indentEnclosingList(editor())),
  'Shift-Tab': () => keepFocus(editor(), name, () => editor().commands.liftListItem(name)),
})

// Notion types "> " for a toggle and a quotation mark for a quote.
const NoteBlockquote = Blockquote.extend({
  addInputRules() {
    return [wrappingInputRule({ find: /^\s*["„“”]\s$/, type: this.type })]
  },
})

const NoteListItem = ListItem.extend({
  addKeyboardShortcuts() {
    return listKeys(this.name, () => this.editor)
  },
})

// "- " already made a bullet when "[ ] " follows; turn just this item into a to-do.
const NoteTaskItem = TaskItem.extend({
  addKeyboardShortcuts() {
    return listKeys(this.name, () => this.editor)
  },
  addInputRules() {
    return [
      new InputRule({
        find: /^\[([ xX])\] $/,
        handler: ({ state, range, match }) => {
          const current = state.doc.resolve(range.from)
          if (
            current.depth < 3 ||
            current.parent.type.name !== 'paragraph' ||
            current.node(-1).type.name !== 'listItem' ||
            current.node(-2).type.name !== 'bulletList'
          )
            return null
          const tr = state.tr.delete(range.from, range.to)
          const at = tr.doc.resolve(range.from)
          const depth = at.depth - 2
          const list = at.node(depth)
          const index = at.index(depth)
          const items = Array.from({ length: list.childCount }, (_, i) => list.child(i))
          const before = index ? list.copy(Fragment.fromArray(items.slice(0, index))) : null
          const after = index + 1 < list.childCount ? list.copy(Fragment.fromArray(items.slice(index + 1))) : null
          const task = state.schema.nodes.taskList.create(
            null,
            this.type.create(
              { checked: match[1].toLowerCase() === 'x', blockId: at.node(depth + 1).attrs.blockId },
              at.node(depth + 1).content,
            ),
          )
          const start = at.before(depth)
          tr.replaceWith(
            start,
            start + list.nodeSize,
            Fragment.fromArray([...(before ? [before] : []), task, ...(after ? [after] : [])]),
          )
          tr.setSelection(TextSelection.create(tr.doc, start + (before?.nodeSize ?? 0) + 3))
        },
      }),
      ...(this.parent?.() ?? []),
    ]
  },
})

// A `target="_blank"` anchor makes the desktop shell open the system browser behind the app.
// Links inside UniOS therefore carry no target.
const NoteLink = TiptapLink.extend({
  renderHTML({ HTMLAttributes }) {
    const internal = internalNoteHref(HTMLAttributes.href ?? null) !== null
    const attributes = internal ? { ...HTMLAttributes, target: null, rel: null } : HTMLAttributes
    if (
      !this.options.isAllowedUri(HTMLAttributes.href, {
        defaultValidate: (href: string) => !!href,
        protocols: this.options.protocols,
        defaultProtocol: this.options.defaultProtocol,
      })
    )
      return ['a', mergeAttributes(this.options.HTMLAttributes, { ...attributes, href: '' }), 0]
    return ['a', mergeAttributes(this.options.HTMLAttributes, attributes), 0]
  },
})

/** Reject an oversized edit before it touches the document or the undo history. */
const SizeLimit = Extension.create<{ rejected: () => void }>({
  name: 'sizeLimit',
  addOptions: () => ({ rejected: () => undefined }),
  addProseMirrorPlugins() {
    const rejected = this.options.rejected
    const length = (doc: {
      textBetween: (from: number, to: number, block: string, leaf: string) => string
      content: { size: number }
    }) => doc.textBetween(0, doc.content.size, '\n', ' ').length
    return [
      new Plugin({
        filterTransaction(transaction, state) {
          if (!transaction.docChanged) return true
          const next = length(transaction.doc)
          if (next <= MAX_NOTE_LENGTH || next <= length(state.doc)) return true
          queueMicrotask(rejected)
          return false
        },
      }),
    ]
  },
})

export function editorExtensions(
  placeholder = '',
  rejected: () => void = () => undefined,
  checkboxLabel?: (text: string) => string,
) {
  return [
    StarterKit.configure({
      codeBlock: false,
      heading: { levels: [1, 2, 3, 4, 5, 6] },
      link: false,
      listItem: false,
      blockquote: false,
    }),
    BlockIds,
    BlockKeys,
    NoteBlockquote,
    NoteLink.configure({
      openOnClick: false,
      autolink: true,
      protocols: ['http', 'https'],
      isAllowedUri: (url) => /^https?:\/\//i.test(url) || internalNoteHref(url) !== null,
    }),
    NoteListItem,
    CodeBlockLowlight.configure({ lowlight, defaultLanguage: 'plaintext' }),
    TableKit.configure({ table: { resizable: false, View: AccessibleTableView } }),
    TaskList,
    NoteTaskItem.configure({
      nested: true,
      HTMLAttributes: { 'data-type': 'taskItem' },
      a11y: { checkboxLabel: (node) => checkboxLabel?.(node.textContent) ?? node.textContent },
    }),
    SizeLimit.configure({ rejected }),
    Placeholder.configure({ placeholder }),
    Callout,
    Toggle,
    Entity,
    Media,
    WikiLink,
    BlockMath,
    InlineMath,
    LiteralDollar,
    StudyBlock,
    LearningHighlight,
    // Only used to turn the Markdown output of the study helpers into blocks.
    Markdown.configure({ markedOptions: { gfm: true }, indentation: { style: 'space', size: 2 } }),
  ]
}

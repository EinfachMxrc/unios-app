// SPDX-License-Identifier: AGPL-3.0-or-later

import { Extension, type Editor } from '@tiptap/core'
import { Fragment, NodeRange, type Node as PMNode } from '@tiptap/pm/model'
import { NodeSelection, Plugin, TextSelection, type EditorState, type Transaction } from '@tiptap/pm/state'
import { liftTarget } from '@tiptap/pm/transform'
import { Decoration, DecorationSet } from '@tiptap/pm/view'

/** Deepest nesting Tab creates; the stored document allows eight levels. */
export const MAX_INDENT = 6

const INDENTABLE = [
  'paragraph',
  'heading',
  'blockquote',
  'codeBlock',
  'horizontalRule',
  'callout',
  'toggle',
  'table',
  'entity',
  'media',
  'blockMath',
  'studyBlock',
  'bulletList',
  'orderedList',
  'taskList',
]
/** These blocks hold their children inside themselves; Tab moves a block into them. */
const CONTAINERS = ['blockquote', 'callout', 'toggle']
const LISTS = ['bulletList', 'orderedList', 'taskList']
const LIST_ITEMS = ['listItem', 'taskItem']

const indentOf = (node: PMNode): number => (typeof node.attrs.indent === 'number' ? node.attrs.indent : 0)

type Context = { parent: PMNode; start: number; index: number; node: PMNode; pos: number }

/** The block Tab and the block shortcuts act on: the caret's block, or the selected block itself. */
function contextAt(state: EditorState): Context | null {
  const { selection } = state
  if (selection instanceof NodeSelection && INDENTABLE.includes(selection.node.type.name)) {
    const $pos = selection.$from
    const parentName = $pos.parent.type.name
    if (parentName === 'doc' || CONTAINERS.includes(parentName) || LIST_ITEMS.includes(parentName))
      return {
        parent: $pos.parent,
        start: $pos.start(),
        index: $pos.index(),
        node: selection.node,
        pos: selection.from,
      }
  }
  const $pos = selection.$from
  for (let depth = $pos.depth; depth >= 1; depth--) {
    const name = $pos.node(depth).type.name
    if (name === 'tableCell' || name === 'tableHeader') return null
    if (!INDENTABLE.includes(name)) continue
    const parent = $pos.node(depth - 1)
    const parentName = parent.type.name
    if (LIST_ITEMS.includes(parentName)) {
      // The first paragraph of a list item is the item's own text; the list keymap owns it.
      if ($pos.index(depth - 1) === 0) return null
    } else if (parentName !== 'doc' && !CONTAINERS.includes(parentName)) continue
    return {
      parent,
      start: $pos.start(depth - 1),
      index: $pos.index(depth - 1),
      node: $pos.node(depth),
      pos: $pos.before(depth),
    }
  }
  return null
}

function offsets(context: Context): number[] {
  const out: number[] = []
  let cursor = context.start
  context.parent.forEach((child) => {
    out.push(cursor)
    cursor += child.nodeSize
  })
  out.push(cursor)
  return out
}

/** A block together with everything nested under it: the blocks that follow with a deeper indent. */
function subtreeEnd(parent: PMNode, index: number): number {
  const level = indentOf(parent.child(index))
  let end = index + 1
  while (end < parent.childCount && indentOf(parent.child(end)) > level) end++
  return end
}

function previousSibling(parent: PMNode, index: number): number {
  const level = indentOf(parent.child(index))
  let at = index - 1
  while (at >= 0 && indentOf(parent.child(at)) > level) at--
  return at >= 0 && indentOf(parent.child(at)) === level ? at : -1
}

function shift(tr: Transaction, context: Context, from: number, to: number, by: number) {
  const marks = offsets(context)
  for (let i = from; i < to; i++) {
    const child = context.parent.child(i)
    tr.setNodeMarkup(marks[i], undefined, { ...child.attrs, indent: indentOf(child) + by })
  }
}

function indentBlock(editor: Editor, context: Context): boolean {
  const { parent, index, node } = context
  const level = indentOf(node)
  const end = subtreeEnd(parent, index)
  const prev = previousSibling(parent, index)
  if (prev < 0) return true
  const target = parent.child(prev)
  const marks = offsets(context)
  const tr = editor.state.tr
  if (CONTAINERS.includes(target.type.name) || LISTS.includes(target.type.name)) {
    const nodes: PMNode[] = []
    for (let i = index; i < end; i++) {
      const child = parent.child(i)
      nodes.push(child.type.create({ ...child.attrs, indent: indentOf(child) - level }, child.content, child.marks))
    }
    const insertAt = LISTS.includes(target.type.name) ? marks[prev + 1] - 2 : marks[prev + 1] - 1
    tr.delete(marks[index], marks[end]).insert(insertAt, Fragment.fromArray(nodes))
    tr.setSelection(TextSelection.near(tr.doc.resolve(insertAt + 1)))
  } else {
    let deepest = 0
    for (let i = index; i < end; i++) deepest = Math.max(deepest, indentOf(parent.child(i)))
    if (deepest + 1 > MAX_INDENT) return true
    shift(tr, context, index, end, 1)
  }
  editor.view.dispatch(tr.scrollIntoView())
  return true
}

function outdentBlock(editor: Editor, context: Context): boolean {
  const { parent, index, node } = context
  const end = subtreeEnd(parent, index)
  const tr = editor.state.tr
  if (indentOf(node) > 0) {
    shift(tr, context, index, end, -1)
  } else if (parent.type.name !== 'doc') {
    const marks = offsets(context)
    const range = new NodeRange(
      tr.doc.resolve(marks[index]),
      tr.doc.resolve(marks[end]),
      tr.doc.resolve(marks[index]).depth,
    )
    const target = liftTarget(range)
    if (target === null) return true
    tr.lift(range, target)
  } else {
    return true
  }
  editor.view.dispatch(tr.scrollIntoView())
  return true
}

/** Move a block with everything nested under it above or below its neighbour at the same level. */
function moveBlock(editor: Editor, context: Context, direction: -1 | 1): boolean {
  const { parent, index, node } = context
  const level = indentOf(node)
  const end = subtreeEnd(parent, index)
  const marks = offsets(context)
  const tr = editor.state.tr
  const caret = editor.state.selection.from - marks[index]
  let landing: number
  if (direction === -1) {
    const prev = previousSibling(parent, index)
    if (prev < 0) return true
    const content = tr.doc.slice(marks[index], marks[end]).content
    tr.delete(marks[index], marks[end]).insert(marks[prev], content)
    landing = marks[prev]
  } else {
    if (end >= parent.childCount || indentOf(parent.child(end)) < level) return true
    const after = marks[subtreeEnd(parent, end)]
    const content = tr.doc.slice(marks[index], marks[end]).content
    tr.insert(after, content).delete(marks[index], marks[end])
    landing = tr.mapping.map(after) - (marks[end] - marks[index])
  }
  const selection = editor.state.selection
  tr.setSelection(
    selection instanceof NodeSelection
      ? NodeSelection.create(tr.doc, landing)
      : TextSelection.near(tr.doc.resolve(Math.max(1, landing + caret))),
  )
  editor.view.dispatch(tr.scrollIntoView())
  return true
}

function duplicateBlock(editor: Editor, context: Context): boolean {
  const { parent, index } = context
  const end = subtreeEnd(parent, index)
  const marks = offsets(context)
  const tr = editor.state.tr
  // The copy repeats the ids; the block-id plugin hands out fresh ones in the same step.
  tr.insert(marks[end], tr.doc.slice(marks[index], marks[end]).content)
  tr.setSelection(TextSelection.near(tr.doc.resolve(marks[end] + 1)))
  editor.view.dispatch(tr.scrollIntoView())
  return true
}

function toggleCurrent(editor: Editor): boolean {
  const { $from } = editor.state.selection
  for (let depth = $from.depth; depth >= 1; depth--) {
    const node = $from.node(depth)
    if (node.type.name === 'taskItem') {
      return editor.commands.updateAttributes('taskItem', { checked: node.attrs.checked !== true })
    }
    if (node.type.name === 'toggle') {
      return editor.commands.updateAttributes('toggle', { open: node.attrs.open === false })
    }
  }
  return false
}

/**
 * Notion's block keyboard: Tab nests any block under the one above, Shift+Tab undoes it, blocks move
 * and duplicate with their children, Mod+Alt+digit turns the block into another type and Mod+Enter
 * checks a to-do or folds a toggle. Nesting is the `indent` attribute; the stored document turns it
 * into real child blocks.
 */
export const BlockKeys = Extension.create({
  name: 'blockKeys',
  priority: 1000,
  addGlobalAttributes: () => [
    { types: INDENTABLE, attributes: { indent: { default: 0, rendered: false, keepOnSplit: true } } },
  ],
  addProseMirrorPlugins() {
    return [
      new Plugin({
        // A block may sit at most one level deeper than the one above it; removing a parent
        // therefore pulls its children back up in the same undoable step.
        appendTransaction(transactions, _old, state) {
          if (!transactions.some((transaction) => transaction.docChanged)) return null
          const tr = state.tr
          const walk = (parent: PMNode, start: number) => {
            const own = LIST_ITEMS.includes(parent.type.name)
            let cursor = start
            let previous = -1
            parent.forEach((child, _offset, index) => {
              if (INDENTABLE.includes(child.type.name) && !(own && index === 0)) {
                const allowed = previous < 0 ? 0 : previous + 1
                if (indentOf(child) > allowed) tr.setNodeMarkup(cursor, undefined, { ...child.attrs, indent: allowed })
                previous = Math.min(indentOf(child), allowed)
              } else previous = own && index === 0 ? 0 : -1
              if (CONTAINERS.includes(child.type.name) || LISTS.includes(child.type.name)) walk(child, cursor + 1)
              else if (LIST_ITEMS.includes(child.type.name)) walk(child, cursor + 1)
              cursor += child.nodeSize
            })
          }
          walk(state.doc, 0)
          return tr.docChanged ? tr : null
        },
        props: {
          decorations(state) {
            const decorations: Decoration[] = []
            state.doc.descendants((node, pos) => {
              const level = indentOf(node)
              if (level > 0)
                decorations.push(
                  Decoration.node(pos, pos + node.nodeSize, {
                    'data-indent': String(level),
                    style: `--note-indent: ${level}`,
                  }),
                )
              return !node.isTextblock
            })
            return DecorationSet.create(state.doc, decorations)
          },
        },
      }),
    ]
  },
  addKeyboardShortcuts() {
    const code = codeKeys(this.editor)
    const inCode = () => this.editor.state.selection.$from.parent.type.name === 'codeBlock'
    const withBlock = (run: (context: Context) => boolean) => () => {
      if (!this.editor.isEditable || inCode()) return false
      const context = contextAt(this.editor.state)
      return context ? run(context) : false
    }
    return {
      // Code keeps its own indentation; Tab must not leave the block.
      Tab: () => code.Tab() || withBlock((context) => indentBlock(this.editor, context))(),
      'Shift-Tab': () => code['Shift-Tab']() || withBlock((context) => outdentBlock(this.editor, context))(),
      // As in Notion, Backspace at the start of a nested block and Enter in an empty one step back out first.
      Backspace: withBlock((context) => {
        const { selection } = this.editor.state
        if (!selection.empty || selection.$from.parentOffset !== 0 || indentOf(context.node) === 0) return false
        return outdentBlock(this.editor, context)
      }),
      Enter: withBlock((context) => {
        const { $from } = this.editor.state.selection
        if (!$from.parent.isTextblock || $from.parent.content.size > 0 || indentOf(context.node) === 0) return false
        return outdentBlock(this.editor, context)
      }),
      'Mod-Shift-ArrowUp': withBlock((context) => moveBlock(this.editor, context, -1)),
      'Mod-Shift-ArrowDown': withBlock((context) => moveBlock(this.editor, context, 1)),
      'Mod-d': withBlock((context) => duplicateBlock(this.editor, context)),
      'Mod-Enter': () => this.editor.isEditable && toggleCurrent(this.editor),
      'Mod-Alt-0': () => this.editor.commands.setParagraph(),
      'Mod-Alt-1': () => this.editor.commands.toggleHeading({ level: 1 }),
      'Mod-Alt-2': () => this.editor.commands.toggleHeading({ level: 2 }),
      'Mod-Alt-3': () => this.editor.commands.toggleHeading({ level: 3 }),
      'Mod-Alt-4': () => this.editor.commands.toggleTaskList(),
      'Mod-Alt-5': () => this.editor.commands.toggleBulletList(),
      'Mod-Alt-6': () => this.editor.commands.toggleOrderedList(),
      'Mod-Alt-7': () => this.editor.commands.wrapIn('toggle'),
      'Mod-Alt-8': () => this.editor.commands.toggleCodeBlock(),
    }
  },
})

function codeKeys(editor: Editor) {
  const inCode = () => editor.isEditable && editor.state.selection.$from.parent.type.name === 'codeBlock'
  return {
    Tab: () => inCode() && editor.commands.insertContent('  '),
    'Shift-Tab': () => {
      if (!inCode()) return false
      const { $from } = editor.state.selection
      const line = $from.parent.textBetween(0, $from.parentOffset, '\n').split('\n').pop() ?? ''
      const remove = /^ {1,2}/.exec(line)?.[0].length ?? 0
      if (remove)
        editor.view.dispatch(editor.state.tr.delete($from.pos - line.length, $from.pos - line.length + remove))
      return true
    },
  }
}

/** Fallback for a list item that cannot sink further: the whole list is nested under the block above. */
export function indentEnclosingList(editor: Editor): boolean {
  const { $from } = editor.state.selection
  for (let depth = $from.depth; depth >= 1; depth--) {
    if (!LISTS.includes($from.node(depth).type.name)) continue
    const parent = $from.node(depth - 1)
    const parentName = parent.type.name
    if (parentName !== 'doc' && !CONTAINERS.includes(parentName) && !LIST_ITEMS.includes(parentName)) return false
    return indentBlock(editor, {
      parent,
      start: $from.start(depth - 1),
      index: $from.index(depth - 1),
      node: $from.node(depth),
      pos: $from.before(depth),
    })
  }
  return false
}

function topContext(editor: Editor, position: number): Context | null {
  const { doc } = editor.state
  let found: Context | null = null
  doc.forEach((node, pos, index) => {
    if (position >= pos && position < pos + node.nodeSize) found = { parent: doc, start: 0, index, node, pos }
  })
  return found
}

/** Block-menu actions: the block and everything nested under it move, copy and disappear together. */
export function moveBlockAt(editor: Editor, position: number, direction: -1 | 1): boolean {
  const context = topContext(editor, position)
  return context ? moveBlock(editor, context, direction) : false
}

export function duplicateBlockAt(editor: Editor, position: number): boolean {
  const context = topContext(editor, position)
  return context ? duplicateBlock(editor, context) : false
}

export function deleteBlockAt(editor: Editor, position: number): boolean {
  const context = topContext(editor, position)
  if (!context) return false
  const marks = offsets(context)
  editor.view.dispatch(editor.state.tr.delete(marks[context.index], marks[subtreeEnd(context.parent, context.index)]))
  // A document must keep one paragraph to write in.
  if (editor.state.doc.childCount === 0) editor.commands.setContent({ type: 'doc', content: [{ type: 'paragraph' }] })
  return true
}

export type TurnInto = 'text' | 'h1' | 'h2' | 'h3' | 'todo' | 'bullet' | 'numbered' | 'toggle' | 'quote' | 'code'
export const turnIntoKinds: TurnInto[] = [
  'text',
  'h1',
  'h2',
  'h3',
  'todo',
  'bullet',
  'numbered',
  'toggle',
  'quote',
  'code',
]

/** The block menu's "Turn into": the block at this position becomes another text block type. */
export function turnBlockInto(editor: Editor, position: number, kind: TurnInto): boolean {
  const context = topContext(editor, position)
  if (!context?.node.isTextblock) return false
  const chain = editor
    .chain()
    .focus()
    .setTextSelection(context.pos + 1)
  switch (kind) {
    case 'text':
      return chain.setParagraph().run()
    case 'h1':
    case 'h2':
    case 'h3':
      return chain.setHeading({ level: Number(kind[1]) as 1 | 2 | 3 }).run()
    case 'todo':
      return chain.toggleTaskList().run()
    case 'bullet':
      return chain.toggleBulletList().run()
    case 'numbered':
      return chain.toggleOrderedList().run()
    case 'toggle':
      return chain.wrapIn('toggle').run()
    case 'quote':
      return chain.toggleBlockquote().run()
    case 'code':
      return chain.setCodeBlock().run()
  }
}

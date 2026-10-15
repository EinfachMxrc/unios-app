// SPDX-License-Identifier: AGPL-3.0-or-later
import { Node, createBlockMarkdownSpec, type Editor } from '@tiptap/core'
import { TextSelection } from '@tiptap/pm/state'
import { NodeViewContent, NodeViewWrapper, ReactNodeViewRenderer, type NodeViewProps } from '@tiptap/react'
import { ChevronRight } from 'lucide-react'
import { useId, useState } from 'react'
import { useT } from '@/i18n/useT'

export function exitFoldSection(editor: Editor, pos: number) {
  const node = editor.state.doc.nodeAt(pos)
  if (node?.type.name !== 'foldSection') return false
  const after = pos + node.nodeSize
  const tr = editor.state.tr
  if (editor.state.doc.resolve(after).nodeAfter?.type.name !== 'paragraph')
    tr.insert(after, editor.schema.nodes.paragraph.create())
  tr.setSelection(TextSelection.create(tr.doc, after + 1))
  editor.view.dispatch(tr.scrollIntoView())
  // Apply DOM focus now so immediate typing cannot land on the clicked button.
  editor.view.focus()
  return true
}

function FoldView({ node, editor, getPos }: NodeViewProps) {
  const { t } = useT('notes')
  const [open, setOpen] = useState(editor.isEditable)
  const id = useId()
  return (
    <NodeViewWrapper className="studio-fold" data-open={open}>
      <div contentEditable={false} className="studio-fold-header">
        <button
          type="button"
          aria-expanded={open}
          aria-controls={id}
          onClick={() => {
            if (open && editor.isEditable) {
              const pos = getPos()
              // Collapsing changes only view state. Never leave a typing cursor in hidden text.
              if (
                typeof pos === 'number' &&
                editor.state.selection.from > pos &&
                editor.state.selection.to < pos + node.nodeSize
              )
                editor.commands.setNodeSelection(pos)
            }
            setOpen((value) => !value)
          }}
        >
          <ChevronRight size={17} aria-hidden="true" />
          <span>{String(node.attrs.label || t('fold.defaultTitle'))}</span>
        </button>
      </div>
      <div id={id} className="studio-fold-body">
        <NodeViewContent />
      </div>
      {editor.isEditable && (
        <div contentEditable={false} className="studio-fold-footer">
          <button
            type="button"
            onClick={() => {
              const pos = getPos()
              if (typeof pos === 'number') exitFoldSection(editor, pos)
            }}
          >
            {t('fold.continue')}
          </button>
        </div>
      )}
    </NodeViewWrapper>
  )
}

/** Folded state stays on the device and never creates a new authoritative note version. */
export const FoldSection = Node.create({
  name: 'foldSection',
  group: 'block',
  content: 'block+',
  defining: true,
  isolating: true,
  addAttributes: () => ({ label: { default: '' } }),
  parseHTML: () => [
    { tag: 'section[data-fold-section]', getAttrs: (element) => ({ label: element.getAttribute('data-label') ?? '' }) },
  ],
  renderHTML: ({ node }) => ['section', { 'data-fold-section': '', 'data-label': node.attrs.label }, 0],
  addNodeView: () => ReactNodeViewRenderer(FoldView),
  addKeyboardShortcuts() {
    return {
      'Mod-Enter': () => {
        const { $from } = this.editor.state.selection
        if ($from.nodeAfter?.type.name === this.name) return exitFoldSection(this.editor, $from.pos)
        for (let depth = $from.depth; depth > 0; depth--)
          if ($from.node(depth).type.name === this.name) return exitFoldSection(this.editor, $from.before(depth))
        return false
      },
    }
  },
  ...createBlockMarkdownSpec({ nodeName: 'foldSection', allowedAttributes: ['label'], name: 'fold' }),
})

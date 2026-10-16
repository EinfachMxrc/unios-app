// SPDX-License-Identifier: AGPL-3.0-or-later

import type { Editor } from '@tiptap/core'
import { DragHandle } from '@tiptap/extension-drag-handle-react'
import { ArrowDown, ArrowUp, Copy, GripVertical, Plus, Trash2 } from 'lucide-react'
import { Popover } from 'radix-ui'
import { useState } from 'react'
import { useT } from '@/i18n/useT'
import { moveBlock, topBlockAt } from './commands'

/** Grip to drag a top-level block, "+" to start a new one, and the block actions menu. */
export function BlockHandle({ editor }: { editor: Editor }) {
  const { t } = useT('editor')
  const [position, setPosition] = useState<number | null>(null)
  const [menuOpen, setMenuOpen] = useState(false)

  function addBelow() {
    if (position === null) return
    const block = topBlockAt(editor, position)
    if (!block) return
    const end = block.pos + block.node.nodeSize
    editor
      .chain()
      .focus()
      .insertContentAt(end, { type: 'paragraph', content: [{ type: 'text', text: '/' }] })
      .run()
  }
  function duplicate() {
    if (position === null) return
    const block = topBlockAt(editor, position)
    if (!block) return
    // A copy repeats the ids; the block-id plugin gives the copy fresh ones in the same step.
    editor
      .chain()
      .focus()
      .insertContentAt(block.pos + block.node.nodeSize, block.node.toJSON())
      .run()
  }
  function remove() {
    if (position === null) return
    const block = topBlockAt(editor, position)
    if (!block) return
    const tr = editor.state.tr.delete(block.pos, block.pos + block.node.nodeSize)
    editor.view.dispatch(tr)
    // A document must keep one paragraph to write in.
    if (editor.state.doc.childCount === 0) editor.commands.setContent({ type: 'doc', content: [{ type: 'paragraph' }] })
  }

  const actions = [
    { id: 'up', icon: ArrowUp, label: t('moveUp'), run: () => position !== null && moveBlock(editor, position, -1) },
    {
      id: 'down',
      icon: ArrowDown,
      label: t('moveDown'),
      run: () => position !== null && moveBlock(editor, position, 1),
    },
    { id: 'copy', icon: Copy, label: t('duplicate'), run: duplicate },
    { id: 'delete', icon: Trash2, label: t('delete'), run: remove },
  ]

  return (
    <DragHandle editor={editor} nested onNodeChange={({ pos }) => setPosition(pos >= 0 ? pos : null)}>
      <div className="note-block-handle">
        <button
          type="button"
          className="note-handle-add"
          aria-label={t('addBlock')}
          title={t('addBlock')}
          onClick={addBelow}
        >
          <Plus size={16} aria-hidden="true" />
        </button>
        {/* A popover opens on click, so pressing and dragging the grip still moves the block. */}
        <Popover.Root open={menuOpen} onOpenChange={setMenuOpen}>
          <Popover.Trigger asChild>
            <button type="button" className="note-handle-grip" aria-label={t('blockActions')} title={t('dragBlock')}>
              <GripVertical size={16} aria-hidden="true" />
            </button>
          </Popover.Trigger>
          <Popover.Portal>
            <Popover.Content
              className="note-block-menu"
              role="menu"
              align="start"
              sideOffset={4}
              onCloseAutoFocus={(event) => {
                event.preventDefault()
                if (!editor.isDestroyed) editor.commands.focus()
              }}
            >
              {actions.map(({ id, icon: Icon, label, run }) => (
                <button
                  key={id}
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    run()
                    setMenuOpen(false)
                  }}
                >
                  <Icon size={16} aria-hidden="true" />
                  {label}
                </button>
              ))}
            </Popover.Content>
          </Popover.Portal>
        </Popover.Root>
      </div>
    </DragHandle>
  )
}

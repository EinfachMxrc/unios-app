// SPDX-License-Identifier: AGPL-3.0-or-later

import type { Editor } from '@tiptap/core'
import { DragHandle } from '@tiptap/extension-drag-handle-react'
import { ArrowDown, ArrowUp, Copy, GripVertical, Plus, Trash2 } from 'lucide-react'
import { DropdownMenu } from 'radix-ui'
import { useState } from 'react'
import { useT } from '@/i18n/useT'
import { moveBlock, topBlockAt } from './commands'

/** Grip to drag a top-level block, "+" to start a new one, and the block actions menu. */
export function BlockHandle({ editor }: { editor: Editor }) {
  const { t } = useT('editor')
  const [position, setPosition] = useState<number | null>(null)

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
        <DropdownMenu.Root>
          <DropdownMenu.Trigger asChild>
            <button type="button" className="note-handle-grip" aria-label={t('blockActions')} title={t('dragBlock')}>
              <GripVertical size={16} aria-hidden="true" />
            </button>
          </DropdownMenu.Trigger>
          <DropdownMenu.Portal>
            <DropdownMenu.Content className="note-block-menu" align="start" sideOffset={4}>
              <DropdownMenu.Item onSelect={() => position !== null && moveBlock(editor, position, -1)}>
                <ArrowUp size={16} aria-hidden="true" />
                {t('moveUp')}
              </DropdownMenu.Item>
              <DropdownMenu.Item onSelect={() => position !== null && moveBlock(editor, position, 1)}>
                <ArrowDown size={16} aria-hidden="true" />
                {t('moveDown')}
              </DropdownMenu.Item>
              <DropdownMenu.Item onSelect={duplicate}>
                <Copy size={16} aria-hidden="true" />
                {t('duplicate')}
              </DropdownMenu.Item>
              <DropdownMenu.Item onSelect={remove}>
                <Trash2 size={16} aria-hidden="true" />
                {t('delete')}
              </DropdownMenu.Item>
            </DropdownMenu.Content>
          </DropdownMenu.Portal>
        </DropdownMenu.Root>
      </div>
    </DragHandle>
  )
}

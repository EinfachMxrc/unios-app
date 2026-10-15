// SPDX-License-Identifier: AGPL-3.0-or-later

/*
 * The editor's controls, each a small component that only needs the editor.
 * NoteStudio keeps the document, saving and dialogs; these only read and
 * command the editor.
 */
import type { Editor } from '@tiptap/react'
import { TextSelection } from '@tiptap/pm/state'
import { ArrowDown, ArrowUp, Copy, Trash2, type LucideIcon } from 'lucide-react'
import { useT } from '@/i18n/useT'
import { calloutKinds } from './extensions'
import { currentBlock } from './studioCommands'
import { changeHighlight, highlightColor, highlightColors } from './learningHighlight'

const CODE_LANGUAGES = [
  'plaintext',
  'python',
  'javascript',
  'typescript',
  'java',
  'c',
  'cpp',
  'rust',
  'sql',
  'json',
  'css',
  'xml',
  'bash',
]

/** An icon button that never steals the editor's selection. */
export function StudioButton({
  label,
  icon: Icon,
  onClick,
  active = false,
  disabled = false,
}: {
  label: string
  icon: LucideIcon
  onClick: () => void
  active?: boolean
  disabled?: boolean
}) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      aria-pressed={active}
      disabled={disabled}
      onMouseDown={(event) => event.preventDefault()}
      onClick={onClick}
    >
      <Icon size={16} />
    </button>
  )
}

/** Settings of the block under the cursor: code language, callout kind, table rows and columns. */
export function StudioContextBars({ editor }: { editor: Editor }) {
  const { t } = useT('notes')
  return (
    <>
      {editor.isActive('learningHighlight') && (
        <div className="studio-contextbar">
          <label>
            {t('highlight.color')}{' '}
            <select
              aria-label={t('highlight.color')}
              value={highlightColor(editor.getAttributes('learningHighlight').color)}
              onChange={(event) => changeHighlight(editor, highlightColor(event.target.value))}
            >
              {highlightColors.map((color) => (
                <option key={color} value={color}>
                  {t(`highlight.${color}`)}
                </option>
              ))}
            </select>
          </label>
          <button type="button" onMouseDown={(event) => event.preventDefault()} onClick={() => changeHighlight(editor)}>
            {t('highlight.remove')}
          </button>
        </div>
      )}
      {editor.isActive('foldSection') && (
        <div className="studio-contextbar">
          <label>
            {t('fold.title')}{' '}
            <input
              maxLength={160}
              value={editor.getAttributes('foldSection').label || ''}
              onChange={(event) => editor.commands.updateAttributes('foldSection', { label: event.target.value })}
            />
          </label>
        </div>
      )}
      {editor.isActive('codeBlock') && (
        <div className="studio-contextbar">
          <label>
            {t('studio.language')}{' '}
            <select
              aria-label={t('studio.language')}
              value={editor.getAttributes('codeBlock').language || 'plaintext'}
              onChange={(event) =>
                editor.chain().focus().updateAttributes('codeBlock', { language: event.target.value }).run()
              }
            >
              {CODE_LANGUAGES.map((language) => (
                <option key={language}>{language}</option>
              ))}
            </select>
          </label>
        </div>
      )}
      {editor.isActive('callout') && (
        <div className="studio-contextbar">
          <label>
            {t('studio.calloutType')}{' '}
            <select
              value={editor.getAttributes('callout').kind}
              onChange={(event) =>
                editor.chain().focus().updateAttributes('callout', { kind: event.target.value }).run()
              }
            >
              {calloutKinds.map((kind) => (
                <option value={kind} key={kind}>
                  {t(`studio.${kind}`)}
                </option>
              ))}
            </select>
          </label>
          <label>
            {t('studio.blockName')}
            <input
              value={editor.getAttributes('callout').label || ''}
              maxLength={80}
              onChange={(event) => editor.commands.updateAttributes('callout', { label: event.target.value })}
            />
          </label>
        </div>
      )}
      {editor.isActive('table') && (
        <div className="studio-contextbar">
          <button type="button" onClick={() => editor.chain().focus().addRowAfter().run()}>
            {t('studio.addRow')}
          </button>
          <button type="button" onClick={() => editor.chain().focus().addColumnAfter().run()}>
            {t('studio.addColumn')}
          </button>
          <button type="button" onClick={() => editor.chain().focus().deleteRow().run()}>
            {t('studio.deleteRow')}
          </button>
          <button type="button" onClick={() => editor.chain().focus().deleteColumn().run()}>
            {t('studio.deleteColumn')}
          </button>
        </div>
      )}
    </>
  )
}

/** Headings of the note as a jump list beside the text. */
export function StudioOutline({ editor }: { editor: Editor }) {
  const { t } = useT('notes')
  const headings: { pos: number; level: number; text: string }[] = []
  editor.state.doc.descendants((node, pos) => {
    if (node.type.name === 'heading') headings.push({ pos, level: node.attrs.level, text: node.textContent })
  })
  return (
    <aside className="studio-outline" aria-label={t('studio.outline')}>
      <strong>{t('studio.outline')}</strong>
      {headings.length ? (
        headings.map((heading) => (
          <button
            type="button"
            key={heading.pos}
            data-level={heading.level}
            onClick={() =>
              editor
                .chain()
                .focus()
                .setTextSelection(heading.pos + 1)
                .scrollIntoView()
                .run()
            }
          >
            {heading.text || t('studio.untitledSection')}
          </button>
        ))
      ) : (
        <p>{t('studio.noSections')}</p>
      )}
    </aside>
  )
}

/** Move, duplicate or delete the top-level block under the cursor; the keyboard path to what dragging does. */
export function StudioBlockActions({ editor, disabled }: { editor: Editor; disabled: boolean }) {
  const { t } = useT('notes')
  const block = currentBlock(editor)
  if (!block) return null
  const current = block
  function moveBlock(destination: number) {
    if (destination < 0 || destination >= editor.state.doc.childCount || current.index === destination) return
    const positions: number[] = []
    editor.state.doc.forEach((_node, pos) => positions.push(pos))
    const target =
      destination < current.index
        ? positions[destination]
        : positions[destination] + editor.state.doc.child(destination).nodeSize
    const transaction = editor.state.tr.delete(current.pos, current.pos + current.node.nodeSize)
    const to = transaction.mapping.map(target)
    transaction.insert(to, current.node)
    transaction.setSelection(TextSelection.near(transaction.doc.resolve(to + 1)))
    editor.view.dispatch(transaction.scrollIntoView())
    editor.commands.focus()
  }
  const last = editor.state.doc.childCount - 1
  return (
    <div className="studio-block-actions" role="toolbar" aria-label={t('studio.blockActions')}>
      <span>{t('studio.activeBlock', { number: current.index + 1 })}</span>
      <StudioButton
        label={t('studio.moveUp')}
        icon={ArrowUp}
        onClick={() => moveBlock(current.index - 1)}
        disabled={disabled || current.index === 0}
      />
      <StudioButton
        label={t('studio.moveDown')}
        icon={ArrowDown}
        onClick={() => moveBlock(current.index + 1)}
        disabled={disabled || current.index === last}
      />
      <StudioButton
        label={t('studio.duplicate')}
        icon={Copy}
        disabled={disabled}
        onClick={() => editor.view.dispatch(editor.state.tr.insert(current.pos + current.node.nodeSize, current.node))}
      />
      <StudioButton
        label={t('studio.deleteBlock')}
        icon={Trash2}
        disabled={disabled}
        onClick={() =>
          editor
            .chain()
            .focus()
            .deleteRange({ from: current.pos, to: current.pos + current.node.nodeSize })
            .run()
        }
      />
    </div>
  )
}

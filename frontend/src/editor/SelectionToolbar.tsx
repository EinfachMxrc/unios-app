// SPDX-License-Identifier: AGPL-3.0-or-later

import type { Editor } from '@tiptap/core'
import { BubbleMenu } from '@tiptap/react/menus'
import {
  Bold,
  BookOpenCheck,
  Code,
  Highlighter,
  Italic,
  Link2,
  Strikethrough,
  Underline,
  Unlink,
  type LucideIcon,
} from 'lucide-react'
import { useState } from 'react'
import { useT } from '@/i18n/useT'

type Tool = { id: string; icon: LucideIcon; label: string; active: boolean; run: () => void }

/** Formatting for the current selection; appears where the text is selected. */
export function SelectionToolbar({
  editor,
  onCard,
}: {
  editor: Editor
  /** Present only when a flashcard can be made from the selection. */
  onCard?: () => void
}) {
  const { t } = useT('editor')
  const [linking, setLinking] = useState(false)
  const [url, setUrl] = useState('')
  const chain = () => editor.chain().focus()
  const tools: Tool[] = [
    {
      id: 'bold',
      icon: Bold,
      label: t('bold'),
      active: editor.isActive('bold'),
      run: () => chain().toggleBold().run(),
    },
    {
      id: 'italic',
      icon: Italic,
      label: t('italic'),
      active: editor.isActive('italic'),
      run: () => chain().toggleItalic().run(),
    },
    {
      id: 'underline',
      icon: Underline,
      label: t('underline'),
      active: editor.isActive('underline'),
      run: () => chain().toggleUnderline().run(),
    },
    {
      id: 'strike',
      icon: Strikethrough,
      label: t('strike'),
      active: editor.isActive('strike'),
      run: () => chain().toggleStrike().run(),
    },
    {
      id: 'code',
      icon: Code,
      label: t('inlineCode'),
      active: editor.isActive('code'),
      run: () => chain().toggleCode().run(),
    },
    {
      id: 'highlight',
      icon: Highlighter,
      label: t('highlight'),
      active: editor.isActive('learningHighlight'),
      run: () => chain().toggleMark('learningHighlight', { color: 'yellow' }).run(),
    },
  ]
  const link = editor.isActive('link')
  return (
    <BubbleMenu
      editor={editor}
      className="note-selection-toolbar"
      options={{ placement: 'top' }}
      shouldShow={({ editor: current, state }) =>
        current.isEditable &&
        !state.selection.empty &&
        !current.isActive('codeBlock') &&
        !current.isActive('blockMath') &&
        !current.isActive('studyBlock')
      }
    >
      <div role="toolbar" aria-label={t('formatting')}>
        {linking ? (
          <form
            className="note-link-form"
            onSubmit={(event) => {
              event.preventDefault()
              if (/^https?:\/\/\S+$/i.test(url)) chain().extendMarkRange('link').setLink({ href: url }).run()
              setLinking(false)
              setUrl('')
            }}
          >
            <input
              type="url"
              className="native-input"
              autoFocus
              aria-label={t('linkAddress')}
              placeholder="https://"
              value={url}
              onChange={(event) => setUrl(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Escape') {
                  event.stopPropagation()
                  setLinking(false)
                }
              }}
            />
            <button type="submit" disabled={!/^https?:\/\/\S+$/i.test(url)}>
              {t('applyLink')}
            </button>
          </form>
        ) : (
          <>
            {tools.map((tool) => (
              <button
                key={tool.id}
                type="button"
                aria-label={tool.label}
                title={tool.label}
                aria-pressed={tool.active}
                onMouseDown={(event) => event.preventDefault()}
                onClick={tool.run}
              >
                <tool.icon size={17} aria-hidden="true" />
              </button>
            ))}
            <button
              type="button"
              aria-label={link ? t('removeLink') : t('addLink')}
              title={link ? t('removeLink') : t('addLink')}
              aria-pressed={link}
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => (link ? chain().extendMarkRange('link').unsetLink().run() : setLinking(true))}
            >
              {link ? <Unlink size={17} aria-hidden="true" /> : <Link2 size={17} aria-hidden="true" />}
            </button>
            {onCard && (
              <button
                type="button"
                aria-label={t('makeCard')}
                title={t('makeCard')}
                onMouseDown={(event) => event.preventDefault()}
                onClick={onCard}
              >
                <BookOpenCheck size={17} aria-hidden="true" />
              </button>
            )}
          </>
        )}
      </div>
    </BubbleMenu>
  )
}

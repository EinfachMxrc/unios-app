// SPDX-License-Identifier: AGPL-3.0-or-later

import {
  Extension,
  InputRule,
  Node,
  createAtomBlockMarkdownSpec,
  createBlockMarkdownSpec,
  mergeAttributes,
} from '@tiptap/core'
import { Fragment } from '@tiptap/pm/model'
import { useContext } from 'react'
import { Plugin, TextSelection } from '@tiptap/pm/state'
import StarterKit from '@tiptap/starter-kit'
import TiptapLink from '@tiptap/extension-link'
import { Markdown } from '@tiptap/markdown'
import { TableKit, TableView } from '@tiptap/extension-table'
import { ListItem, TaskItem, TaskList } from '@tiptap/extension-list'
import CodeBlockLowlight from '@tiptap/extension-code-block-lowlight'
import Placeholder from '@tiptap/extension-placeholder'
import { NodeViewContent, NodeViewWrapper, ReactNodeViewRenderer, type Editor, type NodeViewProps } from '@tiptap/react'
import { common, createLowlight } from 'lowlight'
import { Link } from 'react-router-dom'
import { ArrowUpRight, FileText, ImageOff } from 'lucide-react'
import { useT } from '@/i18n/useT'
import { useApi } from '@/api'
import { StudyPeekLink } from '@/components/StudyPeekLink'
import { internalNoteHref } from '@/lib/noteLinks'
import { NoteLinkTargetsContext, noteTitleHasText } from '@/hooks/useNoteLinks'
import { BlockMath, InlineMath, LiteralDollar } from './mathExtensions'
import { StudyBlock } from './studyExtensions'
import { LearningHighlight } from './learningHighlight'
import { FoldSection } from './FoldSection'
import { calloutKinds, calloutIcons, type CalloutKind } from './callouts'
export { calloutKinds, type CalloutKind } from './callouts'

export const MAX_NOTE_LENGTH = 100_000

// Wide note tables remain reachable by keyboard in both editing and reading.
// The native scroll container adds no document attributes or editor shortcuts.
class AccessibleTableView extends TableView {
  constructor(...args: ConstructorParameters<typeof TableView>) {
    super(...args)
    this.dom.tabIndex = 0
  }
}
export const entityKinds = ['note', 'course', 'resource', 'topic', 'assignment', 'project', 'exam'] as const
export type EditorEntityKind = (typeof entityKinds)[number]
const lowlight = createLowlight(common)

/**
 * Tab/Shift-Tab on a list item with nothing to sink/lift into (typically the
 * first item in a list) leaves the key unhandled by default, so the browser's
 * native Tab navigation takes over and hands focus to the next element on the
 * page. Indenting the first item is correctly impossible — there is no
 * sibling to nest under — but losing editor focus over it is a trap, not a
 * no-op. Keep the key consumed whenever the cursor is still inside a list
 * item, even when the actual sink/lift command declines.
 */
function keepFocusWhenIndentFails(editor: Editor, name: string, run: () => boolean): boolean {
  return run() || editor.isActive(name)
}

// The dash has already become a bullet when the following "[ ] " is typed.
// Convert this item only, leaving surrounding bullets and nested content intact.
const TypedTaskItem = TaskItem.extend({
  addKeyboardShortcuts() {
    return {
      Enter: () => this.editor.commands.splitListItem(this.name),
      Tab: () => keepFocusWhenIndentFails(this.editor, this.name, () => this.editor.commands.sinkListItem(this.name)),
      'Shift-Tab': () =>
        keepFocusWhenIndentFails(this.editor, this.name, () => this.editor.commands.liftListItem(this.name)),
    }
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
            this.type.create({ checked: match[1].toLowerCase() === 'x' }, at.node(depth + 1).content),
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

const AppAwareListItem = ListItem.extend({
  addKeyboardShortcuts() {
    return {
      Enter: () => this.editor.commands.splitListItem(this.name),
      Tab: () => keepFocusWhenIndentFails(this.editor, this.name, () => this.editor.commands.sinkListItem(this.name)),
      'Shift-Tab': () =>
        keepFocusWhenIndentFails(this.editor, this.name, () => this.editor.commands.liftListItem(this.name)),
    }
  },
})

export function entityPath(kind: string, id: string): string | null {
  if (
    !entityKinds.includes(kind as EditorEntityKind) ||
    !/^(?:[1-9]\d*|[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/i.test(id)
  )
    return null
  return `/api/links/targets/${kind}/${encodeURIComponent(id)}`
}

export function safeMediaSource(value: unknown): value is string {
  return (
    typeof value === 'string' && /^\/api\/note-assets\/[0-9a-f-]{36}\.(png|jpg|webp|mp3|wav|ogg|mp4|webm)$/.test(value)
  )
}

function CalloutView({ node }: NodeViewProps) {
  const { t } = useT('notes')
  const kind: CalloutKind = calloutKinds.includes(node.attrs.kind) ? node.attrs.kind : 'note'
  const Icon = calloutIcons[kind]
  return (
    <NodeViewWrapper className="studio-callout" data-kind={kind}>
      <strong contentEditable={false}>
        <Icon size={18} aria-hidden="true" />
        <span>{String(node.attrs.label || t(`studio.${kind}`))}</span>
      </strong>
      <NodeViewContent />
    </NodeViewWrapper>
  )
}

function WikiView({ node }: NodeViewProps) {
  const { t } = useT('notes')
  const targets = useContext(NoteLinkTargetsContext)
  const title = String(node.attrs.title)
  const resolution = targets.get(title)
  return (
    <NodeViewWrapper as="span" contentEditable={false} className="studio-wiki">
      {resolution?.status === 'resolved' && resolution.target ? (
        <StudyPeekLink id={resolution.target.id} className="note-wikilink">
          {title}
        </StudyPeekLink>
      ) : (
        <span
          className="note-unresolved-link"
          title={
            resolution?.status === 'ambiguous'
              ? t('wikilinkAmbiguous')
              : resolution?.status === 'missing'
                ? t('wikilinkMissing')
                : resolution?.status === 'unavailable'
                  ? t('wikilinkUnavailable')
                  : t('wikilinkChecking')
          }
        >
          [[{title}]]
        </span>
      )}
    </NodeViewWrapper>
  )
}

function EntityView({ node }: NodeViewProps) {
  const { t } = useT('notes')
  const kind = entityKinds.includes(node.attrs.kind) ? (node.attrs.kind as EditorEntityKind) : null
  const fallback = kind ? entityPath(kind, String(node.attrs.id)) : null
  const target = useApi<{ url: string }>(fallback ?? '/api/links/targets/note/invalid', {
    enabled: !!fallback,
  })
  const path = target.data?.url?.startsWith('/') && !target.data.url.startsWith('//') ? target.data.url : null
  const label = String(node.attrs.label || node.attrs.id)
  return (
    <NodeViewWrapper contentEditable={false} className="studio-entity" data-type={kind}>
      <FileText size={19} aria-hidden="true" />
      <div>
        <small>{kind ? t(`studio.entity_${kind}`) : t('studio.unavailable')}</small>
        {path ? (
          <Link to={path}>
            {label}
            <ArrowUpRight size={16} />
          </Link>
        ) : (
          <span>{label}</span>
        )}
      </div>
    </NodeViewWrapper>
  )
}

function MediaView({ node }: NodeViewProps) {
  const { t } = useT('notes')
  const source = safeMediaSource(node.attrs.src) ? node.attrs.src : null
  const alt = String(node.attrs.alt || '')
  return (
    <NodeViewWrapper contentEditable={false} className="studio-media">
      {!source ? (
        <p>
          <ImageOff size={18} />
          {t('studio.unavailable')}
        </p>
      ) : node.attrs.kind === 'audio' ? (
        <audio controls preload="metadata" src={source} aria-label={alt || t('studio.audio')} />
      ) : node.attrs.kind === 'video' ? (
        <video controls preload="metadata" src={source} aria-label={alt || t('studio.video')} />
      ) : (
        <img src={source} alt={alt} loading="lazy" />
      )}
      {alt && <small>{alt}</small>}
    </NodeViewWrapper>
  )
}

function MarkdownImageView({ node }: NodeViewProps) {
  const { t } = useT('notes')
  const src = String(node.attrs.src || '')
  const local = safeMediaSource(src) || /^data:image\/(?:png|jpeg|webp);base64,[a-zA-Z0-9+/=]+$/.test(src)
  return (
    <NodeViewWrapper className="studio-media" contentEditable={false}>
      {local ? (
        <img src={src} alt={String(node.attrs.alt || '')} loading="lazy" />
      ) : (
        <p>
          <ImageOff size={18} />
          {String(node.attrs.alt || t('studio.externalImage'))}
          {/^https?:\/\//i.test(src) && (
            <a href={src} target="_blank" rel="noopener noreferrer">
              {t('studio.openImage')}
            </a>
          )}
        </p>
      )}
    </NodeViewWrapper>
  )
}

const MarkdownImage = Node.create({
  name: 'image',
  group: 'block',
  atom: true,
  addAttributes: () => ({ src: { default: '' }, alt: { default: '' }, title: { default: null } }),
  parseHTML: () => [
    {
      tag: 'img',
      getAttrs: (el) => ({ src: el.getAttribute('src'), alt: el.getAttribute('alt'), title: el.getAttribute('title') }),
    },
  ],
  renderHTML: ({ node }) => ['span', { 'data-image-source': node.attrs.src }, String(node.attrs.alt || '')],
  addNodeView: () => ReactNodeViewRenderer(MarkdownImageView),
  markdownTokenName: 'image',
  parseMarkdown: (token, helpers) =>
    helpers.createNode('image', { src: token.href, alt: token.text, title: token.title }),
  renderMarkdown: (node) =>
    `![${String(node.attrs?.alt || '').replace(/[[\]]/g, '\\$&')}](${String(node.attrs?.src || '')}${node.attrs?.title ? ` "${String(node.attrs.title).replace(/"/g, '\\"')}"` : ''})`,
})

const Callout = Node.create({
  name: 'callout',
  group: 'block',
  content: 'block+',
  defining: true,
  isolating: true,
  addAttributes: () => ({ kind: { default: 'note' }, label: { default: '' } }),
  parseHTML: () => [
    { tag: 'aside[data-callout]', getAttrs: (element) => ({ kind: element.getAttribute('data-callout') }) },
  ],
  renderHTML: ({ node }) => ['aside', { 'data-callout': node.attrs.kind }, 0],
  addNodeView: () => ReactNodeViewRenderer(CalloutView),
  ...createBlockMarkdownSpec({
    nodeName: 'callout',
    allowedAttributes: ['kind', 'label'],
    defaultAttributes: { kind: 'note' },
  }),
})

const Entity = Node.create({
  name: 'entity',
  group: 'block',
  atom: true,
  draggable: true,
  addAttributes: () => ({ kind: { default: 'note' }, id: { default: '' }, label: { default: '' } }),
  parseHTML: () => [
    {
      tag: 'div[data-unios-entity]',
      getAttrs: (el) => ({ kind: el.getAttribute('data-kind'), id: el.getAttribute('data-id'), label: el.textContent }),
    },
  ],
  renderHTML: ({ node }) => [
    'div',
    { 'data-unios-entity': '', 'data-kind': node.attrs.kind, 'data-id': node.attrs.id },
    String(node.attrs.label),
  ],
  addNodeView: () => ReactNodeViewRenderer(EntityView),
  ...createAtomBlockMarkdownSpec({
    nodeName: 'entity',
    allowedAttributes: ['kind', 'id', 'label'],
    requiredAttributes: ['kind', 'id'],
  }),
})

const Media = Node.create({
  name: 'media',
  group: 'block',
  atom: true,
  draggable: true,
  addAttributes: () => ({ src: { default: '' }, kind: { default: 'image' }, alt: { default: '' } }),
  parseHTML: () => [
    {
      tag: 'figure[data-unios-media]',
      getAttrs: (el) => ({ src: el.getAttribute('data-src'), kind: el.getAttribute('data-kind'), alt: el.textContent }),
    },
  ],
  renderHTML: ({ node }) => [
    'figure',
    {
      'data-unios-media': '',
      'data-src': safeMediaSource(node.attrs.src) ? node.attrs.src : '',
      'data-kind': node.attrs.kind,
    },
    String(node.attrs.alt),
  ],
  addNodeView: () => ReactNodeViewRenderer(MediaView),
  ...createAtomBlockMarkdownSpec({
    nodeName: 'media',
    allowedAttributes: ['src', 'kind', 'alt'],
    requiredAttributes: ['src'],
  }),
})

const WikiLink = Node.create({
  name: 'wikiLink',
  group: 'inline',
  inline: true,
  atom: true,
  addAttributes: () => ({ title: { default: '' } }),
  parseHTML: () => [{ tag: 'span[data-wiki]', getAttrs: (el) => ({ title: el.getAttribute('data-wiki') }) }],
  renderHTML: ({ node }) => ['span', { 'data-wiki': node.attrs.title }, String(node.attrs.title)],
  addNodeView: () => ReactNodeViewRenderer(WikiView),
  markdownTokenizer: {
    name: 'wikiLink',
    level: 'inline',
    start: (src) => src.indexOf('[['),
    tokenize(src) {
      const match = /^\[\[([^[\]\r\n]{1,200})\]\]/u.exec(src)
      return match && noteTitleHasText(match[1]) ? { type: 'wikiLink', raw: match[0], title: match[1] } : undefined
    },
  },
  parseMarkdown: (token, helpers) => helpers.createNode('wikiLink', { title: token.title }),
  renderMarkdown: (node) => `[[${String(node.attrs?.title).replace(/[\]\n]/g, '')}]]`,
})

// HTML in imported Markdown stays visible as inert source, never dropped or executed.
const RawMarkdown = Node.create({
  name: 'rawMarkdown',
  group: 'block',
  atom: true,
  addAttributes: () => ({ raw: { default: '' } }),
  parseHTML: () => [{ tag: 'pre[data-raw-markdown]', getAttrs: (el) => ({ raw: el.textContent }) }],
  renderHTML: ({ node }) => ['pre', { 'data-raw-markdown': '', class: 'studio-raw' }, String(node.attrs.raw)],
  markdownTokenName: 'html',
  parseMarkdown: (token, helpers) => helpers.createNode('rawMarkdown', { raw: token.raw }),
  renderMarkdown: (node) => String(node.attrs?.raw ?? ''),
})

// A `target="_blank"` anchor makes the desktop shell's webview treat the click as a
// new-window request; on some platforms that fires even after InAppLinks already
// handled it in JS, briefly opening the system browser behind the app. App screens
// navigate within the same window instead, so they never reach that native path.
const AppAwareLink = TiptapLink.extend({
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

// Reject an oversized edit before it touches the document or undo history.
const DocumentLimit = Extension.create<{ rejected: () => void }>({
  name: 'documentLimit',
  addOptions: () => ({ rejected: () => undefined }),
  addProseMirrorPlugins() {
    const editor = this.editor
    const rejected = this.options.rejected
    return [
      new Plugin({
        filterTransaction(transaction, state) {
          if (!transaction.docChanged || !editor.markdown) return true
          const next = editor.markdown.serialize(transaction.doc.toJSON())
          if (next.length <= MAX_NOTE_LENGTH || next.length <= editor.markdown.serialize(state.doc.toJSON()).length)
            return true
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
    }),
    AppAwareLink.configure({
      openOnClick: false,
      autolink: true,
      protocols: ['http', 'https'],
      isAllowedUri: (url) => /^https?:\/\//i.test(url) || internalNoteHref(url) !== null,
    }),
    AppAwareListItem,
    CodeBlockLowlight.configure({ lowlight, defaultLanguage: 'plaintext' }),
    TableKit.configure({ table: { resizable: false, View: AccessibleTableView } }),
    TaskList,
    TypedTaskItem.configure({
      nested: true,
      HTMLAttributes: { 'data-type': 'taskItem' },
      a11y: { checkboxLabel: (node) => checkboxLabel?.(node.textContent) ?? node.textContent },
    }),
    DocumentLimit.configure({ rejected }),
    Placeholder.configure({ placeholder }),
    Callout,
    FoldSection,
    LearningHighlight,
    Entity,
    Media,
    MarkdownImage,
    WikiLink,
    BlockMath,
    InlineMath,
    LiteralDollar,
    StudyBlock,
    RawMarkdown,
    Markdown.configure({ markedOptions: { gfm: true }, indentation: { style: 'space', size: 2 } }),
  ]
}

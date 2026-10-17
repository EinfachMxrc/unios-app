// SPDX-License-Identifier: AGPL-3.0-or-later

import { Node, mergeAttributes, wrappingInputRule } from '@tiptap/core'
import { NodeViewContent, NodeViewWrapper, ReactNodeViewRenderer, type NodeViewProps } from '@tiptap/react'
import { ArrowUpRight, ChevronRight, FileText, ImageOff } from 'lucide-react'
import { useContext } from 'react'
import { Link } from 'react-router-dom'
import { useApi } from '@/api'
import { calloutIcons, calloutKinds, type CalloutKind } from '@/components/editor/callouts'
import { StudyPeekLink } from '@/components/StudyPeekLink'
import { NoteLinkTargetsContext } from '@/hooks/useNoteLinks'
import { useT } from '@/i18n/useT'

export const entityKinds = ['note', 'course', 'resource', 'topic', 'assignment', 'project', 'exam'] as const
export type EntityKind = (typeof entityKinds)[number]

export function entityPath(kind: string, id: string): string | null {
  if (
    !entityKinds.includes(kind as EntityKind) ||
    !/^(?:[1-9]\d*|[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/i.test(id)
  )
    return null
  return `/api/links/targets/${kind}/${encodeURIComponent(id)}`
}

/** Only files the host itself stored are shown; foreign sources never load silently. */
export function safeMediaSource(value: unknown): value is string {
  return (
    typeof value === 'string' && /^\/api\/note-assets\/[0-9a-f-]{36}\.(png|jpg|webp|mp3|wav|ogg|mp4|webm)$/.test(value)
  )
}

function CalloutView({ node }: NodeViewProps) {
  const { t } = useT('editor')
  const kind: CalloutKind = calloutKinds.includes(node.attrs.kind) ? node.attrs.kind : 'note'
  const Icon = calloutIcons[kind]
  return (
    <NodeViewWrapper className="note-callout" data-kind={kind}>
      <strong contentEditable={false}>
        <Icon size={18} aria-hidden="true" />
        <span>{String(node.attrs.label || t(`callout_${kind}`))}</span>
      </strong>
      <NodeViewContent />
    </NodeViewWrapper>
  )
}

export const Callout = Node.create({
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
})

function ToggleView({ node, updateAttributes, editor }: NodeViewProps) {
  const { t } = useT('editor')
  const open = node.attrs.open !== false
  return (
    <NodeViewWrapper className="note-toggle" data-open={open}>
      <button
        type="button"
        contentEditable={false}
        className="note-toggle-button"
        aria-expanded={open}
        aria-label={t(open ? 'toggleClose' : 'toggleOpen')}
        onClick={() => {
          updateAttributes({ open: !open })
          if (editor.isEditable) editor.commands.focus()
        }}
      >
        <ChevronRight size={18} aria-hidden="true" />
      </button>
      <NodeViewContent className="note-toggle-body" />
    </NodeViewWrapper>
  )
}

/** First paragraph is the title; the rest folds away. `open` is view state, never stored. */
export const Toggle = Node.create({
  name: 'toggle',
  group: 'block',
  content: 'paragraph block*',
  defining: true,
  addAttributes: () => ({ open: { default: true, rendered: false } }),
  parseHTML: () => [{ tag: 'div[data-note-toggle]' }],
  renderHTML: () => ['div', { 'data-note-toggle': '' }, 0],
  addInputRules() {
    return [wrappingInputRule({ find: /^\s*>\s$/, type: this.type })]
  },
  addNodeView: () => ReactNodeViewRenderer(ToggleView),
})

function WikiView({ node }: NodeViewProps) {
  const { t } = useT('notes')
  const targets = useContext(NoteLinkTargetsContext)
  const title = String(node.attrs.title)
  const resolution = targets.get(title)
  return (
    <NodeViewWrapper as="span" contentEditable={false} className="note-wiki">
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

export const WikiLink = Node.create({
  name: 'wikiLink',
  group: 'inline',
  inline: true,
  atom: true,
  addAttributes: () => ({ title: { default: '' } }),
  parseHTML: () => [{ tag: 'span[data-wiki]', getAttrs: (el) => ({ title: el.getAttribute('data-wiki') }) }],
  renderHTML: ({ node }) => ['span', { 'data-wiki': node.attrs.title }, `[[${String(node.attrs.title)}]]`],
  renderText: ({ node }) => `[[${String(node.attrs.title)}]]`,
  addNodeView: () => ReactNodeViewRenderer(WikiView),
})

function EntityView({ node }: NodeViewProps) {
  const { t } = useT('editor')
  const kind = entityKinds.includes(node.attrs.kind) ? (node.attrs.kind as EntityKind) : null
  const fallback = kind ? entityPath(kind, String(node.attrs.id)) : null
  const target = useApi<{ url: string }>(fallback ?? '/api/links/targets/note/invalid', { enabled: !!fallback })
  const path = target.data?.url?.startsWith('/') && !target.data.url.startsWith('//') ? target.data.url : null
  const label = String(node.attrs.label || node.attrs.id)
  return (
    <NodeViewWrapper contentEditable={false} className="note-entity" data-type={kind}>
      <FileText size={19} aria-hidden="true" />
      <div>
        <small>{kind ? t(`entity_${kind}`) : t('unavailable')}</small>
        {path ? (
          <Link to={path}>
            {label}
            <ArrowUpRight size={16} aria-hidden="true" />
          </Link>
        ) : (
          <span>{label}</span>
        )}
      </div>
    </NodeViewWrapper>
  )
}

export const Entity = Node.create({
  name: 'entity',
  group: 'block',
  atom: true,
  draggable: true,
  addAttributes: () => ({ kind: { default: 'note' }, id: { default: '' }, label: { default: '' } }),
  parseHTML: () => [
    {
      tag: 'div[data-note-entity]',
      getAttrs: (el) => ({ kind: el.getAttribute('data-kind'), id: el.getAttribute('data-id'), label: el.textContent }),
    },
  ],
  renderHTML: ({ node }) => [
    'div',
    { 'data-note-entity': '', 'data-kind': node.attrs.kind, 'data-id': node.attrs.id },
    String(node.attrs.label),
  ],
  renderText: ({ node }) => String(node.attrs.label || node.attrs.id),
  addNodeView: () => ReactNodeViewRenderer(EntityView),
})

function MediaView({ node }: NodeViewProps) {
  const { t } = useT('editor')
  const source = safeMediaSource(node.attrs.src) ? node.attrs.src : null
  const alt = String(node.attrs.alt || '')
  const external = /^https?:\/\//i.test(String(node.attrs.src))
  return (
    <NodeViewWrapper contentEditable={false} className="note-media">
      {!source ? (
        <p>
          <ImageOff size={18} aria-hidden="true" />
          {alt || t('unavailable')}
          {external && (
            <a href={String(node.attrs.src)} target="_blank" rel="noopener noreferrer">
              {t('openSource')}
            </a>
          )}
        </p>
      ) : node.attrs.kind === 'audio' ? (
        <audio controls preload="metadata" src={source} aria-label={alt || t('mediaAudio')} />
      ) : node.attrs.kind === 'video' ? (
        <video controls preload="metadata" src={source} aria-label={alt || t('mediaVideo')} />
      ) : (
        <img src={source} alt={alt} loading="lazy" />
      )}
      {source && alt && <small>{alt}</small>}
    </NodeViewWrapper>
  )
}

export const Media = Node.create({
  name: 'media',
  group: 'block',
  atom: true,
  draggable: true,
  addAttributes: () => ({ src: { default: '' }, kind: { default: 'image' }, alt: { default: '' } }),
  parseHTML: () => [
    {
      tag: 'figure[data-note-media]',
      getAttrs: (el) => ({ src: el.getAttribute('data-src'), kind: el.getAttribute('data-kind'), alt: el.textContent }),
    },
  ],
  renderHTML: ({ node }) => [
    'figure',
    mergeAttributes({
      'data-note-media': '',
      'data-src': safeMediaSource(node.attrs.src) ? node.attrs.src : '',
      'data-kind': node.attrs.kind,
    }),
    String(node.attrs.alt),
  ],
  renderText: ({ node }) => String(node.attrs.alt || ''),
  addNodeView: () => ReactNodeViewRenderer(MediaView),
})

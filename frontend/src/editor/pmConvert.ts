// SPDX-License-Identifier: AGPL-3.0-or-later

import {
  newBlockId,
  normalizeBlock,
  type BlockType,
  type HighlightColor,
  type InlineNode,
  type Mark,
  type NoteBlock,
  type NoteDoc,
} from './doc'

/** Minimal ProseMirror JSON shape; the editor schema in extensions.ts defines the real nodes. */
export type PmNode = {
  type: string
  attrs?: Record<string, unknown>
  content?: PmNode[]
  marks?: { type: string; attrs?: Record<string, unknown> }[]
  text?: string
}

const listKinds = { bullet: 'bulletList', numbered: 'orderedList', todo: 'taskList' } as const
const listItems = { bullet: 'listItem', numbered: 'listItem', todo: 'taskItem' } as const
const colors: HighlightColor[] = ['yellow', 'green', 'blue', 'pink']
const markNames: Mark[] = ['bold', 'italic', 'strike', 'code', 'underline']

function inlineToPm(content: InlineNode[]): PmNode[] {
  const out: PmNode[] = []
  for (const item of content) {
    if (item.type === 'wikilink') {
      out.push({ type: 'wikiLink', attrs: { title: item.title } })
    } else if (item.type === 'math') {
      out.push({ type: 'inlineMath', attrs: { latex: item.latex } })
    } else {
      const marks: NonNullable<PmNode['marks']> = (item.marks ?? [])
        .filter((mark) => markNames.includes(mark))
        .map((mark) => ({ type: mark }))
      if (item.marks?.includes('highlight')) {
        marks.push({
          type: 'learningHighlight',
          attrs: { color: item.color && colors.includes(item.color) ? item.color : 'yellow' },
        })
      }
      if (item.href) marks.push({ type: 'link', attrs: { href: item.href } })
      item.text.split('\n').forEach((line, index) => {
        if (index) out.push({ type: 'hardBreak' })
        if (line) out.push({ type: 'text', text: line, ...(marks.length ? { marks } : {}) })
      })
    }
  }
  return out
}

function paragraphNode(content: InlineNode[], blockId = newBlockId()): PmNode {
  const inline = inlineToPm(content)
  return { type: 'paragraph', attrs: { blockId }, ...(inline.length ? { content: inline } : {}) }
}

function cellNode(type: string, content: InlineNode[]): PmNode {
  return { type, content: [paragraphNode(content, '')] }
}

function blocksToPm(blocks: NoteBlock[]): PmNode[] {
  const out: PmNode[] = []
  for (let index = 0; index < blocks.length; index++) {
    const block = blocks[index]
    if (block.type === 'bullet' || block.type === 'numbered' || block.type === 'todo') {
      const items: PmNode[] = []
      let cursor = index
      while (cursor < blocks.length && blocks[cursor].type === block.type) {
        const item = blocks[cursor]
        items.push({
          type: listItems[block.type],
          attrs: { blockId: item.id, ...(block.type === 'todo' ? { checked: item.props.checked === true } : {}) },
          content: [paragraphNode(item.content), ...blocksToPm(item.children)],
        })
        cursor++
      }
      out.push({ type: listKinds[block.type], content: items })
      index = cursor - 1
      continue
    }
    const attrs = { blockId: block.id }
    switch (block.type) {
      case 'heading':
        out.push({
          type: 'heading',
          attrs: { ...attrs, level: Math.min(6, Math.max(1, Number(block.props.level) || 1)) },
          ...(block.content.length ? { content: inlineToPm(block.content) } : {}),
        })
        break
      case 'quote':
        out.push({ type: 'blockquote', attrs, content: [paragraphNode(block.content), ...blocksToPm(block.children)] })
        break
      case 'callout': {
        const inner = [...(block.content.length ? [paragraphNode(block.content)] : []), ...blocksToPm(block.children)]
        out.push({
          type: 'callout',
          attrs: { ...attrs, kind: String(block.props.kind ?? 'note'), label: String(block.props.label ?? '') },
          content: inner.length ? inner : [paragraphNode([])],
        })
        break
      }
      case 'toggle':
        out.push({ type: 'toggle', attrs, content: [paragraphNode(block.content), ...blocksToPm(block.children)] })
        break
      case 'code': {
        const text = block.content.map((item) => (item.type === 'text' ? item.text : '')).join('')
        out.push({
          type: 'codeBlock',
          attrs: { ...attrs, language: String(block.props.language ?? '') || null },
          ...(text ? { content: [{ type: 'text', text }] } : {}),
        })
        break
      }
      case 'divider':
        out.push({ type: 'horizontalRule', attrs })
        break
      case 'table': {
        const rows = (Array.isArray(block.props.rows) ? block.props.rows : []) as InlineNode[][][]
        const header = block.props.header !== false
        out.push({
          type: 'table',
          attrs,
          content: rows.map((row, rowIndex) => ({
            type: 'tableRow',
            content: row.map((cell) => cellNode(header && rowIndex === 0 ? 'tableHeader' : 'tableCell', cell)),
          })),
        })
        break
      }
      case 'media':
        out.push({
          type: 'media',
          attrs: {
            ...attrs,
            src: String(block.props.src ?? ''),
            kind: String(block.props.kind ?? 'image'),
            alt: String(block.props.alt ?? ''),
          },
        })
        break
      case 'entity':
        out.push({
          type: 'entity',
          attrs: {
            ...attrs,
            kind: String(block.props.kind ?? 'note'),
            id: String(block.props.id ?? ''),
            label: String(block.props.label ?? ''),
          },
        })
        break
      case 'equation':
        out.push({ type: 'blockMath', attrs: { ...attrs, latex: String(block.props.latex ?? '') } })
        break
      case 'study':
        out.push({
          type: 'studyBlock',
          attrs: { ...attrs, kind: String(block.props.kind ?? 'recall'), source: String(block.props.source ?? '') },
        })
        break
      default:
        out.push(paragraphNode(block.content, block.id))
    }
  }
  return out
}

export function docToPm(doc: NoteDoc): PmNode {
  const content = blocksToPm(doc.blocks)
  return { type: 'doc', content: content.length ? content : [paragraphNode([])] }
}

function sameMarks(left: Mark[] | undefined, right: Mark[] | undefined): boolean {
  return (left ?? []).join() === (right ?? []).join()
}

function pmInline(nodes: PmNode[] | undefined): InlineNode[] {
  const out: InlineNode[] = []
  const push = (next: Extract<InlineNode, { type: 'text' }>) => {
    const last = out[out.length - 1]
    if (
      last?.type === 'text' &&
      sameMarks(last.marks, next.marks) &&
      last.href === next.href &&
      last.color === next.color
    )
      last.text += next.text
    else out.push(next)
  }
  for (const node of nodes ?? []) {
    if (node.type === 'wikiLink') out.push({ type: 'wikilink', title: String(node.attrs?.title ?? '') })
    else if (node.type === 'inlineMath') out.push({ type: 'math', latex: String(node.attrs?.latex ?? '') })
    else if (node.type === 'hardBreak') push({ type: 'text', text: '\n' })
    else if (node.type === 'text' && node.text) {
      const marks = (node.marks ?? []).map((mark) => mark.type)
      const link = node.marks?.find((mark) => mark.type === 'link')
      const highlight = node.marks?.find((mark) => mark.type === 'learningHighlight')
      const color = highlight?.attrs?.color
      push({
        type: 'text',
        text: node.text,
        marks: marks
          .map((mark) => (mark === 'learningHighlight' ? 'highlight' : mark))
          .filter((mark): mark is Mark => (markNames as string[]).includes(mark) || mark === 'highlight'),
        ...(link?.attrs?.href ? { href: String(link.attrs.href) } : {}),
        ...(typeof color === 'string' && colors.includes(color as HighlightColor)
          ? { color: color as HighlightColor }
          : {}),
      })
    }
  }
  return out
}

function idOf(node: PmNode): string {
  const value = node.attrs?.blockId
  return typeof value === 'string' && value ? value : newBlockId()
}

function make(
  node: PmNode,
  type: BlockType,
  props: Record<string, unknown>,
  content: InlineNode[],
  children: NoteBlock[],
): NoteBlock {
  return { id: idOf(node), type, props, content, children }
}

function pmBlocks(nodes: PmNode[] | undefined): NoteBlock[] {
  const out: NoteBlock[] = []
  for (const node of nodes ?? []) {
    switch (node.type) {
      case 'paragraph':
        out.push(make(node, 'paragraph', {}, pmInline(node.content), []))
        break
      case 'heading':
        out.push(make(node, 'heading', { level: Number(node.attrs?.level) || 1 }, pmInline(node.content), []))
        break
      case 'bulletList':
      case 'orderedList':
      case 'taskList': {
        const type: BlockType =
          node.type === 'bulletList' ? 'bullet' : node.type === 'orderedList' ? 'numbered' : 'todo'
        for (const item of node.content ?? []) {
          const [first, ...rest] = item.content ?? []
          out.push(
            make(
              item,
              type,
              type === 'todo' ? { checked: item.attrs?.checked === true } : {},
              first?.type === 'paragraph' ? pmInline(first.content) : [],
              pmBlocks(first?.type === 'paragraph' ? rest : item.content),
            ),
          )
        }
        break
      }
      case 'blockquote':
      case 'toggle': {
        const [first, ...rest] = node.content ?? []
        const lead = first?.type === 'paragraph'
        out.push(
          make(
            node,
            node.type === 'toggle' ? 'toggle' : 'quote',
            {},
            lead ? pmInline(first.content) : [],
            pmBlocks(lead ? rest : node.content),
          ),
        )
        break
      }
      case 'callout':
        out.push(
          make(
            node,
            'callout',
            {
              kind: String(node.attrs?.kind ?? 'note'),
              ...(node.attrs?.label ? { label: String(node.attrs.label) } : {}),
            },
            [],
            pmBlocks(node.content),
          ),
        )
        break
      case 'codeBlock': {
        const text = (node.content ?? []).map((part) => part.text ?? '').join('')
        out.push(
          make(
            node,
            'code',
            { language: String(node.attrs?.language ?? '') },
            text ? [{ type: 'text', text }] : [],
            [],
          ),
        )
        break
      }
      case 'horizontalRule':
        out.push(make(node, 'divider', {}, [], []))
        break
      case 'table': {
        const rows = (node.content ?? []).map((row) =>
          (row.content ?? []).map((cell) => {
            const parts = (cell.content ?? []).map((part) => pmInline(part.content))
            return parts.flatMap((part, index) => (index ? [{ type: 'text' as const, text: '\n' }, ...part] : part))
          }),
        )
        const header = (node.content?.[0]?.content ?? []).every((cell) => cell.type === 'tableHeader')
        out.push(make(node, 'table', { header, rows }, [], []))
        break
      }
      case 'media':
        out.push(
          make(
            node,
            'media',
            {
              src: String(node.attrs?.src ?? ''),
              kind: String(node.attrs?.kind ?? 'image'),
              alt: String(node.attrs?.alt ?? ''),
            },
            [],
            [],
          ),
        )
        break
      case 'entity':
        out.push(
          make(
            node,
            'entity',
            {
              kind: String(node.attrs?.kind ?? 'note'),
              id: Number(node.attrs?.id) || 0,
              label: String(node.attrs?.label ?? ''),
            },
            [],
            [],
          ),
        )
        break
      case 'blockMath':
        out.push(make(node, 'equation', { latex: String(node.attrs?.latex ?? '') }, [], []))
        break
      case 'studyBlock':
        out.push(
          make(
            node,
            'study',
            { kind: String(node.attrs?.kind ?? 'recall'), source: String(node.attrs?.source ?? '') },
            [],
            [],
          ),
        )
        break
      default:
        break
    }
  }
  return out
}

/** Ids stay unique even when a split block briefly carries its parent's id. */
function uniqueIds(blocks: NoteBlock[], seen = new Set<string>()): NoteBlock[] {
  for (const block of blocks) {
    if (seen.has(block.id)) block.id = newBlockId()
    seen.add(block.id)
    uniqueIds(block.children, seen)
  }
  return blocks
}

export function pmToDoc(json: PmNode): NoteDoc {
  const blocks = uniqueIds(pmBlocks(json.content)).map(normalizeBlock)
  // A lone empty paragraph is the editor's resting state, not content.
  const onlyEmpty = blocks.length === 1 && blocks[0].type === 'paragraph' && blocks[0].content.length === 0
  return { version: 1, blocks: onlyEmpty ? [] : blocks }
}

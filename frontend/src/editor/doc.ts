// SPDX-License-Identifier: AGPL-3.0-or-later

/** The note document the host stores: typed blocks with stable ids (see app/notes/document.py). */
export type Mark = 'bold' | 'italic' | 'strike' | 'code' | 'underline' | 'highlight'
export type HighlightColor = 'yellow' | 'green' | 'blue' | 'pink'
export type InlineNode =
  | { type: 'text'; text: string; marks?: Mark[]; href?: string; color?: HighlightColor }
  | { type: 'wikilink'; title: string }
  | { type: 'math'; latex: string }
export type BlockType =
  | 'paragraph'
  | 'heading'
  | 'bullet'
  | 'numbered'
  | 'todo'
  | 'toggle'
  | 'quote'
  | 'callout'
  | 'code'
  | 'divider'
  | 'table'
  | 'media'
  | 'entity'
  | 'equation'
  | 'study'
export type NoteBlock = {
  id: string
  type: BlockType
  props: Record<string, unknown>
  content: InlineNode[]
  children: NoteBlock[]
}
export type NoteDoc = { version: 1; blocks: NoteBlock[] }

export const MAX_NOTE_LENGTH = 100_000

export function newBlockId(): string {
  const bytes = new Uint8Array(8)
  crypto.getRandomValues(bytes)
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('')
}

export function emptyDoc(): NoteDoc {
  return { version: 1, blocks: [] }
}

export function textInline(text: string): InlineNode[] {
  return text ? [{ type: 'text', text }] : []
}

export function paragraph(text: string | InlineNode[]): NoteBlock {
  return {
    id: newBlockId(),
    type: 'paragraph',
    props: {},
    content: typeof text === 'string' ? textInline(text) : text,
    children: [],
  }
}

export function heading(level: number, text: string): NoteBlock {
  return { id: newBlockId(), type: 'heading', props: { level }, content: textInline(text), children: [] }
}

export function quote(text: string | InlineNode[]): NoteBlock {
  return {
    id: newBlockId(),
    type: 'quote',
    props: {},
    content: typeof text === 'string' ? textInline(text) : text,
    children: [],
  }
}

export function linkInline(label: string, href: string): InlineNode {
  return { type: 'text', text: label, href }
}

function cellText(cell: unknown): string {
  return Array.isArray(cell) ? inlineText(cell as InlineNode[]) : ''
}

export function inlineText(content: InlineNode[]): string {
  return content
    .map((item) =>
      item.type === 'wikilink' ? `[[${item.title}]]` : item.type === 'math' ? `$${item.latex}$` : item.text,
    )
    .join('')
}

function blockText(block: NoteBlock): string {
  if (block.type === 'divider') return ''
  if (block.type === 'table') {
    const rows = Array.isArray(block.props.rows) ? (block.props.rows as unknown[][]) : []
    return rows.map((row) => (Array.isArray(row) ? row.map(cellText).join('\t') : '')).join('\n')
  }
  if (block.type === 'entity') return String(block.props.label ?? '')
  if (block.type === 'media') return String(block.props.alt ?? '')
  if (block.type === 'equation') return String(block.props.latex ?? '')
  if (block.type === 'study') return ''
  const label = block.type === 'callout' && block.props.label ? `${String(block.props.label)}\n` : ''
  return label + inlineText(block.content)
}

function walk(blocks: NoteBlock[], visit: (block: NoteBlock) => void): void {
  for (const block of blocks) {
    visit(block)
    walk(block.children, visit)
  }
}

/** Readable plain text: previews, link scanning and card-source checks. */
export function docText(doc: NoteDoc): string {
  const parts: string[] = []
  walk(doc.blocks, (block) => {
    const text = blockText(block)
    if (text) parts.push(text)
  })
  return parts.join('\n')
}

/** True when the document has no readable text and no non-text block. */
export function isBlank(doc: NoteDoc): boolean {
  let blank = true
  walk(doc.blocks, (block) => {
    if (['media', 'entity', 'equation', 'study', 'divider', 'table'].includes(block.type) || blockText(block).trim())
      blank = false
  })
  return blank
}

export function outline(doc: NoteDoc): { id: string; level: number; text: string }[] {
  const result: { id: string; level: number; text: string }[] = []
  walk(doc.blocks, (block) => {
    if (block.type === 'heading') {
      result.push({ id: block.id, level: Number(block.props.level ?? 1), text: inlineText(block.content) })
    }
  })
  return result
}

function sortedProps(props: Record<string, unknown> | undefined): Record<string, unknown> {
  return Object.fromEntries(Object.entries(props ?? {}).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)))
}

function normalizeInline(item: InlineNode): InlineNode {
  if (item.type === 'wikilink') return { type: 'wikilink', title: item.title }
  if (item.type === 'math') return { type: 'math', latex: item.latex }
  const marks = item.marks?.length ? [...new Set(item.marks)].sort() : undefined
  return {
    type: 'text',
    text: item.text,
    ...(marks ? { marks } : {}),
    ...(item.href ? { href: item.href } : {}),
    ...(item.color && marks?.includes('highlight') ? { color: item.color } : {}),
  }
}

/** One canonical shape so an unchanged document never looks edited. */
export function normalizeBlock(block: NoteBlock): NoteBlock {
  const props = sortedProps(block.props)
  if (block.type === 'table' && Array.isArray(props.rows)) {
    props.rows = (props.rows as unknown[][]).map((row) =>
      row.map((cell) => (Array.isArray(cell) ? (cell as InlineNode[]).map(normalizeInline) : [])),
    )
  }
  return {
    id: block.id,
    type: block.type,
    props,
    content: (block.content ?? []).map(normalizeInline),
    children: (block.children ?? []).map(normalizeBlock),
  }
}

/**
 * Drafts, conflicts and merges work on one string. One JSON line per top-level
 * block turns the existing line-based three-way merge into a block merge.
 */
export function serializeDoc(doc: NoteDoc): string {
  return doc.blocks.map((block) => JSON.stringify(normalizeBlock(block))).join('\n')
}

function isBlock(value: unknown): value is NoteBlock {
  return (
    !!value &&
    typeof value === 'object' &&
    typeof (value as NoteBlock).id === 'string' &&
    typeof (value as NoteBlock).type === 'string'
  )
}

/** Text written before blocks existed becomes plain paragraphs; nothing is dropped. */
export function parseBody(body: string): NoteDoc {
  const lines = body.split('\n').filter((line) => line.trim())
  const blocks: NoteBlock[] = []
  for (const line of lines) {
    try {
      const value: unknown = JSON.parse(line)
      if (!isBlock(value)) throw new Error('not a block')
      blocks.push(normalizeBlock(value))
    } catch {
      return legacyDoc(body)
    }
  }
  return { version: 1, blocks }
}

function legacyDoc(text: string): NoteDoc {
  const chunks = text
    .replace(/\r\n?/g, '\n')
    .split(/\n{2,}/)
    .map((chunk) => chunk.trim())
    .filter(Boolean)
  return { version: 1, blocks: chunks.map((chunk) => paragraph(chunk)) }
}

export function docFromApi(value: unknown): NoteDoc {
  const blocks = (value as { blocks?: unknown } | null)?.blocks
  return { version: 1, blocks: Array.isArray(blocks) ? blocks.filter(isBlock).map(normalizeBlock) : [] }
}

export function bodyFromApi(document: unknown): string {
  return serializeDoc(docFromApi(document))
}

export function appendBlocks(body: string, blocks: NoteBlock[]): string {
  const doc = parseBody(body)
  return serializeDoc({ version: 1, blocks: [...doc.blocks, ...blocks] })
}

export function sameDoc(left: string, right: string): boolean {
  return left === right
}

function withoutIds(block: NoteBlock): unknown {
  const { type, props, content, children } = normalizeBlock(block)
  return { type, props, content, children: children.map(withoutIds) }
}

/** Same content, regardless of block ids. */
export function sameBlocks(left: NoteBlock[], right: NoteBlock[]): boolean {
  return (
    left.length === right.length &&
    left.every((block, index) => JSON.stringify(withoutIds(block)) === JSON.stringify(withoutIds(right[index])))
  )
}

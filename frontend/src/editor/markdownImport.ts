// SPDX-License-Identifier: AGPL-3.0-or-later

import { newBlockId, serializeDoc, type InlineNode, type Mark, type NoteBlock } from './doc'

/**
 * Small Markdown reader for translated page templates and pasted text. The host owns the
 * full Markdown conversion; this covers what a template or short snippet can contain.
 */
const INLINE =
  /\\([\\`*_[\]~|$])|(`+)(.+?)\2|\[\[([^[\]\n]{1,200})\]\]|\[([^[\]]*)\]\(([^()\s]*)\)|\$(?![\s$])((?:\\.|[^$\n\\])+?)(?<!\s)\$(?![\d$])|\*\*(.+?)\*\*|__(.+?)__|~~(.+?)~~|\*([^*\s](?:.*?[^*\s])?)\*/gs

export function parseInline(text: string, marks: Mark[] = [], href?: string): InlineNode[] {
  const nodes: InlineNode[] = []
  const emit = (value: string, extra: Mark[] = []) => {
    if (!value) return
    const combined = [...new Set([...marks, ...extra])]
    const last = nodes[nodes.length - 1]
    if (last?.type === 'text' && (last.marks ?? []).join() === combined.join() && last.href === href) last.text += value
    else
      nodes.push({
        type: 'text',
        text: value,
        ...(combined.length ? { marks: combined } : {}),
        ...(href ? { href } : {}),
      })
  }
  let position = 0
  for (const match of text.matchAll(INLINE)) {
    emit(text.slice(position, match.index))
    position = (match.index ?? 0) + match[0].length
    if (match[1]) emit(match[1])
    else if (match[3] !== undefined) emit(match[3], ['code'])
    else if (match[4] !== undefined) nodes.push({ type: 'wikilink', title: match[4].trim() })
    else if (match[6] !== undefined) nodes.push(...parseInline(match[5] || match[6], marks, match[6]))
    else if (match[7] !== undefined) nodes.push({ type: 'math', latex: match[7] })
    else if (match[8] !== undefined || match[9] !== undefined)
      nodes.push(...parseInline(match[8] ?? match[9], [...marks, 'bold'], href))
    else if (match[10] !== undefined) nodes.push(...parseInline(match[10], [...marks, 'strike'], href))
    else nodes.push(...parseInline(match[11], [...marks, 'italic'], href))
  }
  emit(text.slice(position))
  return nodes
}

function block(type: NoteBlock['type'], content: InlineNode[] = [], props: Record<string, unknown> = {}): NoteBlock {
  return { id: newBlockId(), type, props, content, children: [] }
}

export function markdownToBlocks(markdown: string): NoteBlock[] {
  const lines = markdown.replace(/\r\n?/g, '\n').split('\n')
  const blocks: NoteBlock[] = []
  // Open list items by indentation; a deeper item becomes the child of the item above it.
  const open: { indent: number; item: NoteBlock }[] = []
  let paragraph: string[] = []
  const flush = () => {
    if (paragraph.length) blocks.push(block('paragraph', parseInline(paragraph.join('\n'))))
    paragraph = []
  }
  for (let index = 0; index < lines.length; index++) {
    const line = lines[index]
    const fence = /^ {0,3}(`{3,}|~{3,})\s*([\w+#.-]*)/.exec(line)
    const heading = /^ {0,3}(#{1,6})\s+(.*?)\s*#*\s*$/.exec(line)
    const item = /^(\s*)([-*+]|\d{1,9}[.)])\s+(?:\[([ xX])\]\s+)?(.*)$/.exec(line)
    const image = /^\s*!\[([^\]]*)\]\(([^()\s]+)\)\s*$/.exec(line)
    if (line.trim() && !item) open.length = 0
    if (!line.trim()) {
      flush()
    } else if (fence) {
      flush()
      const end = lines.findIndex((candidate, at) => at > index && candidate.trim().startsWith(fence[1]))
      const stop = end === -1 ? lines.length : end
      const code = lines.slice(index + 1, stop).join('\n')
      blocks.push(block('code', code ? [{ type: 'text', text: code }] : [], { language: fence[2] }))
      index = stop
    } else if (line.trim() === '$$' || /^\s*\$\$.+\$\$\s*$/.test(line)) {
      flush()
      if (line.trim() === '$$') {
        const end = lines.findIndex((candidate, at) => at > index && candidate.trim() === '$$')
        const stop = end === -1 ? lines.length : end
        blocks.push(block('equation', [], { latex: lines.slice(index + 1, stop).join('\n') }))
        index = stop
      } else {
        blocks.push(block('equation', [], { latex: line.trim().slice(2, -2).trim() }))
      }
    } else if (
      line.includes('|') &&
      /^\s*\|?\s*:?-{3,}:?\s*(?:\|\s*:?-{3,}:?\s*)*\|?\s*$/.test(lines[index + 1] ?? '')
    ) {
      flush()
      const cells = (row: string) =>
        row
          .trim()
          .replace(/^\||\|$/g, '')
          .split(/(?<!\\)\|/)
          .map((cell) => parseInline(cell.trim()))
      const rows = [cells(line)]
      index += 2
      while (index < lines.length && lines[index].trim() && lines[index].includes('|')) rows.push(cells(lines[index++]))
      index -= 1
      blocks.push(block('table', [], { header: true, rows }))
    } else if (image) {
      flush()
      // Only files the host stored are shown; anything else stays a visible link.
      if (/^\/api\/note-assets\//.test(image[2]))
        blocks.push(block('media', [], { kind: 'image', src: image[2], alt: image[1] }))
      else blocks.push(block('paragraph', parseInline(`[${image[1] || image[2]}](${image[2]})`)))
    } else if (heading) {
      flush()
      blocks.push(block('heading', parseInline(heading[2]), { level: heading[1].length }))
    } else if (/^ {0,3}(?:-{3,}|\*{3,}|_{3,})\s*$/.test(line)) {
      flush()
      blocks.push(block('divider'))
    } else if (line.trimStart().startsWith('>')) {
      flush()
      blocks.push(block('quote', parseInline(line.replace(/^\s*>\s?/, ''))))
    } else if (item) {
      flush()
      const kind = /^\d/.test(item[2]) ? 'numbered' : item[3] !== undefined ? 'todo' : 'bullet'
      const created = block(
        kind,
        parseInline(item[4]),
        kind === 'todo' ? { checked: item[3].toLowerCase() === 'x' } : {},
      )
      const indent = item[1].replace(/\t/g, '    ').length
      while (open.length && open[open.length - 1].indent >= indent) open.pop()
      ;(open.length ? open[open.length - 1].item.children : blocks).push(created)
      open.push({ indent, item: created })
    } else {
      paragraph.push(line.trim())
    }
  }
  flush()
  return blocks
}

/** A Markdown snippet in the draft form every note body uses. */
export function markdownToBody(markdown: string): string {
  return serializeDoc({ version: 1, blocks: markdownToBlocks(markdown) })
}

/** Plain text that was written as Markdown: pasting it builds blocks instead of showing the markers. */
export function looksLikeMarkdown(text: string): boolean {
  if (!text.includes('\n') && !/^\s*(?:#{1,6}\s|[-*+]\s|\d+[.)]\s|>\s|```|\$\$)/.test(text)) return false
  return (
    /^ {0,3}#{1,6}\s+\S/m.test(text) ||
    /^ {0,3}(?:```|~~~)/m.test(text) ||
    /^\s*\$\$/m.test(text) ||
    /^\s*\|?\s*:?-{3,}:?\s*\|/m.test(text) ||
    /^\s*!\[[^\]]*\]\(/m.test(text) ||
    /^\s*(?:[-*+]|\d{1,9}[.)])\s+\S/m.test(text) ||
    /^\s*>\s+\S/m.test(text)
  )
}

// SPDX-License-Identifier: AGPL-3.0-or-later
import {
  docText,
  linkInline,
  newBlockId,
  paragraph,
  parseBody,
  serializeDoc,
  type InlineNode,
  type NoteBlock,
  type NoteDoc,
} from '@/editor/doc'
import { studyNoteFormat } from './studyNoteFormat'

export type LectureSource = {
  courseId: number
  resourceId: number
  resourceName: string
  versionId: number
  version: number
  pageCount?: number
  currentPage?: number
}
export type LectureCoverage = { date: string; pages: number[] }
export class LectureCoverageError extends Error {
  readonly code: 'date' | 'pages' | 'range' | 'limit' | 'document'
  constructor(code: LectureCoverageError['code']) {
    super(code)
    this.code = code
  }
}

export function lectureToday(now = new Date()) {
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
}

export function parseLecturePages(value: string, maxPage?: number): number[] {
  if (!value.trim() || value.length > 400) throw new LectureCoverageError('pages')
  const pages = new Set<number>()
  for (const part of value.split(/[,;]/)) {
    const match = /^\s*(\d{1,5})(?:\s*[-–]\s*(\d{1,5}))?\s*$/.exec(part)
    if (!match) throw new LectureCoverageError('pages')
    const first = Number(match[1]),
      last = Number(match[2] ?? match[1])
    if (first < 1 || last < first || last > 10_000 || (maxPage && last > maxPage))
      throw new LectureCoverageError('range')
    if (last - first >= 200) throw new LectureCoverageError('limit')
    for (let page = first; page <= last; page++) {
      pages.add(page)
      if (pages.size > 200) throw new LectureCoverageError('limit')
    }
  }
  return [...pages].sort((a, b) => a - b)
}

export function lecturePageRanges(pages: number[]) {
  const result: { first: number; last: number }[] = []
  for (const page of pages) {
    const previous = result.at(-1)
    if (previous && page === previous.last + 1) previous.last = page
    else result.push({ first: page, last: page })
  }
  return result
}
export function formatLecturePages(pages: number[]) {
  return lecturePageRanges(pages)
    .map((range) => (range.first === range.last ? String(range.first) : `${range.first}–${range.last}`))
    .join(', ')
}

const LABEL = /^Vorlesung · (\d{4}-\d{2}-\d{2})$/
const META = ['Datum:', 'Quelle:', 'Bearbeitete PDF-Seiten:']

/** Recorded lectures are callout blocks labelled "Vorlesung · date"; bold lead-ins mark our own lines. */
function lectureBlocks(doc: NoteDoc) {
  return doc.blocks.flatMap((block) => {
    const match = block.type === 'callout' ? LABEL.exec(String(block.props.label ?? '')) : null
    return match ? [{ block, date: match[1] }] : []
  })
}

function leadIn(paragraph: NoteBlock): string | null {
  const first = paragraph.content[0]
  return paragraph.type === 'paragraph' && first?.type === 'text' && first.marks?.includes('bold') ? first.text : null
}

function lectureBlockMetadata(block: NoteBlock) {
  const source = block.children.find((child) => leadIn(child) === 'Quelle:')
  const pagesLine = block.children.find((child) => leadIn(child) === 'Bearbeitete PDF-Seiten:')
  const link = source?.content.find((node) => node.type === 'text' && node.href)
  const versionId = Number(link?.type === 'text' ? /^\/material\/(\d+)$/.exec(link.href ?? '')?.[1] : undefined)
  const pages = (pagesLine?.content ?? []).flatMap((node) => {
    const match = node.type === 'text' && node.href ? /^\/material\/(\d+)\?page=(\d+)$/.exec(node.href) : null
    return match ? [{ versionId: Number(match[1]), page: Number(match[2]) }] : []
  })
  return { versionId, pages }
}

/** Personal references never change the explicitly recorded lecture source. */
export function lastRecordedLectureSourceVersion(body: string): number | null {
  let version: number | null = null
  for (const { block } of lectureBlocks(parseBody(body))) {
    const { versionId } = lectureBlockMetadata(block)
    if (Number.isSafeInteger(versionId) && versionId > 0) version = versionId
  }
  return version
}

export function lectureCoverage(body: string, source: LectureSource, date: string): LectureCoverage | null {
  for (const { block, date: blockDate } of lectureBlocks(parseBody(body))) {
    if (blockDate !== date) continue
    const metadata = lectureBlockMetadata(block)
    if (metadata.versionId !== source.versionId) continue
    const pages = metadata.pages.filter((item) => item.versionId === source.versionId).map((item) => item.page)
    if (pages.length) return { date, pages: [...new Set(pages)].sort((a, b) => a - b) }
  }
  return null
}

const bold = (text: string): InlineNode => ({ type: 'text', text, marks: ['bold'] })

/** A portable source block is readable through the normal note API and GPT lookup tools. */
export function recordLectureCoverage(body: string, source: LectureSource, date: string, pageInput: string) {
  const parsedDate = new Date(`${date}T00:00:00Z`)
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(date) ||
    !Number.isFinite(parsedDate.getTime()) ||
    parsedDate.toISOString().slice(0, 10) !== date
  )
    throw new LectureCoverageError('date')
  const pages = parseLecturePages(pageInput, source.pageCount)
  if (
    ![source.versionId, source.resourceId, source.courseId, source.version].every(
      (value) => Number.isSafeInteger(value) && value > 0,
    )
  )
    throw new LectureCoverageError('document')
  const name = source.resourceName.replace(/[\r\n]+/g, ' ')
  const lines = [
    paragraph([bold('Datum:'), { type: 'text', text: ` ${date}` }]),
    paragraph([
      bold('Quelle:'),
      { type: 'text', text: ' ' },
      linkInline(`${name} · Version ${source.version}`, `/material/${source.versionId}`),
    ]),
    paragraph([
      bold('Bearbeitete PDF-Seiten:'),
      { type: 'text', text: ' ' },
      ...pages.flatMap((page, index): InlineNode[] => [
        ...(index ? [{ type: 'text' as const, text: ' · ' }] : []),
        linkInline(String(page), `/material/${source.versionId}?page=${page}`),
      ]),
    ]),
  ]
  const doc = parseBody(body)
  // Update only our three metadata lines; preserve any personal text added to this block.
  const existing = lectureBlocks(doc).find(
    (item) => item.date === date && lectureBlockMetadata(item.block).versionId === source.versionId,
  )
  if (existing) {
    const personal = existing.block.children.filter((child) => !META.includes(leadIn(child) ?? ''))
    existing.block.children = [...lines, ...personal]
  } else {
    doc.blocks.push({
      id: newBlockId(),
      type: 'callout',
      props: { kind: 'note', label: `Vorlesung · ${date}` },
      content: [],
      children: lines,
    })
  }
  if (docText(doc).length > 100_000) throw new LectureCoverageError('document')
  return { body: serializeDoc(doc), coverage: { date, pages } }
}

export function lectureDraftPrompt(source: LectureSource, coverage: LectureCoverage) {
  const refs = coverage.pages.map((page) => `/material/${source.versionId}?page=${page}`).join('\n')
  return (
    `Erstelle eine verständliche Mitschrift zur Vorlesung am ${coverage.date} im Kurs ${source.courseId}.\n` +
    `Quelle: ${source.resourceName}, Version ${source.version}; bearbeitete PDF-Seiten: ${formatLecturePages(coverage.pages)}.\n` +
    `Rufe ausschließlich die folgenden genauen Quellenverweise über lookup.fetch ab:\n${refs}\n\n` +
    'Rufe höchstens 50 Verweise pro Anfrage ab und folge bei gekürzten Ergebnissen der Fortsetzung für dieselbe Quelle und Seite. ' +
    'Erkläre den Stoff mit Überschriften, kurzen Beispielen und offenen Fragen. Belege Aussagen mit den Seiten. ' +
    'Trenne Quelleninhalt von eigenen Erklärungen. Behaupte keine Aussagen oder Beispiele des Dozenten, die nicht in der Quelle oder meinen eigenen Notizen stehen. ' +
    'Wenn eine Quelle nicht abrufbar oder nur teilweise verfügbar ist, benenne die Lücke. Bereite einen Entwurf vor; ändere keine gespeicherte Mitschrift ohne meinen Auftrag.\n\n' +
    studyNoteFormat
  )
}

// SPDX-License-Identifier: AGPL-3.0-or-later
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

function lectureBlockMetadata(content: string) {
  const lines = content.split('\n')
  const source = lines.find((line) => /^\*\*Quelle:\*\*/.test(line))
  const versionId = Number(source?.match(/(?<!\\)\]\(\/material\/(\d+)\)/)?.[1])
  const pages = lines.find((line) => /^\*\*Bearbeitete PDF-Seiten:\*\*/.test(line)) ?? ''
  return { versionId, pages }
}

function lectureBlocks(body: string) {
  return body.matchAll(/^:::callout\s+\{[^\n]*label="Vorlesung · (\d{4}-\d{2}-\d{2})"[^\n]*\}\s*\n([\s\S]*?)^:::\s*$/gm)
}

/** Personal references never change the explicitly recorded lecture source. */
export function lastRecordedLectureSourceVersion(body: string): number | null {
  let version: number | null = null
  for (const block of lectureBlocks(body)) {
    const { versionId } = lectureBlockMetadata(block[2])
    if (Number.isSafeInteger(versionId) && versionId > 0) version = versionId
  }
  return version
}

export function lectureCoverage(body: string, source: LectureSource, date: string): LectureCoverage | null {
  for (const block of lectureBlocks(body)) {
    if (block[1] !== date) continue
    const metadata = lectureBlockMetadata(block[2])
    if (metadata.versionId !== source.versionId) continue
    const pages = [...metadata.pages.matchAll(/\]\(\/material\/(\d+)\?page=(\d+)\)/g)]
      .filter((match) => Number(match[1]) === source.versionId)
      .map((match) => Number(match[2]))
    if (pages.length) return { date, pages: [...new Set(pages)].sort((a, b) => a - b) }
  }
  return null
}

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
  const name = source.resourceName.replace(/[\\[\]]/g, '\\$&').replace(/[\r\n]/g, ' ')
  const lines = [
    `**Datum:** ${date}`,
    `**Quelle:** [${name} · Version ${source.version}](/material/${source.versionId})`,
    `**Bearbeitete PDF-Seiten:** ${pages.map((page) => `[${page}](/material/${source.versionId}?page=${page})`).join(' · ')}`,
  ]
  const block = `:::callout {kind="note" label="Vorlesung · ${date}"}\n\n${lines.join('\n\n')}\n\n:::`
  // Update only our three metadata lines; preserve any personal text added to this block.
  const pattern = new RegExp(
    `^:::callout\\s+\\{[^\\n]*label="Vorlesung · ${date}"[^\\n]*\\}\\s*\\n([\\s\\S]*?)^:::\\s*$`,
    'gm',
  )
  let replaced = false
  const updated = body.replace(pattern, (original, content: string) => {
    if (replaced || lectureBlockMetadata(content).versionId !== source.versionId) return original
    const extra = content
      .split('\n')
      .filter((line) => !/^\*\*(?:Datum|Quelle|Bearbeitete PDF-Seiten):\*\*/.test(line))
      .join('\n')
      .trim()
    replaced = true
    return extra ? block.replace('\n\n:::', `\n\n${extra}\n\n:::`) : block
  })
  const result = replaced
    ? updated
    : `${body}${body && !body.endsWith('\n\n') ? (body.endsWith('\n') ? '\n' : '\n\n') : ''}${block}\n`
  if (result.length > 100_000) throw new LectureCoverageError('document')
  return { body: result, coverage: { date, pages } }
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

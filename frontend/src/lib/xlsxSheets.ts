// SPDX-License-Identifier: AGPL-3.0-or-later

import JSZip from 'jszip'

export type Sheet = { name: string; rows: string[][]; truncated: boolean }

const MAX_ROWS = 1000
const MAX_COLUMNS = 100
/** Built-in number formats Excel uses for dates and times. */
const DATE_FORMATS = new Set([14, 15, 16, 17, 18, 19, 20, 21, 22, 45, 46, 47])
const EXCEL_EPOCH = Date.UTC(1899, 11, 30)
const DAY_MS = 86_400_000

const parse = (xml: string) => new DOMParser().parseFromString(xml, 'application/xml')
const children = (node: Element, name: string) => Array.from(node.getElementsByTagName(name))

/** "B12" → column 1. */
function columnIndex(reference: string): number {
  const letters = reference.replace(/\d+$/, '')
  let index = 0
  for (const letter of letters) index = index * 26 + (letter.charCodeAt(0) - 64)
  return index - 1
}

function dateStyles(stylesXml: string | null): Set<number> {
  if (!stylesXml) return new Set()
  const styles = parse(stylesXml)
  const custom = new Map(
    children(styles.documentElement, 'numFmt').map(
      (format) => [Number(format.getAttribute('numFmtId')), format.getAttribute('formatCode') ?? ''] as const,
    ),
  )
  const isDate = (id: number) =>
    DATE_FORMATS.has(id) || /[dmy]/i.test((custom.get(id) ?? '').replace(/\[[^\]]*\]|"[^"]*"/g, ''))
  const cellXfs = styles.getElementsByTagName('cellXfs')[0]
  const result = new Set<number>()
  if (cellXfs)
    children(cellXfs, 'xf').forEach((xf, index) => {
      if (isDate(Number(xf.getAttribute('numFmtId')))) result.add(index)
    })
  return result
}

function excelDate(serial: number): string {
  const date = new Date(EXCEL_EPOCH + Math.round(serial * DAY_MS))
  const day = date.toISOString().slice(0, 10)
  return serial % 1 ? `${day} ${date.toISOString().slice(11, 16)}` : day
}

function cellText(cell: Element, shared: string[], dates: Set<number>): string {
  const type = cell.getAttribute('t')
  if (type === 'inlineStr')
    return children(cell, 't')
      .map((node) => node.textContent ?? '')
      .join('')
  const value = cell.getElementsByTagName('v')[0]?.textContent ?? ''
  if (type === 's') return shared[Number(value)] ?? ''
  if (type === 'b') return value === '1' ? 'WAHR' : 'FALSCH'
  if (!type || type === 'n') {
    const number = Number(value)
    if (value !== '' && dates.has(Number(cell.getAttribute('s') ?? -1)) && Number.isFinite(number))
      return excelDate(number)
  }
  return value
}

/**
 * The sheets of an .xlsx workbook as plain text cells: shared and inline
 * strings, numbers, booleans and dates. Formulas show their last saved result.
 * Read with the browser's XML parser only; nothing in the file is executed.
 */
export async function readWorkbook(data: ArrayBuffer): Promise<Sheet[]> {
  const zip = await JSZip.loadAsync(data)
  const text = (path: string) => zip.file(path)?.async('string') ?? Promise.resolve(null)
  const [workbookXml, relsXml, sharedXml, stylesXml] = await Promise.all([
    text('xl/workbook.xml'),
    text('xl/_rels/workbook.xml.rels'),
    text('xl/sharedStrings.xml'),
    text('xl/styles.xml'),
  ])
  if (!workbookXml || !relsXml) throw new Error('workbook')
  const shared = sharedXml
    ? children(parse(sharedXml).documentElement, 'si').map((item) =>
        children(item, 't')
          .map((node) => node.textContent ?? '')
          .join(''),
      )
    : []
  const dates = dateStyles(stylesXml)
  const targets = new Map(
    children(parse(relsXml).documentElement, 'Relationship').map(
      (rel) => [rel.getAttribute('Id'), rel.getAttribute('Target') ?? ''] as const,
    ),
  )
  const sheets: Sheet[] = []
  for (const sheet of children(parse(workbookXml).documentElement, 'sheet')) {
    const target = targets.get(
      sheet.getAttribute('r:id') ??
        sheet.getAttributeNS('http://schemas.openxmlformats.org/officeDocument/2006/relationships', 'id'),
    )
    if (!target) continue
    const path = target.startsWith('/') ? target.slice(1) : `xl/${target.replace(/^\.\//, '')}`
    const xml = await text(path)
    if (!xml) continue
    const rowNodes = children(parse(xml).documentElement, 'row')
    const rows: string[][] = []
    for (const rowNode of rowNodes.slice(0, MAX_ROWS)) {
      const number = Number(rowNode.getAttribute('r') ?? rows.length + 1)
      while (rows.length < number - 1 && rows.length < MAX_ROWS) rows.push([])
      const row: string[] = []
      for (const cell of children(rowNode, 'c')) {
        const column = columnIndex(cell.getAttribute('r') ?? '')
        if (column < 0 || column >= MAX_COLUMNS) continue
        while (row.length < column) row.push('')
        row[column] = cellText(cell, shared, dates)
      }
      rows.push(row)
    }
    sheets.push({
      name: sheet.getAttribute('name') ?? `Tabelle ${sheets.length + 1}`,
      rows: rows.slice(0, MAX_ROWS),
      truncated: rowNodes.length > MAX_ROWS,
    })
  }
  return sheets
}

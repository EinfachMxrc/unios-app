// SPDX-License-Identifier: AGPL-3.0-or-later
export type ImportedCsvNote = { title: string; body: string }
const MAX_BYTES = 2 * 1024 * 1024
export const MAX_CSV_NOTES = 1000

function rows(text: string, delimiter: string): string[][] {
  const result: string[][] = []
  let row: string[] = [], field = '', quoted = false, closed = false
  function cell() { row.push(field); field = ''; closed = false; if (row.length > 20) throw new Error('CSV columns') }
  function line() {
    cell()
    if (row.some((value) => value.trim())) result.push(row)
    row = []
    if (result.length > MAX_CSV_NOTES + 1) throw new Error('CSV rows')
  }
  for (let i = 0; i < text.length; i += 1) {
    const char = text[i]
    if (quoted) {
      if (char === '"' && text[i + 1] === '"') { field += '"'; i += 1 }
      else if (char === '"') { quoted = false; closed = true }
      else field += char
    } else if (char === delimiter) cell()
    else if (char === '\n') line()
    else if (char === '"' && !field && !closed) quoted = true
    else if (char === '"' || closed) throw new Error('CSV quoting')
    else field += char
  }
  if (quoted) throw new Error('CSV quoting')
  if (field || row.length || closed) line()
  return result
}

/** CSV note import only: no formula evaluation, archives, inferred fields or automatic writes. */
export function parseNoteCsv(input: string): ImportedCsvNote[] {
  if (new TextEncoder().encode(input).length > MAX_BYTES || input.includes('\u0000')) throw new Error('CSV size')
  const text = input.replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n')
  for (const delimiter of [',', ';']) {
    let records: string[][]
    try { records = rows(text, delimiter) } catch { continue }
    const header = records[0]?.map((value) => value.trim().toLowerCase()) ?? []
    const titleIndex = header.findIndex((value) => value === 'title' || value === 'titel')
    const bodyIndex = header.findIndex((value) => value === 'body' || value === 'inhalt')
    if (titleIndex < 0 || bodyIndex < 0) continue
    const notes = records.slice(1).map((record) => {
      const title = record[titleIndex]?.trim(), body = record[bodyIndex]
      if (!title || title.length > 200 || /[\r\n]/.test(title) || !body?.trim() || body.length > 100_000 || record.length !== header.length) throw new Error('CSV note')
      return { title, body }
    })
    if (!notes.length || notes.length > MAX_CSV_NOTES) throw new Error('CSV rows')
    return notes
  }
  throw new Error('CSV header')
}

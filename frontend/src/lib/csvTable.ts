// SPDX-License-Identifier: AGPL-3.0-or-later

/** CSV from German Excel uses semicolons; tabs mark TSV. The first line decides. */
export function guessDelimiter(text: string, filename = ''): string {
  if (/\.tsv$/i.test(filename)) return '\t'
  const firstLine = text.slice(0, text.search(/\r?\n|$/))
  const count = (char: string) => firstLine.split(char).length - 1
  const candidates = [',', ';', '\t'].map((char) => [char, count(char)] as const)
  return candidates.reduce((best, item) => (item[1] > best[1] ? item : best))[0]
}

/**
 * Rows of a CSV file: quoted fields may hold the delimiter, line breaks and
 * doubled quotes. Stops after `limit` rows so a huge file stays responsive.
 */
export function parseCsv(text: string, delimiter: string, limit = Infinity): { rows: string[][]; truncated: boolean } {
  const rows: string[][] = []
  let row: string[] = []
  let field = ''
  let quoted = false
  for (let index = 0; index < text.length; index++) {
    const char = text[index]
    if (quoted) {
      if (char === '"' && text[index + 1] === '"') {
        field += '"'
        index++
      } else if (char === '"') quoted = false
      else field += char
      continue
    }
    if (char === '"' && field === '') quoted = true
    else if (char === delimiter) {
      row.push(field)
      field = ''
    } else if (char === '\n' || char === '\r') {
      if (char === '\r' && text[index + 1] === '\n') index++
      row.push(field)
      field = ''
      rows.push(row)
      row = []
      if (rows.length >= limit) return { rows, truncated: index + 1 < text.length }
    } else field += char
  }
  if (field !== '' || row.length) {
    row.push(field)
    rows.push(row)
  }
  return { rows, truncated: false }
}

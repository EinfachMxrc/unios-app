// SPDX-License-Identifier: AGPL-3.0-or-later
import { expect, it } from 'vitest'
import { parseNoteCsv } from './importCsv'
it('imports explicit English/German columns, quoted commas, escaped quotes and multiline bodies', () => {
  expect(parseNoteCsv('Title,Body\r\nBasics,"A comma, a quote ""here""\r\nand another line"')).toEqual([
    { title: 'Basics', body: 'A comma, a quote "here"\nand another line' },
  ])
  expect(parseNoteCsv('\uFEFFTitel;Inhalt\nMeine Notiz;# Inhalt')).toEqual([{ title: 'Meine Notiz', body: '# Inhalt' }])
  expect(parseNoteCsv('Body,Title\nText,Name')).toEqual([{ title: 'Name', body: 'Text' }])
  expect(parseNoteCsv('"Titel";"Inhalt"\n"Name";"Komma, Semikolon; und\nZeile"')).toEqual([
    { title: 'Name', body: 'Komma, Semikolon; und\nZeile' },
  ])
})
it('rejects unknown schemas, unfinished quoting, excessive rows and oversized data', () => {
  for (const input of [
    'Name,Content\na,b',
    'Title,Body\na,"unterminated',
    'Title,Body\na,"b"tail',
    'Title,Body\na,',
    'Title,Body\na,b,c',
    'Title,Body\na,\u0000',
  ])
    expect(() => parseNoteCsv(input)).toThrow()
  expect(() => parseNoteCsv(`Title,Body\n${'A,B\n'.repeat(1001)}`)).toThrow()
  expect(() => parseNoteCsv(`Title,Body\nA,${'x'.repeat(2 * 1024 * 1024)}`)).toThrow()
  expect(parseNoteCsv(`Title,Body\n${'A,B\n'.repeat(1000)}`)).toHaveLength(1000)
})

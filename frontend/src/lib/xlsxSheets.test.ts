// SPDX-License-Identifier: AGPL-3.0-or-later
// @vitest-environment jsdom

import JSZip from 'jszip'
import { expect, it } from 'vitest'
import { readWorkbook } from './xlsxSheets'

async function workbook(): Promise<ArrayBuffer> {
  const zip = new JSZip()
  zip.file(
    'xl/workbook.xml',
    `<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"
    xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>
    <sheet name="Noten" sheetId="1" r:id="rId1"/><sheet name="Leer" sheetId="2" r:id="rId2"/></sheets></workbook>`,
  )
  zip.file(
    'xl/_rels/workbook.xml.rels',
    `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
    <Relationship Id="rId1" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Target="worksheets/sheet2.xml"/></Relationships>`,
  )
  zip.file(
    'xl/sharedStrings.xml',
    `<sst xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
    <si><t>Modul</t></si><si><r><t>Ana</t></r><r><t>lysis</t></r></si></sst>`,
  )
  zip.file(
    'xl/styles.xml',
    `<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
    <cellXfs><xf numFmtId="0"/><xf numFmtId="14"/></cellXfs></styleSheet>`,
  )
  zip.file(
    'xl/worksheets/sheet1.xml',
    `<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>
    <row r="1"><c r="A1" t="s"><v>0</v></c><c r="C1" t="inlineStr"><is><t>Datum</t></is></c></row>
    <row r="3"><c r="A3" t="s"><v>1</v></c><c r="B3"><v>1.3</v></c><c r="C3" s="1"><v>46000</v></c><c r="D3" t="b"><v>1</v></c></row>
    </sheetData></worksheet>`,
  )
  zip.file(
    'xl/worksheets/sheet2.xml',
    `<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData/></worksheet>`,
  )
  return zip.generateAsync({ type: 'arraybuffer' })
}

it('reads every sheet with strings, numbers, booleans, dates and gaps in place', async () => {
  const sheets = await readWorkbook(await workbook())
  expect(sheets.map((sheet) => sheet.name)).toEqual(['Noten', 'Leer'])
  expect(sheets[0].rows).toEqual([['Modul', '', 'Datum'], [], ['Analysis', '1.3', '2025-12-09', 'WAHR']])
  expect(sheets[1].rows).toEqual([])
})

it('refuses a file that is not a workbook', async () => {
  const zip = new JSZip()
  zip.file('word/document.xml', '<w/>')
  await expect(readWorkbook(await zip.generateAsync({ type: 'arraybuffer' }))).rejects.toThrow('workbook')
})

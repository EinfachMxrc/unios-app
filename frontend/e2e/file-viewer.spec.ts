// SPDX-License-Identifier: AGPL-3.0-or-later

import JSZip from 'jszip'
import type { Page } from '@playwright/test'
import { expect, test } from './fixtures'

type View = 'code' | 'table' | 'docx' | 'xlsx' | 'image'

/** Serves one stored file through the document API and the viewer route, as the backend would. */
async function serve(page: Page, id: number, filename: string, view: View, body: Buffer | string, contentType: string) {
  await page.route(`**/api/documents/${id}`, route => route.fulfill({ json: {
    version_id: id, resource_name: filename, course_id: 1, course_name: 'Programmieren 1',
    filename, view, size: typeof body === 'string' ? body.length : body.byteLength, markdown: '',
  } }))
  await page.route(`**/files/${id}/view`, route => route.fulfill({ body, contentType }))
}

async function docx(text: string): Promise<Buffer> {
  const zip = new JSZip()
  zip.file('[Content_Types].xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
<Default Extension="xml" ContentType="application/xml"/>
<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
</Types>`)
  zip.file('_rels/.rels', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
</Relationships>`)
  zip.file('word/document.xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>
<w:p><w:r><w:rPr><w:b/></w:rPr><w:t>Übungsblatt 3</w:t></w:r></w:p>
<w:p><w:r><w:t>${text}</w:t></w:r></w:p>
<w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1417" w:right="1417" w:bottom="1134" w:left="1417"/></w:sectPr>
</w:body></w:document>`)
  return zip.generateAsync({ type: 'nodebuffer' })
}

async function xlsx(): Promise<Buffer> {
  const zip = new JSZip()
  zip.file('xl/workbook.xml', `<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"
xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>
<sheet name="Punkte" sheetId="1" r:id="rId1"/><sheet name="Termine" sheetId="2" r:id="rId2"/></sheets></workbook>`)
  zip.file('xl/_rels/workbook.xml.rels', `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Target="worksheets/sheet2.xml"/></Relationships>`)
  zip.file('xl/worksheets/sheet1.xml', `<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>
<row r="1"><c r="A1" t="inlineStr"><is><t>Aufgabe</t></is></c><c r="B1" t="inlineStr"><is><t>Punkte</t></is></c></row>
<row r="2"><c r="A2" t="inlineStr"><is><t>Schleifen</t></is></c><c r="B2"><v>8</v></c></row></sheetData></worksheet>`)
  zip.file('xl/worksheets/sheet2.xml', `<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>
<row r="1"><c r="A1" t="inlineStr"><is><t>Klausur</t></is></c></row></sheetData></worksheet>`)
  return zip.generateAsync({ type: 'nodebuffer' })
}

test('code from a course opens highlighted with line numbers instead of downloading', async ({ page }) => {
  await serve(page, 901, 'aufgabe1.py', 'code', 'def quadrat(x):\n    return x * x\n', 'text/plain; charset=utf-8')
  await page.goto('/document/901')
  await expect(page.getByRole('heading', { name: 'aufgabe1.py' })).toBeVisible()
  const code = page.locator('.code-view')
  await expect(code).toContainText('return x * x')
  await expect(code.locator('.hljs-keyword').first()).toHaveText('def')
  await expect(code.locator('.code-view-lines')).toHaveText('1\n2')
  await expect(page.getByRole('link', { name: 'Herunterladen' })).toHaveAttribute('href', '/files/901')
})

test('a CSV opens as a table with a sticky header', async ({ page }) => {
  await serve(page, 902, 'noten.csv', 'table', 'Modul;Note\nAnalysis;1,3\nProgrammieren;2,0\n', 'text/plain; charset=utf-8')
  await page.goto('/document/902')
  await expect(page.getByRole('columnheader', { name: 'Modul' })).toBeVisible()
  await expect(page.getByRole('cell', { name: '2,0' })).toBeVisible()
})

test('Word and Excel files open in the app without any office program', async ({ page }) => {
  await serve(page, 903, 'blatt3.docx', 'docx', await docx('Schreibe eine Schleife, die bis zehn zählt.'),
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document')
  await page.goto('/document/903')
  await expect(page.locator('.docx-view')).toContainText('Schreibe eine Schleife, die bis zehn zählt.')
  await expect(page.locator('.docx-view section.docx')).toHaveCount(1)

  await serve(page, 904, 'punkte.xlsx', 'xlsx', await xlsx(), 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
  await page.goto('/document/904')
  await expect(page.getByRole('cell', { name: 'Schleifen' })).toBeVisible()
  await page.getByRole('tab', { name: 'Termine' }).click()
  await expect(page.getByRole('columnheader', { name: 'Klausur' })).toBeVisible()
})

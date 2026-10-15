// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, expect, it, test } from 'vitest'
import { fileViewKind, hasPdfView, openHref } from './materialView'

test('TXT original filenames get PDF links even with an unknown MIME type', () => {
  expect(hasPdfView('Hinweise.TXT', 'application/octet-stream')).toBe(true)
  expect(hasPdfView('Skript', 'application/pdf')).toBe(true)
  expect(hasPdfView('archive.txt.zip', 'text/plain')).toBe(false)
  expect(hasPdfView('README.md', 'text/plain')).toBe(false)
})

describe('openHref', () => {
  it('opens PDFs and Office files in the reader and web pages as readable text', () => {
    expect(openHref(7, 'Skript.pdf', 'application/pdf')).toBe('/material/7')
    expect(openHref(7, 'Folien.pptx', null)).toBe('/material/7')
    expect(openHref(8, 'index.html', 'text/html')).toBe('/document/8')
    expect(openHref(8, 'Tagebuch', 'text/html')).toBe('/document/8')
    expect(openHref(9, 'Notizen.md', null)).toBe('/document/9')
  })
  it('offers nothing to open for files the app cannot show, so download stays the action', () => {
    expect(openHref(10, 'Programm.zip', 'application/zip')).toBeNull()
  })
})

describe('fileViewKind', () => {
  it('opens code, text, tables, media and Office files in the viewer instead of downloading', () => {
    expect(openHref(11, 'Aufgabe1.py', 'text/x-python')).toBe('/document/11')
    expect(openHref(12, 'Messwerte.csv', 'text/csv')).toBe('/document/12')
    expect(openHref(13, 'Tafelbild.JPG', 'image/jpeg')).toBe('/document/13')
    expect(openHref(14, 'Bericht.docx', null)).toBe('/document/14')
    expect(openHref(15, 'Noten.xlsx', null)).toBe('/document/15')
    expect(openHref(16, 'Makefile', null)).toBe('/document/16')
  })
  it('keeps slides and PDFs in the reader and mirrors the server list', () => {
    expect(openHref(17, 'Folien.pptx', null)).toBe('/material/17')
    expect(fileViewKind('Vortrag.mp4')).toBe('video')
    expect(fileViewKind('C:\\Kurs\\aufgabe.java')).toBe('code')
    expect(fileViewKind('ohne-endung')).toBeNull()
    expect(fileViewKind('.bashrc')).toBeNull()
  })
})

// SPDX-License-Identifier: AGPL-3.0-or-later

import { expect, it } from 'vitest'
import { guessDelimiter, parseCsv } from './csvTable'

it('guesses the separator German Excel and plain CSV use', () => {
  expect(guessDelimiter('Name;Note;ECTS\nA;1,3;5')).toBe(';')
  expect(guessDelimiter('a,b,c\n1,2,3')).toBe(',')
  expect(guessDelimiter('a\tb', 'werte.tsv')).toBe('\t')
})

it('keeps quoted separators, line breaks and doubled quotes inside one field', () => {
  const { rows } = parseCsv('Titel;Kommentar\r\n"Analysis; I";"sagte ""gut""\nund mehr"\nB;', ';')
  expect(rows).toEqual([['Titel', 'Kommentar'], ['Analysis; I', 'sagte "gut"\nund mehr'], ['B', '']])
})

it('stops at the limit and says more rows follow', () => {
  const result = parseCsv('1\n2\n3\n4\n', ',', 2)
  expect(result).toEqual({ rows: [['1'], ['2']], truncated: true })
})

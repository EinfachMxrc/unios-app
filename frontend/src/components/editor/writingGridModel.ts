// SPDX-License-Identifier: AGPL-3.0-or-later

import { inCodeFence } from './markdownTyping'

export const GRID_ROWS = 20
export const GRID_COLUMNS = 6
export const GRID_CELL_LENGTH = 200
export type WritingGrid = string[][]

export function emptyWritingGrid(): WritingGrid {
  return Array.from({ length: 4 }, () => ['', '', ''])
}

export function parseWritingGrid(source: string): WritingGrid {
  if (source.length > 64_000) throw new Error('grid')
  const value: unknown = JSON.parse(source)
  if (!Array.isArray(value) || !value.length || value.length > GRID_ROWS) throw new Error('grid')
  const columns = Array.isArray(value[0]) ? value[0].length : 0
  if (
    !columns ||
    columns > GRID_COLUMNS ||
    value.some(
      (row) =>
        !Array.isArray(row) ||
        row.length !== columns ||
        row.some((cell) => typeof cell !== 'string' || cell.length > GRID_CELL_LENGTH || /[\r\n\t]/.test(cell)),
    )
  )
    throw new Error('grid')
  return value as WritingGrid
}

/** Only an actual top-level grid fence is editable, never an example inside code. */
export function writingGridAt(body: string, from: number, to: number) {
  for (const match of body.matchAll(/^```unios-grid\n([^\n]+)\n```[ \t]*(?:\n|$)/gm)) {
    const end = match.index + match[0].length
    if (from < match.index || to > end || inCodeFence(body, match.index)) continue
    try {
      return { from: match.index, to: end, rows: parseWritingGrid(JSON.parse(match[1]).source) }
    } catch {
      return null
    }
  }
  return null
}

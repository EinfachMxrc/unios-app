// SPDX-License-Identifier: AGPL-3.0-or-later

import { useRef, type KeyboardEvent } from 'react'
import { flushSync } from 'react-dom'
import { useT } from '@/i18n/useT'
import { inlineMathSource, inlineMathStart } from './mathSyntax'
import { renderFormula } from './math'
import { GRID_CELL_LENGTH, GRID_COLUMNS, GRID_ROWS, type WritingGrid as Rows } from './writingGridModel'
import './WritingGrid.css'

function CellText({ value }: { value: string }) {
  const parts = []
  let rest = value,
    key = 0
  while (rest) {
    const at = inlineMathStart(rest)
    if (at < 0) {
      parts.push(<span key={key}>{rest}</span>)
      break
    }
    if (at) parts.push(<span key={key++}>{rest.slice(0, at)}</span>)
    const formula = inlineMathSource(rest.slice(at))
    if (!formula) {
      parts.push(<span key={key++}>{rest[at]}</span>)
      rest = rest.slice(at + 1)
      continue
    }
    const html = renderFormula(formula.latex, false)
    parts.push(
      html ? <span key={key++} dangerouslySetInnerHTML={{ __html: html }} /> : <span key={key++}>{formula.raw}</span>,
    )
    rest = rest.slice(at + formula.raw.length)
  }
  return <>{parts}</>
}

/** Cell geometry depends only on the grid, never on the amount of typed text. */
export function WritingGrid({ rows, onChange }: { rows: Rows; onChange?: (rows: Rows) => void }) {
  const { t } = useT('notes')
  const root = useRef<HTMLDivElement>(null)
  function focus(index: number) {
    const target = () => root.current?.querySelector<HTMLInputElement>(`[data-grid-cell="${index}"]`)
    const existing = target()
    if (existing) existing.focus()
    else requestAnimationFrame(() => target()?.focus())
  }
  function next(event: KeyboardEvent<HTMLInputElement>, index: number) {
    if (
      (event.key !== 'Tab' && event.key !== 'Enter') ||
      event.nativeEvent.isComposing ||
      event.altKey ||
      event.ctrlKey ||
      event.metaKey
    )
      return
    const distance = event.key === 'Enter' ? rows[0].length : 1
    const target = index + (event.shiftKey ? -distance : distance)
    if (target < 0 || (target >= rows.length * rows[0].length && rows.length >= GRID_ROWS)) {
      if (event.key === 'Enter') {
        event.preventDefault()
        event.stopPropagation()
      }
      return
    }
    event.preventDefault()
    event.stopPropagation()
    if (target >= rows.length * rows[0].length) flushSync(() => onChange?.([...rows, rows[0].map(() => '')]))
    focus(target)
  }
  return (
    <div className="writing-grid-block" ref={root}>
      <div className="writing-grid-scroll" tabIndex={onChange ? undefined : 0}>
        <div className="writing-grid" role="table" aria-label={t('grid.title')}>
          {rows.map((row, r) => (
            <div
              role="row"
              className="writing-grid-row"
              key={r}
              style={{ gridTemplateColumns: `repeat(${row.length}, 14rem)` }}
            >
              {row.map((value, c) => (
                <div role="cell" className="writing-grid-cell" key={c}>
                  {onChange && (
                    <input
                      data-grid-cell={r * row.length + c}
                      aria-label={t('grid.cell', { row: r + 1, column: c + 1 })}
                      maxLength={GRID_CELL_LENGTH}
                      value={value}
                      autoComplete="off"
                      spellCheck={false}
                      onChange={(event) => {
                        const text = event.target.value.replace(/[\r\n\t]/g, ' ').slice(0, GRID_CELL_LENGTH)
                        onChange(
                          rows.map((line, i) => (i === r ? line.map((cell, j) => (j === c ? text : cell)) : line)),
                        )
                      }}
                      onKeyDown={(event) => next(event, r * row.length + c)}
                    />
                  )}
                  <div
                    className="writing-grid-preview"
                    aria-hidden={onChange ? true : undefined}
                    tabIndex={onChange || !value ? undefined : 0}
                    title={value}
                  >
                    <CellText value={value} />
                  </div>
                </div>
              ))}
            </div>
          ))}
        </div>
      </div>
      {onChange && (
        <>
          <p className="muted-text writing-grid-hint">{t('grid.hint')}</p>
          <div className="study-insert-tools">
            <button
              type="button"
              disabled={rows.length >= GRID_ROWS}
              onClick={() => {
                flushSync(() => onChange([...rows, rows[0].map(() => '')]))
                focus(rows.length * rows[0].length)
              }}
            >
              {t('grid.addRow')}
            </button>
            <button
              type="button"
              disabled={rows[0].length >= GRID_COLUMNS}
              onClick={() => onChange(rows.map((row) => [...row, '']))}
            >
              {t('grid.addColumn')}
            </button>
          </div>
        </>
      )}
    </div>
  )
}

// SPDX-License-Identifier: AGPL-3.0-or-later

import { useMemo, useRef, useEffect, useState } from 'react'
import { useT } from '@/i18n/useT'
import { Dialog, DialogContent, DialogDescription, DialogTitle } from './StudioDialog'
import {
  buildTruthTable,
  compareLogicEquation,
  MAX_LOGIC_LENGTH,
  TruthTableError,
  truthTableMarkdown,
} from './truthTable'
import { groupTerm, karnaugh, normalForms } from './logicForms'
import { markdownTable } from './studyModels'
import { useStudyDialogEscape } from './useStudyDialogEscape'
import TruthTableBoard from './TruthTableBoard'
import { truthBoardMarkdown } from './truthBoardModel'
import LogicEquationResult from './LogicEquationResult'
import './StudyInsert.css'

export default function TruthTableDialog({
  initialView = 'table',
  onApply,
  onClose,
}: {
  initialView?: 'table' | 'forms' | 'kv'
  onApply: (markdown: string) => void
  onClose: () => void
}) {
  const { t } = useT('notes')
  const content = useStudyDialogEscape(onClose)
  const input = useRef<HTMLInputElement>(null)
  const [expression, setExpression] = useState('A & B')
  const [intermediate, setIntermediate] = useState(false)
  const [results, setResults] = useState(true)
  const [view, setView] = useState<string>(initialView)
  const [selected, setSelected] = useState<number[]>([])
  const [groups, setGroups] = useState<number[][]>([])
  const computation = useMemo(() => {
    try {
      return {
        comparison: compareLogicEquation(expression),
        table: buildTruthTable(expression, intermediate),
        error: null,
      }
    } catch (error) {
      return {
        comparison: null,
        table: null,
        error: error instanceof TruthTableError ? error.code : ('syntax' as const),
      }
    }
  }, [expression, intermediate])
  useEffect(() => {
    input.current?.focus()
    input.current?.select()
  }, [])
  const table = computation.table
  const forms = table && normalForms(table),
    map = table && karnaugh(table)
  const term = table && groupTerm(table, selected)
  const covered = table && table.rows.every((row, i) => !row.at(-1) || groups.some((group) => group.includes(i)))
  function apply() {
    if (!table || (view === 'kv' && !map)) return
    if (view === 'forms' && forms) onApply(`\n\n**DNF**\n\n${forms.dnf}\n\n**KNF**\n\n${forms.cnf}\n\n`)
    else if (view === 'kv' && map)
      onApply(
        markdownTable(
          [`${map.rowVariables} / ${map.columnVariables}`, ...map.columnLabels],
          map.cells.map((row, i) => [map.rowLabels[i], ...row.map((cell) => (results ? cell.value : ''))]),
        ) +
          (results && groups.length
            ? `\n\n${t(covered ? 'logic.completeGroups' : 'logic.partialGroups')}: ${groups.map((group) => groupTerm(table, group)).join(' ∨ ')}\n\n`
            : ''),
      )
    else
      onApply(
        truthBoardMarkdown(table, results, { term: t('logic.rowTerm'), sum: t('logic.sumTitle') }) +
          (intermediate ? `\n\n**${t('logic.intermediate')}**${truthTableMarkdown(table, results)}` : ''),
      )
  }
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onClose()
      }}
    >
      <DialogContent
        ref={content}
        className="studio-dialog study-insert-dialog truth-dialog"
        onEscapeKeyDown={(event) => {
          event.preventDefault()
          event.stopPropagation()
          onClose()
        }}
        onKeyDown={(event) => {
          if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) {
            event.preventDefault()
            event.stopPropagation()
            apply()
          }
        }}
      >
        <DialogTitle>{t('logic.title')}</DialogTitle>
        <DialogDescription>{t('logic.description')}</DialogDescription>
        <label className="logic-expression">
          {t('logic.expression')}
          <input
            ref={input}
            value={expression}
            maxLength={MAX_LOGIC_LENGTH}
            spellCheck={false}
            aria-invalid={!!computation.error}
            aria-describedby="logic-help"
            onChange={(event) => {
              setExpression(event.target.value)
              setSelected([])
              setGroups([])
            }}
          />
        </label>
        <details id="logic-help" className="truth-input-help">
          <summary>{t('logic.inputHelp')}</summary>
          <p className="muted-text">{t('logic.operators')}</p>
        </details>
        <div className="truth-controls">
          <label className="study-field">
            {t('logic.view')}
            <select value={view} onChange={(event) => setView(event.target.value)}>
              <option value="table">{t('logic.title')}</option>
              <option value="forms">{t('logic.forms')}</option>
              <option value="kv">{t('logic.kv')}</option>
            </select>
          </label>
          <div className="logic-options">
            <label>
              <input
                type="checkbox"
                checked={intermediate}
                onChange={(event) => setIntermediate(event.target.checked)}
              />
              {t('logic.intermediate')}
            </label>
            {view !== 'forms' && (
              <label>
                <input type="checkbox" checked={results} onChange={(event) => setResults(event.target.checked)} />
                {t('logic.results')}
              </label>
            )}
          </div>
        </div>
        {computation.comparison && <LogicEquationResult comparison={computation.comparison} />}
        {computation.error && <p role="status">{t(`logic.error_${computation.error}`)}</p>}
        {table && view === 'forms' && forms && (
          <div className="study-text">
            <strong>DNF</strong>
            <p>{forms.dnf}</p>
            <strong>KNF</strong>
            <p>{forms.cnf}</p>
          </div>
        )}
        {table &&
          view === 'kv' &&
          (map ? (
            <>
              <p>{t('logic.kvHint')}</p>
              <div className="logic-table-scroll" tabIndex={0} role="region" aria-label={t('logic.kv')}>
                <table className="logic-table">
                  <thead>
                    <tr>
                      <th scope="col">
                        {map.rowVariables} / {map.columnVariables}
                      </th>
                      {map.columnLabels.map((label) => (
                        <th scope="col" key={label}>
                          {label}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {map.cells.map((row, i) => (
                      <tr key={i}>
                        <th scope="row">{map.rowLabels[i]}</th>
                        {row.map((cell, j) => (
                          <td key={j}>
                            <button
                              type="button"
                              aria-pressed={selected.includes(cell.index)}
                              aria-label={t('logic.kvCell', {
                                bits: map.rowLabels[i] + map.columnLabels[j],
                                value: results ? cell.value : '—',
                              })}
                              onClick={() =>
                                setSelected((current) =>
                                  current.includes(cell.index)
                                    ? current.filter((n) => n !== cell.index)
                                    : [...current, cell.index],
                                )
                              }
                            >
                              {results ? cell.value : '—'}
                            </button>
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {results && (
                <>
                  <p role="status">{selected.length ? (term ?? t('logic.invalidGroup')) : t('logic.selectGroup')}</p>
                  <button
                    type="button"
                    disabled={!term}
                    onClick={() => {
                      setGroups((current) => [...current, selected])
                      setSelected([])
                    }}
                  >
                    {t('logic.addGroup')}
                  </button>
                  {groups.length > 0 && (
                    <>
                      <p>
                        {t(covered ? 'logic.completeGroups' : 'logic.partialGroups')}:{' '}
                        {groups.map((group) => groupTerm(table, group)).join(' ∨ ')}
                      </p>
                      <button
                        type="button"
                        onClick={() => {
                          setGroups([])
                          setSelected([])
                        }}
                      >
                        {t('logic.clearGroups')}
                      </button>
                    </>
                  )}
                </>
              )}
            </>
          ) : (
            <p role="status">{t('logic.kvLimit')}</p>
          ))}
        {table && view === 'table' && (
          <>
            <TruthTableBoard table={table} expression={expression} results={results} />
            {intermediate && (
              <section className="truth-intermediate">
                <h3>{t('logic.intermediate')}</h3>
                <div className="logic-table-scroll" tabIndex={0} role="region" aria-label={t('logic.intermediate')}>
                  <table className="logic-table">
                    <thead>
                      <tr>
                        {table.columns.map((column, index) => (
                          <th key={index} scope="col">
                            {column}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {table.rows.map((row, index) => (
                        <tr key={index}>
                          {row.map((cell, column) => (
                            <td key={column}>{results || column < table.variableCount ? cell : '—'}</td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>
            )}
          </>
        )}
        <div className="study-insert-actions">
          <button type="button" onClick={onClose}>
            {t('cancelButton')}
          </button>
          <button type="button" disabled={!table || (view === 'kv' && !map)} onClick={apply}>
            {t('logic.apply')}
          </button>
        </div>
      </DialogContent>
    </Dialog>
  )
}

// SPDX-License-Identifier: AGPL-3.0-or-later

import './TruthTableBoard.css'
import { memo } from 'react'
import { useT } from '@/i18n/useT'
import { renderFormula } from './math'
import { logicVariableLatex } from './logicNotation'
import { logicExpressionLatex, type TruthTable } from './truthTable'
import { truthBoardRows } from './truthBoardModel'

const Formula = memo(function Formula({ latex }: { latex: string }) {
  const html = renderFormula(latex, false)
  return html ? <span className="truth-board-math" dangerouslySetInnerHTML={{ __html: html }} /> : <span>{latex}</span>
})

export default function TruthTableBoard({
  table,
  expression,
  results,
}: {
  table: TruthTable
  expression: string
  results: boolean
}) {
  const { t } = useT('notes')
  const variables = table.columns.slice(0, table.variableCount)
  const rows = truthBoardRows(table)
  const ones = results ? rows.filter((row) => row.output === 1) : []
  return (
    <section className="truth-board">
      <div className="truth-board-heading">
        <Formula latex={`Y = ${logicExpressionLatex(expression)}`} />
        <span className="muted-text">{t('logic.combinations', { count: rows.length })}</span>
      </div>
      <div className={`truth-board-layout${results ? '' : ' truth-board-no-results'}`}>
        <div
          className="logic-table-scroll truth-board-scroll"
          tabIndex={0}
          role="region"
          aria-label={t('logic.preview')}
        >
          <table className="logic-table truth-board-table">
            <thead>
              <tr>
                {variables.map((name) => (
                  <th scope="col" key={name}>
                    <Formula latex={logicVariableLatex(name)} />
                  </th>
                ))}
                <th scope="col" className="truth-board-term">
                  {t('logic.rowTerm')}
                </th>
                <th scope="col" className="truth-board-output">
                  <span aria-label={t('logic.output')}>Y</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row, index) => (
                <tr key={index} className={results && row.output === 1 ? 'truth-row-one' : undefined}>
                  {row.inputs.map((value, column) => (
                    <td key={column}>{value}</td>
                  ))}
                  <td className="truth-board-term">
                    <Formula latex={row.term} />
                  </td>
                  <td className="truth-board-output">
                    <span className="truth-result">{results ? row.output : '—'}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {results && (
          <aside className="truth-board-sum" aria-label={t('logic.sumTitle')}>
            <h3>{t('logic.sumTitle')}</h3>
            <p className="muted-text">{t('logic.sumHint', { count: ones.length })}</p>
            <div className="truth-board-equation">
              <Formula latex="Y =" />
              <div>
                {ones.length ? (
                  ones.map((row, index) => (
                    <div className="truth-sum-term" key={index}>
                      {index > 0 && <span aria-hidden="true">+</span>}
                      <Formula latex={row.term} />
                    </div>
                  ))
                ) : (
                  <Formula latex="0" />
                )}
              </div>
            </div>
          </aside>
        )}
      </div>
      <p className="truth-board-hint muted-text">{t('logic.termHint')}</p>
    </section>
  )
}

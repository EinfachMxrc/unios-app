// SPDX-License-Identifier: AGPL-3.0-or-later

import { useT } from '@/i18n/useT'

/** A grid of cells with a sticky first row; the first row is usually the header. */
export function TableView({ rows, truncated, label }: { rows: string[][]; truncated: boolean; label: string }) {
  const { t } = useT('material')
  if (!rows.length) return <p className="muted-text">{t('viewerEmptySheet')}</p>
  const width = Math.max(...rows.map(row => row.length))
  const [head, ...body] = rows
  const cells = (row: string[]) => Array.from({ length: width }, (_, index) => row[index] ?? '')
  return <>
    <div className="table-view" tabIndex={0} role="region" aria-label={label}>
      <table>
        <thead>
          <tr>
            <th scope="col" className="table-view-index" />
            {cells(head).map((cell, index) => <th scope="col" key={index}>{cell}</th>)}
          </tr>
        </thead>
        <tbody>
          {body.map((row, rowIndex) => <tr key={rowIndex}>
            <th scope="row" className="table-view-index">{rowIndex + 2}</th>
            {cells(row).map((cell, index) => <td key={index}>{cell}</td>)}
          </tr>)}
        </tbody>
      </table>
    </div>
    {truncated && <p className="muted-text viewer-note">{t('viewerRowsShown', { count: rows.length })}</p>}
  </>
}

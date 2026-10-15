// SPDX-License-Identifier: AGPL-3.0-or-later

import { useT } from '@/i18n/useT'
import type { LogicComparison } from './truthTable'

export default function LogicEquationResult({ comparison }: { comparison: LogicComparison }) {
  const { t } = useT('notes')
  const example = comparison.counterexample
  const values =
    example &&
    Object.entries(example.values)
      .map(([name, value]) => `${name} = ${value}`)
      .join(', ')
  return (
    <div role="status">
      <p>{t(comparison.equivalent ? 'logic.equivalent' : 'logic.different', { count: comparison.combinations })}</p>
      {example && (
        <p>
          {t(values ? 'logic.counterexample' : 'logic.constantCounterexample', {
            values,
            left: example.left,
            right: example.right,
          })}
        </p>
      )}
    </div>
  )
}

// SPDX-License-Identifier: AGPL-3.0-or-later

export type NumberMath = { raw: string; latex: string }
const LIMIT = 256

export function numberNotationBoundary(source: string, index: number): boolean {
  return index === 0 || /[\s=+*<>:;,[(-]/.test(source[index - 1])
}
function complete(source: string, length: number): boolean {
  const next = source[length]
  return !next || (!/[A-Za-z0-9_^]/.test(next) && (next !== '.' || !/\w/.test(source[length + 1] ?? '')))
}

/** Familiar writing, without changing the numerical value or doing arithmetic. */
export function numberMathSource(source: string): NumberMath | null {
  const prefix = source.slice(0, LIMIT)
  const power = /^((?:[+-]?\d+|[A-Za-z])?)\^([+-]?\d+|\{[+-]?\d+\})/.exec(prefix)
  if (power && complete(source, power[0].length)) {
    if (source.startsWith('\\$', power[0].length)) return null
    const exponent = power[2].replace(/[{}]/g, '')
    return { raw: power[0], latex: `${power[1] || '{}'}^{${exponent}}` }
  }
  if (source[0] !== '(') return null
  let depth = 0
  for (let index = 0; index < Math.min(source.length, LIMIT); index++) {
    if (source[index] === '(') depth++
    if (source[index] !== ')' || --depth !== 0) continue
    const suffix = /^_?(16|10|8|2)/.exec(source.slice(index + 1, index + 5))
    if (!suffix) return null
    const end = index + 1 + suffix[0].length
    if (!complete(source, end)) return null
    const inner = source.slice(1, index)
    if (!inner.trim() || !/^[\d+\-*/^().{} \t]+$/.test(inner) || /\^(?![+-]?\d|\{[+-]?\d+\})/.test(inner)) return null
    const latex = inner.replace(/\^([+-]?\d+)/g, '^{$1}').replaceAll('*', '\\cdot ')
    return { raw: source.slice(0, end), latex: `\\left(${latex}\\right)_{${suffix[1]}}` }
  }
  return null
}

/** Finish on a separator so 2^15 is not prematurely turned into 2^1. */
export function numberMathInput(source: string) {
  const suffix = source.at(-1) ?? ''
  if (!/[ \t=+*-]/.test(suffix)) return null
  const end = source.length - 1
  for (let index = Math.max(0, end - LIMIT); index < end; index++) {
    if (!numberNotationBoundary(source, index)) continue
    const before = source.slice(0, index)
    const unescaped = (character: string) =>
      [...before.matchAll(new RegExp(`\\${character}`, 'g'))].filter((match) => {
        let slashes = 0
        for (let at = match.index! - 1; at >= 0 && before[at] === '\\'; at--) slashes++
        return slashes % 2 === 0
      }).length
    const dollars = unescaped('$')
    const escapedDollars = before.match(/\\\$/g)?.length ?? 0
    if (dollars % 2 || escapedDollars % 2 || unescaped('`') % 2 ||
      before.lastIndexOf('\\(') > before.lastIndexOf('\\)') ||
      before.lastIndexOf('\\[') > before.lastIndexOf('\\]')) continue
    if (source[index] !== '(' && (before.match(/\(/g)?.length ?? 0) > (before.match(/\)/g)?.length ?? 0)) continue
    const formula = numberMathSource(source.slice(index, end))
    if (formula && index + formula.raw.length === end)
      return { index, text: source.slice(index), data: { latex: formula.latex, suffix } }
  }
  return null
}

/** Explicit base 2 keeps ordinary decimal column calculations untouched. */
export function binaryColumnSource(source: string): NumberMath | null {
  const match = /^([^\n]{1,300})\n([^\n]{1,300})\n([^\n]{1,300})(?:\n|$)/.exec(source)
  if (!match) return null
  const bits = (operand: string) => {
    const plain = /^\(([01]{1,65})\)_?2$/.exec(operand.trim())
    const math = /^\$\\left\(([01]{1,65})\\right\)_\{2\}\$$/.exec(operand.trim())
    return plain?.[1] ?? math?.[1] ?? null
  }
  const operator = /^\s*([+-])\s*(.+?)\s*$/.exec(match[2])
  const result = /^\s*=\s*(.+?)\s*$/.exec(match[3])
  if (!operator || !result) return null
  const a = bits(match[1]),
    b = bits(operator[2]),
    c = bits(result[1])
  if (!a || !b || !c) return null
  const number = (value: string) => `\\left(${value}\\right)_{2}`
  return {
    raw: match[0],
    latex: `\\begin{array}{r}${number(a)}\\\\${operator[1]}\\,${number(b)}\\\\\\hline ${number(c)}\\end{array}`,
  }
}

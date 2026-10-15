// SPDX-License-Identifier: AGPL-3.0-or-later

import { binaryColumnSource, numberMathSource, numberNotationBoundary } from './numberNotation'

export type MathSource = { raw: string; latex: string }

export function isMathDelimiterEscaped(source: string, index: number): boolean {
  let slashes = 0
  for (let before = index - 1; before >= 0 && source[before] === '\\'; before--) slashes++
  return slashes % 2 === 1
}

/** Consume only a complete formula at the current Markdown lexer position. */
export function inlineMathSource(source: string): MathSource | null {
  if (source.startsWith('\\(')) {
    for (let end = 2; end < source.length && source[end] !== '\n'; end++) {
      if (source.startsWith('\\)', end) && !isMathDelimiterEscaped(source, end)) {
        const latex = source.slice(2, end)
        return latex.trim() ? { raw: source.slice(0, end + 2), latex } : null
      }
    }
    return null
  }
  // Prices, escaped dollars, and whitespace next to a dollar delimiter stay text.
  if (source[0] !== '$') return numberMathSource(source)
  if (!source[1] || /[\s$]/.test(source[1])) return null
  for (let end = 1; end < source.length && source[end] !== '\n'; end++) {
    if (source[end] === '\\') {
      end++
      continue
    }
    if (source[end] !== '$') continue
    if (/\s/.test(source[end - 1]) || /[\d$]/.test(source[end + 1] ?? '')) return null
    return { raw: source.slice(0, end + 1), latex: source.slice(1, end) }
  }
  return null
}

/** Block delimiters must occupy an entire line, or enclose one entire line. */
export function blockMathSource(source: string): MathSource | null {
  const opening = /^ {0,3}(\$\$|\\\[)/.exec(source)
  if (!opening) return binaryColumnSource(source)
  const close = opening[1] === '$$' ? '$$' : '\\]'
  const bodyStart = opening[0].length
  const firstLineEnd = source.indexOf('\n', bodyStart)
  const firstLine = source.slice(bodyStart, firstLineEnd < 0 ? source.length : firstLineEnd)
  const lineContent = firstLine.replace(/[ \t]+$/, '')
  const end = bodyStart + lineContent.length - close.length
  if (lineContent.endsWith(close) && !isMathDelimiterEscaped(source, end)) {
    const latex = source.slice(bodyStart, end)
    return latex.trim() ? { raw: source.slice(0, firstLineEnd < 0 ? source.length : firstLineEnd + 1), latex } : null
  }
  if (firstLineEnd < 0 || firstLine.trim()) return null
  // Visit each line once, including very large, malformed imported sources.
  for (let lineStart = firstLineEnd + 1; lineStart < source.length;) {
    const lineEnd = source.indexOf('\n', lineStart)
    const line = source.slice(lineStart, lineEnd < 0 ? source.length : lineEnd)
    if (/^ {0,3}$/.test(line.slice(0, line.indexOf(close))) && line.trim() === close) {
      const latex = source.slice(firstLineEnd + 1, lineStart - 1)
      return latex.trim() ? { raw: source.slice(0, lineEnd < 0 ? source.length : lineEnd + 1), latex } : null
    }
    if (lineEnd < 0) break
    lineStart = lineEnd + 1
  }
  return null
}

export function inlineMathStart(source: string): number {
  for (let index = 0; index < source.length; index++) {
    if (
      numberNotationBoundary(source, index) &&
      /[0-9A-Za-z(^]/.test(source[index]) &&
      numberMathSource(source.slice(index))
    )
      return index
    if ((source[index] === '$' || source.startsWith('\\(', index)) && !isMathDelimiterEscaped(source, index))
      return index
  }
  return -1
}

export function blockMathStart(source: string): number {
  const explicit = /(?:^|\n) {0,3}(?:\$\$|\\\[)/.exec(source)?.index ?? -1
  const column = /(?:^|\n)[ \t]*\([01]{1,65}\)_?2[ \t]*\n/.exec(source)
  const start = column ? column.index + (source[column.index] === '\n' ? 1 : 0) : -1
  return start >= 0 && binaryColumnSource(source.slice(start)) && (explicit < 0 || start < explicit) ? start : explicit
}

export function inlineMathInput(
  source: string,
  maxLength = 4000,
): { index: number; text: string; data: { latex: string } } | null {
  // A very long prose paragraph must not turn every previous opener into a new
  // full scan on each key. Include the two-character delimiters at the boundary.
  for (let index = Math.max(0, source.length - maxLength - 4); index < source.length; index++) {
    if (source[index] !== '$' && !source.startsWith('\\(', index)) continue
    if (isMathDelimiterEscaped(source, index) || (source[index] === '$' && source[index - 1] === '$')) continue
    const formula = inlineMathSource(source.slice(index))
    if (formula && formula.latex.length <= maxLength && index + formula.raw.length === source.length)
      return { index, text: formula.raw, data: { latex: formula.latex } }
  }
  return null
}

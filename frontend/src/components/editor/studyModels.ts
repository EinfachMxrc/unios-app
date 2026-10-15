// SPDX-License-Identifier: AGPL-3.0-or-later

import { parseWritingGrid } from './writingGridModel'

export type StudyKind = 'diagram' | 'recall' | 'grid'
export type Diagram = { nodes: string[]; edges: { from: number; to: number; label: string }[] }
export function parseDiagram(source: string): Diagram {
  if (!source.trim() || source.length > 3000) throw new Error('diagram')
  const nodes: string[] = [],
    edges: Diagram['edges'] = []
  function node(label: string) {
    const name = label.trim()
    if (!name || name.length > 60 || /[<>\r\n]/.test(name)) throw new Error('diagram')
    if (!nodes.includes(name)) nodes.push(name)
    if (nodes.length > 20) throw new Error('diagram')
    return nodes.indexOf(name)
  }
  for (const line of source
    .split('\n')
    .map((s) => s.trim())
    .filter(Boolean)) {
    const parts = line.split(/\s*->\s*/)
    if (parts.length === 1) {
      node(parts[0])
      continue
    }
    if (parts.length !== 2) throw new Error('diagram')
    const [target, ...description] = parts[1].split(/\s+:\s+/)
    const label = description.join(' : ')
    if (label.length > 50) throw new Error('diagram')
    edges.push({ from: node(parts[0]), to: node(target), label })
    if (edges.length > 32) throw new Error('diagram')
  }
  return { nodes, edges }
}
export function diagramPositions(diagram: Diagram): { x: number; y: number }[] {
  const depth = diagram.nodes.map(() => 0),
    incoming = diagram.nodes.map((_, i) => diagram.edges.filter((e) => e.to === i).length)
  const queue = incoming.flatMap((n, i) => (n === 0 ? [i] : [])),
    visited: number[] = []
  while (queue.length) {
    const from = queue.shift()!
    visited.push(from)
    for (const edge of diagram.edges.filter((e) => e.from === from)) {
      depth[edge.to] = Math.max(depth[edge.to], depth[from] + 1)
      if (--incoming[edge.to] === 0) queue.push(edge.to)
    }
  }
  if (visited.length !== diagram.nodes.length)
    return diagram.nodes.map((_, i) => ({ x: (i % 3) * 230 + 110, y: Math.floor(i / 3) * 120 + 60 }))
  const counts = new Map<number, number>()
  return depth.map((level) => {
    const index = counts.get(level) ?? 0
    counts.set(level, index + 1)
    return { x: index * 230 + 110, y: level * 120 + 60 }
  })
}
export function studyFence(kind: StudyKind, source: string): string {
  return `\n\n\`\`\`unios-${kind}\n${JSON.stringify({ source })}\n\`\`\`\n\n`
}
export function readStudyFence(markdown: string): { kind: StudyKind; source: string } | null {
  const match = /^\s*```unios-(diagram|recall|grid)\n([^\n]+)\n```/.exec(markdown)
  if (!match || match[2].length > (match[1] === 'grid' ? 100_000 : 16_000)) return null
  try {
    const value = JSON.parse(match[2]) as { source?: unknown }
    if (typeof value.source !== 'string') return null
    if (match[1] === 'diagram') parseDiagram(value.source)
    else if (match[1] === 'grid') parseWritingGrid(value.source)
    else parseRecall(value.source)
    return { kind: match[1] as StudyKind, source: value.source }
  } catch {
    return null
  }
}
export type Recall = { question: string; answer: string; hint: string }
export function parseRecall(source: string): Recall {
  if (source.length > 8000) throw new Error('recall')
  const value: unknown = JSON.parse(source)
  if (!value || typeof value !== 'object') throw new Error('recall')
  const object = value as Record<string, unknown>
  if (
    typeof object.question !== 'string' ||
    typeof object.answer !== 'string' ||
    typeof object.hint !== 'string' ||
    !object.question.trim() ||
    !object.answer.trim() ||
    [object.question, object.answer, object.hint].some((s) => s.length > 2000)
  )
    throw new Error('recall')
  return { question: object.question, answer: object.answer, hint: object.hint }
}
export function describeNumbers(source: string) {
  if (source.length > 10000) throw new Error('statistics')
  const tokens = source.trim().split(/[;\s]+/)
  if (tokens.length > 500 || tokens.some((s) => !/^[+-]?(?:\d+(?:[.,]\d*)?|[.,]\d+)(?:e[+-]?\d+)?$/i.test(s)))
    throw new Error('statistics')
  const values = tokens.map((s) => Number(s.replace(',', '.')))
  if (!values.every((n) => Number.isFinite(n) && Math.abs(n) <= 1e100)) throw new Error('statistics')
  const n = values.length,
    mean = values.reduce((sum, x) => sum + x / n, 0)
  const sorted = [...values].sort((a, b) => a - b)
  const median = n % 2 ? sorted[(n - 1) / 2] : (sorted[n / 2 - 1] + sorted[n / 2]) / 2
  const squareSum = values.reduce((sum, x) => sum + (x - mean) ** 2, 0)
  return {
    count: n,
    mean,
    median,
    min: sorted[0],
    max: sorted.at(-1)!,
    population: Math.sqrt(squareSum / n),
    sample: n > 1 ? Math.sqrt(squareSum / (n - 1)) : null,
    values,
  }
}
export function binomialProbability(n: number, k: number, p: number): number {
  if (![n, k].every(Number.isInteger) || n < 0 || n > 200 || k < 0 || k > n || !Number.isFinite(p) || p < 0 || p > 1)
    throw new Error('statistics')
  if (p === 0) return k === 0 ? 1 : 0
  if (p === 1) return k === n ? 1 : 0
  let log = k * Math.log(p) + (n - k) * Math.log1p(-p)
  for (let i = 1; i <= Math.min(k, n - k); i++) log += Math.log(n - i + 1) - Math.log(i)
  return Math.exp(log)
}
export function markdownCell(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/[\\`*_{}[\]()#+.!|~$-]/g, '\\$&')
    .replace(/[\r\n]+/g, ' ')
}
export function markdownTable(headers: string[], rows: (string | number)[][]): string {
  return (
    '\n\n' +
    [headers, headers.map(() => '---'), ...rows]
      .map((row, i) => `| ${row.map((v) => (i === 1 ? v : markdownCell(String(v)))).join(' | ')} |`)
      .join('\n') +
    '\n\n'
  )
}

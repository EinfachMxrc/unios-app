// SPDX-License-Identifier: AGPL-3.0-or-later

type TypingEdit = { from: number; to: number; text: string; caret: number }

/** Preserve literal lists inside fenced code instead of continuing their syntax. */
export function inCodeFence(body: string, lineStart: number) {
  let fence: { character: string; length: number } | null = null
  for (const line of body.slice(0, lineStart).split('\n')) {
    const match = /^ {0,3}(`{3,}|~{3,})(.*)$/.exec(line)
    if (!match) continue
    if (!fence) {
      if (match[1][0] === '`' && match[2].includes('`')) continue
      fence = { character: match[1][0], length: match[1].length }
    } else if (match[1][0] === fence.character && match[1].length >= fence.length && !match[2].trim()) fence = null
  }
  return fence !== null
}

/** Enter continues a list; an empty item ends it. Tab adjusts only list indentation. */
export function markdownTypingEdit(
  body: string,
  from: number,
  to: number,
  key: 'Enter' | 'Tab',
  shift = false,
): TypingEdit | null {
  if (from !== to || from < 0 || to > body.length) return null
  const start = body.lastIndexOf('\n', from - 1) + 1
  const end = body.indexOf('\n', from)
  const line = body.slice(start, end < 0 ? body.length : end)
  if (inCodeFence(body, start)) return null
  const match = /^([ \t]*)([-+*]|\d{1,9}[.)]) (?:\[([ xX])\] )?/.exec(line)
  if (!match || from < start + match[0].length) return null
  if (match[1].replace(/\t/g, '    ').length >= 4) {
    // Four leading spaces are code unless a preceding list provides the container.
    let nested = false
    for (const previous of body.slice(0, start).split('\n').reverse()) {
      if (!previous.trim()) continue
      const parent = /^([ \t]*)(?:[-+*]|\d{1,9}[.)]) /.exec(previous)
      if (parent && parent[1].replace(/\t/g, '    ').length < 4) {
        nested = true
        break
      }
      if (/^ {0,3}\S/.test(previous)) break
    }
    if (!nested) return null
  }
  if (key === 'Tab') {
    const removed = shift ? (/^(?: {1,2}|\t)/.exec(line)?.[0].length ?? 0) : 0
    if (shift && !removed) return null
    return { from: start, to: start + removed, text: shift ? '' : '  ', caret: from + (shift ? -removed : 2) }
  }
  if (!line.slice(match[0].length).trim()) return { from: start, to: start + line.length, text: '', caret: start }
  const numeric = /^(\d+)([.)])$/.exec(match[2])
  const marker = numeric ? `${Number(numeric[1]) + 1}${numeric[2]}` : match[2]
  const text = `\n${match[1]}${marker} ${match[3] === undefined ? '' : '[ ] '}`
  return { from, to, text, caret: from + text.length }
}

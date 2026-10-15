// SPDX-License-Identifier: AGPL-3.0-or-later

export type QuestionBlock =
  | { kind: 'text' | 'code' | 'math'; text: string; language?: string }
  | { kind: 'heading'; text: string; level: number }
  | { kind: 'list'; ordered: boolean; start: number; items: string[] }
  | { kind: 'table'; header: string[]; rows: string[][] }
type Token = { text: string; end: number; kind: 'space' | 'literal' | 'comment' | 'symbol' }

// This is a display lexer, not a Java parser. Strings and comments are atomic;
// ambiguous or incomplete legacy questions stay verbatim rather than guessed.
function javaTokens(source: string): Token[] | null {
  // Java expands Unicode escapes before lexical analysis, even outside strings.
  // A display lexer cannot safely insert whitespace into such source.
  if (/\\u+[0-9a-fA-F]{4}/.test(source)) return null
  const pattern =
    /\s+|\/\/[^\n]*|\/\*[\s\S]*?\*\/|"(?:\\[\s\S]|[^"\\])*"|'(?:\\[\s\S]|[^'\\])*'|[A-Za-z_$][\w$]*|\d+(?:\.\d+)?|[^\s]/gy
  const tokens: Token[] = []
  let match: RegExpExecArray | null
  while ((match = pattern.exec(source))) {
    const text = match[0]
    if (text === '"' || text === "'" || (text === '/' && source[pattern.lastIndex] === '*')) return null
    tokens.push({
      text,
      end: pattern.lastIndex,
      kind: /^\s/.test(text)
        ? 'space'
        : /^\/(?:\/|\*)/.test(text)
          ? 'comment'
          : /^["']/.test(text)
            ? 'literal'
            : 'symbol',
    })
  }
  return tokens
}

function legacyJava(source: string): QuestionBlock[] | null {
  if (
    source.length > 20_000 ||
    !/^\s*(?:int|long|double|float|boolean|char|byte|short|String|var)\s*(?:\[\s*\]\s*)*\s+[A-Za-z_$][\w$]*\s*(?:=|;)/.test(
      source,
    )
  )
    return null
  const tokens = javaTokens(source)
  if (!tokens) return null
  const stack: string[] = []
  let boundary = 0
  for (const token of tokens) {
    if (token.kind !== 'symbol') continue
    if (['(', '[', '{'].includes(token.text)) {
      stack.push(token.text)
      if (stack.length > 64) return null
    } else if ([')', ']', '}'].includes(token.text)) {
      if (stack.pop() !== ({ ')': '(', ']': '[', '}': '{' } as Record<string, string>)[token.text]) return null
    }
    if (stack.length === 0 && [';', '}'].includes(token.text)) {
      boundary = token.end
      const rest = source.slice(boundary)
      if (
        /^\s+(?:Welch(?:e|er|es|en)|Was|Wie|Warum|Begründe|Bestimme|Berechne|Erkläre|What|Which|Why|How|Explain|Determine|Calculate)\b/.test(
          rest,
        )
      ) {
        return [
          { kind: 'code', language: 'java', text: source.slice(0, boundary).trim() },
          { kind: 'text', text: rest.trim() },
        ]
      }
    }
  }
  return stack.length === 0 && !source.slice(boundary).trim() && boundary > 0
    ? [{ kind: 'code', language: 'java', text: source.trim() }]
    : null
}

/** Only add layout whitespace to one-line, balanced Java. Never edit literals. */
export function formatJavaSnippet(source: string): string {
  if (source.includes('\n') || source.length > 20_000) return source
  const tokens = javaTokens(source)?.filter((token) => token.kind !== 'space')
  if (!tokens || tokens.some((token) => token.kind === 'comment')) return source
  const stack: string[] = []
  for (const token of tokens) {
    if (token.kind !== 'symbol') continue
    if (['(', '[', '{'].includes(token.text)) {
      stack.push(token.text)
      if (stack.length > 64) return source
    }
    if (
      [')', ']', '}'].includes(token.text) &&
      stack.pop() !== ({ ')': '(', ']': '[', '}': '{' } as Record<string, string>)[token.text]
    )
      return source
  }
  if (stack.length) return source
  const lines: string[] = []
  const braces: boolean[] = []
  let line = '',
    indent = 0,
    parentheses = 0,
    previousEnd = 0
  const flush = () => {
    if (line) lines.push(`${'  '.repeat(indent)}${line}`)
    line = ''
  }
  tokens.forEach((token, index) => {
    const previous = tokens[index - 1]?.text
    const next = tokens[index + 1]?.text
    const symbol = token.kind === 'symbol'
    if (symbol && token.text === '}' && braces.at(-1) === false) {
      flush()
      indent = Math.max(0, indent - 1)
    }
    const start = token.end - token.text.length
    if (line && /\s/.test(source.slice(previousEnd, start))) line += ' '
    line += token.text
    previousEnd = token.end
    if (!symbol) return
    if (token.text === '(') parentheses++
    if (token.text === ')') parentheses--
    if (token.text === '{') {
      const initializer = previous === '=' || braces.at(-1) === true
      braces.push(initializer)
      if (!initializer) {
        flush()
        indent++
      }
    } else if (token.text === '}') {
      if (!braces.pop() && ![';', ',', ')', 'else', 'catch', 'finally'].includes(next ?? '')) flush()
    } else if (token.text === ';' && parentheses === 0 && braces.at(-1) !== true) flush()
  })
  flush()
  return lines.join('\n')
}

// Pipes inside code, formulas and escaped pipes are content, not cell separators.
function tableCells(line: string): string[] | null {
  const cells: string[] = []
  let cell = '',
    ticks = 0,
    dollars = 0,
    separators = 0
  for (let index = 0; index < line.length; index++) {
    const char = line[index]
    if (char === '\\' && index + 1 < line.length) {
      cell += char + line[++index]
      continue
    }
    if (char === '`') {
      let count = 1
      while (line[index + count] === '`') count++
      ticks = ticks === count ? 0 : ticks || count
      cell += '`'.repeat(count)
      index += count - 1
      continue
    }
    if (char === '$' && !ticks) {
      const count = line[index + 1] === '$' ? 2 : 1
      dollars = dollars === count ? 0 : dollars || count
      cell += '$'.repeat(count)
      index += count - 1
      continue
    }
    if (char === '|' && !ticks && !dollars) {
      cells.push(cell.trim())
      cell = ''
      separators++
      continue
    }
    cell += char
  }
  cells.push(cell.trim())
  if (!separators || ticks || dollars) return null
  if (line.trimStart().startsWith('|')) cells.shift()
  if (line.trimEnd().endsWith('|') && !/\\\|\s*$/.test(line)) cells.pop()
  return cells.length ? cells : null
}

const listLine = /^( {0,3})(?:([-+*])|(\d{1,6})[.)])\s+(.+)$/

/** Passive structure only: never interpret HTML, links, images or study widgets. */
export function questionBlocks(source: string): QuestionBlock[] {
  const legacy = legacyJava(source)
  if (legacy) return legacy
  const lines = source.replace(/\r\n/g, '\n').split('\n')
  const blocks: QuestionBlock[] = []
  let prose: string[] = []
  const flush = () => {
    if (prose.length) blocks.push({ kind: 'text', text: prose.join('\n') })
    prose = []
  }
  for (let index = 0; index < lines.length; index++) {
    const fence = /^\s{0,3}(`{3,}|~{3,})([\w+-]*)\s*$/.exec(lines[index])
    const trimmed = lines[index].trim()
    const math = trimmed === '$$' || trimmed === '\\['
    if (fence || math) {
      const closing = math ? (trimmed === '$$' ? '$$' : '\\]') : ''
      const fenceEnd = fence ? new RegExp(`^\\s{0,3}${fence[1][0]}{${fence[1].length},}\\s*$`) : null
      let end = index + 1
      while (end < lines.length && !(math ? lines[end].trim() === closing : fenceEnd!.test(lines[end]))) end++
      if (end === lines.length) end = -1
      if (end !== -1) {
        flush()
        blocks.push({
          kind: math ? 'math' : 'code',
          text: lines.slice(index + 1, end).join('\n'),
          language: fence?.[2].toLowerCase() || undefined,
        })
        index = end
        continue
      }
      // An unfinished block remains literal, including apparent Markdown inside.
      prose = prose.concat(lines.slice(index))
      break
    }
    const singleMath = /^(?:\$\$(.+)\$\$|\\\[(.+)\\\])$/.exec(trimmed)
    if (singleMath) {
      flush()
      blocks.push({ kind: 'math', text: singleMath[1] ?? singleMath[2] })
      continue
    }
    const heading = /^ {0,3}(#{1,6})\s+(.+?)(?:\s+#+\s*)?$/.exec(lines[index])
    if (heading) {
      flush()
      blocks.push({ kind: 'heading', level: heading[1].length, text: heading[2] })
      continue
    }
    const header = tableCells(lines[index])
    const separator = index + 1 < lines.length ? tableCells(lines[index + 1]) : null
    if (header && separator?.length === header.length && separator.every((cell) => /^:?-{3,}:?$/.test(cell))) {
      const rows: string[][] = []
      let end = index + 2
      while (end < lines.length) {
        const row = tableCells(lines[end])
        if (!row || row.length !== header.length) break
        rows.push(row)
        end++
      }
      flush()
      blocks.push({ kind: 'table', header, rows })
      index = end - 1
      continue
    }
    const list = listLine.exec(lines[index])
    if (list) {
      const items = [list[4]]
      const ordered = Boolean(list[3])
      let end = index + 1
      while (end < lines.length) {
        const next = listLine.exec(lines[end])
        if (next && Boolean(next[3]) === ordered && next[1] === list[1]) {
          if (ordered && Number(next[3]) !== Number(list[3]) + items.length) break
          items.push(next[4])
          end++
          continue
        }
        // Preserve nested markers as text instead of flattening their hierarchy.
        if (/^ {2,}\S/.test(lines[end]) && !/^\s*(?:`{3,}|~{3,}|\$\$|\\\[)/.test(lines[end])) {
          items[items.length - 1] += '\n' + lines[end].trimStart()
          end++
          continue
        }
        break
      }
      flush()
      blocks.push({ kind: 'list', ordered, start: ordered ? Number(list[3]) : 1, items })
      index = end - 1
      continue
    }
    if (!lines[index].trim()) flush()
    else prose.push(lines[index])
  }
  flush()
  return blocks
}

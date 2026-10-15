// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, expect, it } from 'vitest'
import { formatJavaSnippet, questionBlocks } from './assessmentQuestion'

const screenshotCode = 'int[] a={1,4,7}; int s=0; for(int i=0;i<a.length;i++){ if(a[i]%2!=0 && a[i]>2){s+=a[i];} }'
const screenshotPrompt = 'Welchen Wert hat s? Begründe für jedes Element, ob es addiert wird.'

describe('assessment question content', () => {
  it('separates the existing one-line Java question from its instruction without adding an answer', () => {
    expect(questionBlocks(`${screenshotCode} ${screenshotPrompt}`)).toEqual([
      { kind: 'code', language: 'java', text: screenshotCode },
      { kind: 'text', text: screenshotPrompt },
    ])
  })

  it('keeps a complete Java-only question available as code', () => {
    expect(questionBlocks('int[] values={1,2}; for(int i=0;i<values.length;i++){ values[i]++; }')).toEqual([
      { kind: 'code', language: 'java', text: 'int[] values={1,2}; for(int i=0;i<values.length;i++){ values[i]++; }' },
    ])
  })

  it('recognizes English instructions after complete statements', () => {
    expect(questionBlocks('boolean ready=false; What value does ready contain?')).toEqual([
      { kind: 'code', language: 'java', text: 'boolean ready=false;' },
      { kind: 'text', text: 'What value does ready contain?' },
    ])
  })

  it('does not interpret question words or braces inside literals as instruction boundaries', () => {
    const code = 'String text="; What { value? } \\"quoted\\""; char end=\'}\';'
    expect(questionBlocks(`${code} Erkläre den Inhalt von text.`)).toEqual([
      { kind: 'code', language: 'java', text: code },
      { kind: 'text', text: 'Erkläre den Inhalt von text.' },
    ])
  })

  it('ignores block-comment punctuation when locating the real question boundary', () => {
    const code = 'int x=1; /* What? } ; { */ int y=2;'
    expect(questionBlocks(`${code} Bestimme x und y.`)).toEqual([
      { kind: 'code', language: 'java', text: code },
      { kind: 'text', text: 'Bestimme x und y.' },
    ])
    expect(formatJavaSnippet(code)).toBe(code)
  })

  it('preserves line comments and newlines in a recognized legacy question', () => {
    const code = 'int x=1; // braces } and a question: What?\nint y=2;'
    expect(questionBlocks(`${code}\nBerechne x+y.`)).toEqual([
      { kind: 'code', language: 'java', text: code },
      { kind: 'text', text: 'Berechne x+y.' },
    ])
    expect(formatJavaSnippet(code)).toBe(code)
  })

  it.each([
    'int x=1; if(x>0){ x++; Welchen Wert hat x?',
    'int x=(1+2]; Welchen Wert hat x?',
    'String text="unfinished; Welchen Wert hat text?',
    "char token='unfinished; Welchen Wert hat token?",
    'int x=1; /* unfinished comment. What is x?',
    'int x=1; int y=',
  ])('keeps ambiguous or incomplete Java verbatim: %s', source => {
    expect(questionBlocks(source)).toEqual([{ kind: 'text', text: source }])
  })

  it.each([
    'Wie funktioniert int[] in Java?',
    'int ist ein Ganzzahltyp. Bestimme seinen Wertebereich.',
    'String text bedeutet eine Zeichenkette; erkläre den Begriff.',
    'Die Formel lautet x = 2; Welchen Wert hat x?',
    'int x=1; This prose has no unambiguous instruction boundary.',
    'Nutze `int x=1;` in deinem Beispiel.',
    '<script>alert("example")</script>',
  ])('keeps ordinary prose passive: %s', source => {
    expect(questionBlocks(source)).toEqual([{ kind: 'text', text: source }])
  })

  it('renders unknown fenced languages as code without interpreting embedded product commands', () => {
    const body = '{"answer":"synthetic","action":"submit"}'
    expect(questionBlocks(`Vor der Aufgabe.\n\n\`\`\`unios-recall\n${body}\n\`\`\`\n\nDanach.`)).toEqual([
      { kind: 'text', text: 'Vor der Aufgabe.' },
      { kind: 'code', language: 'unios-recall', text: body },
      { kind: 'text', text: 'Danach.' },
    ])
  })

  it('normalizes CRLF around fenced code while preserving every code line', () => {
    expect(questionBlocks('Question\r\n\r\n```JAVA\r\nint x=1;\r\n\r\nint y=2;\r\n```\r\nExplain.')).toEqual([
      { kind: 'text', text: 'Question' },
      { kind: 'code', language: 'java', text: 'int x=1;\n\nint y=2;' },
      { kind: 'text', text: 'Explain.' },
    ])
  })

  it('does not close a longer code fence with shorter backticks or a different fence character', () => {
    expect(questionBlocks('````java\nint x=1;\n```\n~~~\n````')).toEqual([
      { kind: 'code', language: 'java', text: 'int x=1;\n```\n~~~' },
    ])
    expect(questionBlocks('~~~\nplain code\n~~~~')).toEqual([
      { kind: 'code', language: undefined, text: 'plain code' },
    ])
  })

  it.each([
    '```java\nint x=1;',
    '~~~java\nint x=1;\n```',
    '    ```java\n    int x=1;\n    ```',
    '$$\nx^2 + 1',
    'Die Kosten sind $$ pro Woche.',
  ])('keeps unclosed or non-block delimiters as prose: %s', source => {
    expect(questionBlocks(source)).toEqual([{ kind: 'text', text: source }])
  })

  it('passes valid and invalid formula source through unchanged for the display renderer', () => {
    const valid = '\\frac{1}{2} + x^2 = 0'
    const invalid = '\\frac{'
    expect(questionBlocks(`Berechne.\n$$\n${valid}\n$$\n$$\n${invalid}\n$$`)).toEqual([
      { kind: 'text', text: 'Berechne.' },
      { kind: 'math', language: undefined, text: valid },
      { kind: 'math', language: undefined, text: invalid },
    ])
  })

  it('does not reclassify formulas inside an explicitly fenced code block', () => {
    expect(questionBlocks('```text\n$$\nx=1\n$$\n```')).toEqual([
      { kind: 'code', language: 'text', text: '$$\nx=1\n$$' },
    ])
  })

  it('leaves very large legacy candidates unchanged instead of guessing a Java boundary', () => {
    const source = `int x=1; ${' '.repeat(20_000)}Welchen Wert hat x?`
    expect(questionBlocks(source)).toEqual([{ kind: 'text', text: source }])
    expect(formatJavaSnippet(source)).toBe(source)
  })
})

describe('passive task structure', () => {
  it('preserves pipes inside formulas, inline code and escaped cells', () => {
    expect(questionBlocks('| Ausdruck | Bedeutung |\n| --- | --- |\n| `$a|b$` | $|x|$ |\n| a\\|b | oder |')).toEqual([
      { kind: 'table', header: ['Ausdruck', 'Bedeutung'], rows: [['`$a|b$`', '$|x|$'], ['a\\|b', 'oder']] },
    ])
  })
  it('does not renumber discontinuous instruction numbers', () => {
    expect(questionBlocks('1. Erste Teilaufgabe\n3. Dritte Teilaufgabe')).toEqual([
      { kind: 'list', ordered: true, start: 1, items: ['Erste Teilaufgabe'] },
      { kind: 'list', ordered: true, start: 3, items: ['Dritte Teilaufgabe'] },
    ])
  })
  it('leaves malformed tables and unfinished code containing apparent Markdown literal', () => {
    const table = '| a | b |\n| --- |\n| 0 | 1 |'
    expect(questionBlocks(table)).toEqual([{ kind: 'text', text: table }])
    const code = '```python\n# comment\n1. not a list\n| a | b |\n| --- | --- |'
    expect(questionBlocks(code)).toEqual([{ kind: 'text', text: code }])
  })
  it('retains nested list markers and indented continuation text', () => {
    expect(questionBlocks('- Oberpunkt\n  - Unterpunkt\n    Fortsetzung\n- Nächster Punkt')).toEqual([
      { kind: 'list', ordered: false, start: 1, items: ['Oberpunkt\n- Unterpunkt\nFortsetzung', 'Nächster Punkt'] },
    ])
  })
})

describe('Java display formatting', () => {
  it('preserves Java Unicode escapes that can introduce quotes before lexical analysis', () => {
    const source = String.raw`String text=\u0022a;b\u0022; int x=1;`
    expect(formatJavaSnippet(source)).toBe(source)
    expect(questionBlocks(source)).toEqual([{ kind: 'text', text: source }])
  })
  it('leaves excessively nested input unchanged rather than expanding indentation', () => {
    const source = `int x=1; ${'{'.repeat(1000)}x++;${'}'.repeat(1000)}`
    expect(formatJavaSnippet(source)).toBe(source)
    expect(questionBlocks(source)).toEqual([{ kind: 'text', text: source }])
  })
  it('gives the screenshot readable statement lines while preserving its for-loop header and array', () => {
    const formatted = formatJavaSnippet(screenshotCode)
    expect(formatted.split('\n').length).toBeGreaterThan(3)
    expect(formatted).toContain('int[] a={1,4,7};')
    expect(formatted).toContain('for(int i=0;i<a.length;i++){')
    expect(formatted.replace(/\s/g, '')).toBe(screenshotCode.replace(/\s/g, ''))
  })

  it('preserves spaces, escapes, punctuation and apparent Java syntax inside string and character literals', () => {
    const literal = '" a  b; { } for(int i=0;i<2;i++) \\"quoted\\" \\\\path "'
    const escapedQuote = String.raw`char quote='\'';`
    const source = `String text=${literal}; char brace='}'; ${escapedQuote} int x=1;`
    const formatted = formatJavaSnippet(source)
    expect(formatted).toContain(literal)
    expect(formatted).toContain("char brace='}';")
    expect(formatted).toContain(escapedQuote)
    expect(formatted.replace(/\s/g, '')).toBe(source.replace(/\s/g, ''))
  })

  it.each([
    'int x=0; for(int i=0;i<10;i++){x+=i;} if(x>0){x--;} else{x++;}',
    'double x=1.5; boolean ok=x>=0 && x!=2; x/=2;',
    'int[][] matrix={{1,2},{3,4}}; matrix[0][1]++;',
    'String name="a + b"; int x=1; x = x + +x;',
  ])('only changes whitespace in balanced snippets: %s', source => {
    const formatted = formatJavaSnippet(source)
    expect(formatted.replace(/\s/g, '')).toBe(source.replace(/\s/g, ''))
  })

  it.each([
    'int x=1; // next statement must stay in the comment; int y=2;',
    'int x=1; /* whitespace and braces { } ; */ int y=2;',
    'int x=1;\nint y=2;',
    'int x=(1+2];',
    'if(true){int x=1;',
    'String text="unfinished;',
    "char value='unfinished;",
    'int x=1; /* unfinished',
  ])('does not rewrite comments, existing line layout or malformed snippets: %s', source => {
    expect(formatJavaSnippet(source)).toBe(source)
  })
})

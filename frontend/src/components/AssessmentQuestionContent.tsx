// SPDX-License-Identifier: AGPL-3.0-or-later

import { useMemo, type ReactNode } from 'react'
import { common, createLowlight } from 'lowlight'
import { formatJavaSnippet, questionBlocks } from '@/lib/assessmentQuestion'
import { renderFormula } from './editor/math'
import '@fontsource/fira-code/400.css'
import './AssessmentQuestion.css'

const lowlight = createLowlight(common)
type Highlight = {
  type: string
  value?: string
  tagName?: string
  properties?: { className?: unknown }
  children?: Highlight[]
}

function highlighted(nodes: Highlight[]): ReactNode {
  return nodes.map((node, index) =>
    node.type === 'text' ? (
      node.value
    ) : (
      <span
        key={index}
        className={Array.isArray(node.properties?.className) ? node.properties.className.join(' ') : undefined}
      >
        {highlighted(node.children ?? [])}
      </span>
    ),
  )
}

function Formula({ text, display = false }: { text: string; display?: boolean }) {
  const html = renderFormula(text, display)
  // Only constrained KaTeX output can become HTML; task content never can.
  return html ? <span className="assessment-math" dangerouslySetInnerHTML={{ __html: html }} /> : <code>{text}</code>
}

function inline(text: string): ReactNode[] {
  const result: ReactNode[] = []
  // Escaped delimiters remain ordinary text. No HTML, image or study widgets.
  const pattern =
    /\\\((.+?)\\\)|\$\$((?:\\.|[^$\n])+?)\$\$|\\.|(`+)([^\n]*?)\3|\$(?![\s$])((?:\\.|[^$\n])+?)\$(?![\d$])|\*\*([^*\n]+)\*\*/g
  let end = 0,
    match: RegExpExecArray | null
  while ((match = pattern.exec(text))) {
    result.push(text.slice(end, match.index))
    result.push(
      match[1] ? (
        <Formula key={match.index} text={match[1]} />
      ) : match[2] ? (
        <Formula key={match.index} text={match[2]} display />
      ) : match[3] ? (
        <code key={match.index}>{match[4]}</code>
      ) : match[5] ? (
        <Formula key={match.index} text={match[5]} />
      ) : match[6] ? (
        <strong key={match.index}>{match[6]}</strong>
      ) : (
        match[0]
      ),
    )
    end = pattern.lastIndex
  }
  result.push(text.slice(end))
  return result
}

/** Phrasing content for radio labels and matching prompts; values stay original. */
export function AssessmentInline({ text }: { text: string }) {
  return <span className="assessment-inline">{inline(text)}</span>
}

function Code({ text, language }: { text: string; language?: string }) {
  const source = language === 'java' ? formatJavaSnippet(text) : text
  const content = useMemo(() => {
    // Unknown fence labels are displayed literally without autodetection.
    if (!language || !lowlight.registered(language) || source.length > 20_000) return source
    try {
      return highlighted(lowlight.highlight(language, source).children)
    } catch {
      return source
    }
  }, [language, source])
  return (
    <div className="assessment-code-block" data-language={language}>
      {language && <div className="assessment-code-language">{language}</div>}
      <pre tabIndex={0}>
        <code>{content}</code>
      </pre>
    </div>
  )
}

/** Explicit code remains code even when it contains Markdown fence delimiters. */
export function AssessmentCode({ text, language }: { text: string; language?: string }) {
  return (
    <div className="assessment-question-document">
      <Code text={text} language={language} />
    </div>
  )
}

export function AssessmentQuestion({ text }: { text: string }) {
  const blocks = useMemo(() => questionBlocks(text), [text])
  return (
    <div className="assessment-question-document">
      {blocks
        .map((block, index) => {
          if (block.kind === 'code') return <Code key={index} text={block.text} language={block.language} />
          if (block.kind === 'math')
            return (
              <div key={index} className="assessment-display-math">
                <Formula text={block.text} display />
              </div>
            )
          if (block.kind === 'heading') {
            const Heading = block.level === 1 ? 'h4' : block.level === 2 ? 'h5' : 'h6'
            return (
              <Heading key={index} className="assessment-document-heading">
                {inline(block.text)}
              </Heading>
            )
          }
          if (block.kind === 'list') {
            const children = block.items.map((item, itemIndex) => <li key={itemIndex}>{inline(item)}</li>)
            return block.ordered ? (
              <ol key={index} className="assessment-document-list" start={block.start}>
                {children}
              </ol>
            ) : (
              <ul key={index} className="assessment-document-list">
                {children}
              </ul>
            )
          }
          if (block.kind === 'table')
            return (
              <div key={index} className="assessment-table-block" tabIndex={0}>
                <table>
                  <thead>
                    <tr>
                      {block.header.map((cell, cellIndex) => (
                        <th key={cellIndex} scope="col">
                          {inline(cell)}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {block.rows.map((row, rowIndex) => (
                      <tr key={rowIndex}>
                        {row.map((cell, cellIndex) => (
                          <td key={cellIndex}>{inline(cell)}</td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )
          return (
            <p key={index} className="assessment-question-text">
              {inline(block.text)}
            </p>
          )
        })
        .flatMap((block, index) => [index > 0 ? '\n' : null, block])}
    </div>
  )
}

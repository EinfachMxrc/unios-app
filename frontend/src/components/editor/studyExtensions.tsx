// SPDX-License-Identifier: AGPL-3.0-or-later

import { Node } from '@tiptap/core'
import { NodeViewWrapper, ReactNodeViewRenderer, type NodeViewProps } from '@tiptap/react'
import { lazy, Suspense, useState } from 'react'
import { useT } from '@/i18n/useT'
import { StudyDiagram } from './StudyDiagram'
import { parseRecall, readStudyFence, studyFence } from './studyModels'
import { renderFormula } from './math'
import { WritingGrid } from './WritingGrid'
import { parseWritingGrid } from './writingGridModel'
const StudyHelperDialog = lazy(() => import('./StudyHelperDialog'))

function StudyText({ text }: { text: string }) {
  return (
    <div className="study-text">
      {text.split(/(\$\$[\s\S]*?\$\$|\$[^$\n]+\$)/).map((part, i) => {
        const block = part.startsWith('$$'),
          math = part.startsWith('$') && part.endsWith('$')
        const html = math ? renderFormula(part.slice(block ? 2 : 1, block ? -2 : -1), block) : null
        return html ? (
          <span key={i} className="studio-math-render" dangerouslySetInnerHTML={{ __html: html }} />
        ) : (
          <span key={i}>{part}</span>
        )
      })}
    </div>
  )
}
function RecallView({ source }: { source: string }) {
  const { t } = useT('notes')
  const [answer, setAnswer] = useState(false),
    [hint, setHint] = useState(false)
  let recall
  try {
    recall = parseRecall(source)
  } catch {
    return <pre>{source}</pre>
  }
  return (
    <div className="study-recall">
      <strong>{t('study.question')}</strong>
      <StudyText text={recall.question} />
      {recall.hint && (
        <>
          <button type="button" aria-expanded={hint} onClick={() => setHint(!hint)}>
            {t('study.hint')}
          </button>
          {hint && <StudyText text={recall.hint} />}
        </>
      )}
      <button type="button" aria-expanded={answer} onClick={() => setAnswer(!answer)}>
        {t(answer ? 'study.hideAnswer' : 'study.showAnswer')}
      </button>
      {answer && (
        <div className="study-answer">
          <StudyText text={recall.answer} />
        </div>
      )}
    </div>
  )
}
function StudyView({ node, editor, updateAttributes }: NodeViewProps) {
  const { t } = useT('notes')
  const [editing, setEditing] = useState(false)
  const source = String(node.attrs.source),
    kind = node.attrs.kind === 'grid' ? 'grid' : node.attrs.kind === 'diagram' ? 'diagram' : 'recall'
  if (kind === 'grid') {
    let rows
    try {
      rows = parseWritingGrid(source)
    } catch {
      return (
        <NodeViewWrapper contentEditable={false}>
          <pre>{source}</pre>
        </NodeViewWrapper>
      )
    }
    return (
      <NodeViewWrapper contentEditable={false} className="studio-study-block">
        <WritingGrid
          rows={rows}
          onChange={editor.isEditable ? (rows) => updateAttributes({ source: JSON.stringify(rows) }) : undefined}
        />
      </NodeViewWrapper>
    )
  }
  return (
    <NodeViewWrapper contentEditable={false} className="studio-study-block">
      {kind === 'diagram' ? <StudyDiagram source={source} /> : <RecallView key={source} source={source} />}
      {editor.isEditable && (
        <button type="button" onClick={() => setEditing(true)}>
          {t('study.edit')}
        </button>
      )}
      {editing && (
        <Suspense fallback={<p role="status">{t('math.loading')}</p>}>
          <StudyHelperDialog
            initialTool={kind}
            initialSource={source}
            onClose={() => {
              setEditing(false)
              editor.commands.focus()
            }}
            onApply={(markdown) => {
              const value = readStudyFence(markdown)
              if (value) {
                updateAttributes(value)
                setEditing(false)
                editor.commands.focus()
              }
            }}
          />
        </Suspense>
      )}
    </NodeViewWrapper>
  )
}
export const StudyBlock = Node.create({
  // Paragraphs must remain the schema's default block (including after undo).
  name: 'studyBlock',
  group: 'block',
  atom: true,
  draggable: true,
  priority: 95,
  addAttributes: () => ({ kind: { default: 'diagram' }, source: { default: '' } }),
  parseHTML: () => [
    {
      tag: 'div[data-study-block]',
      getAttrs: (element) => ({ kind: element.getAttribute('data-kind'), source: element.getAttribute('data-source') }),
    },
  ],
  renderHTML: ({ node }) => [
    'div',
    { 'data-study-block': '', 'data-kind': node.attrs.kind, 'data-source': node.attrs.source },
    String(node.attrs.source),
  ],
  renderText: ({ node }) => studyFence(node.attrs.kind, String(node.attrs.source)).trim(),
  addNodeView: () => ReactNodeViewRenderer(StudyView),
  markdownTokenizer: {
    name: 'studyBlock',
    level: 'block',
    start: (source) => source.indexOf('```unios-'),
    tokenize(source) {
      const match = /^```unios-(diagram|recall|grid)\n[^\n]+\n```[ \t]*(?:\n|$)/.exec(source)
      const value = match && readStudyFence(match[0])
      return value ? { type: 'studyBlock', raw: match![0], ...value } : undefined
    },
  },
  parseMarkdown: (token, helpers) => helpers.createNode('studyBlock', { kind: token.kind, source: token.source }),
  renderMarkdown: (node) =>
    studyFence(
      node.attrs?.kind === 'grid' ? 'grid' : node.attrs?.kind === 'diagram' ? 'diagram' : 'recall',
      String(node.attrs?.source ?? ''),
    ).trim(),
})

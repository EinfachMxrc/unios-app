// SPDX-License-Identifier: AGPL-3.0-or-later

import { InputRule, Node } from '@tiptap/core'
import { TextSelection } from '@tiptap/pm/state'
import { binaryColumnSource, numberMathInput } from './numberNotation'
import { Fragment } from '@tiptap/pm/model'
import { NodeViewWrapper, ReactNodeViewRenderer, type NodeViewProps } from '@tiptap/react'
import { lazy, Suspense, useState } from 'react'
import { useT } from '@/i18n/useT'
import { MAX_FORMULA_LENGTH, renderFormula } from './math'
import {
  blockMathSource,
  blockMathStart,
  inlineMathInput,
  inlineMathSource,
  inlineMathStart,
  isMathDelimiterEscaped,
} from './mathSyntax'
import './StudyInsert.css'

const MathEntryDialog = lazy(() => import('./MathEntryDialog'))

function FormulaView({ node, editor, updateAttributes }: NodeViewProps) {
  const { t } = useT('notes')
  const [editing, setEditing] = useState(false)
  const displayMode = node.type.name === 'blockMath'
  const latex = String(node.attrs.latex)
  const html = renderFormula(latex, displayMode)
  const preview = html ? (
    // KaTeX is a constrained renderer with trust:false and expansion/size limits.
    <span className="studio-math-render" dangerouslySetInnerHTML={{ __html: html }} />
  ) : (
    <code className="studio-math-error" title={t('math.invalid')}>
      {latex}
    </code>
  )
  return (
    <NodeViewWrapper
      as={displayMode ? 'div' : 'span'}
      contentEditable={false}
      className={`studio-math ${displayMode ? 'studio-math-block' : 'studio-math-inline'}`}
    >
      {editor.isEditable ? (
        <button
          type="button"
          className="studio-math-button"
          aria-label={t('math.edit')}
          onClick={() => setEditing(true)}
        >
          {preview}
        </button>
      ) : (
        preview
      )}
      {editing && (
        <Suspense fallback={<span role="status">{t('math.loading')}</span>}>
          <MathEntryDialog
            initial={latex}
            displayMode={displayMode}
            onClose={() => {
              setEditing(false)
              editor.commands.focus()
            }}
            onApply={(next) => {
              updateAttributes({ latex: next })
              setEditing(false)
              editor.commands.focus()
            }}
          />
        </Suspense>
      )}
    </NodeViewWrapper>
  )
}

export const InlineMath = Node.create({
  name: 'inlineMath',
  group: 'inline',
  inline: true,
  atom: true,
  addAttributes: () => ({ latex: { default: '' } }),
  parseHTML: () => [
    { tag: 'span[data-inline-math]', getAttrs: (element) => ({ latex: element.getAttribute('data-latex') }) },
  ],
  renderHTML: ({ node }) => [
    'span',
    { 'data-inline-math': '', 'data-latex': node.attrs.latex },
    String(node.attrs.latex),
  ],
  renderText: ({ node }) => `$${node.attrs.latex}$`,
  addNodeView: () => ReactNodeViewRenderer(FormulaView),
  markdownTokenizer: {
    name: 'inlineMath',
    level: 'inline',
    start: inlineMathStart,
    tokenize(source) {
      const formula = inlineMathSource(source)
      return formula ? { type: 'inlineMath', ...formula } : undefined
    },
  },
  parseMarkdown: (token, helpers) => helpers.createNode('inlineMath', { latex: token.latex }),
  renderMarkdown: (node) => `$${String(node.attrs?.latex ?? '')}$`,
  addKeyboardShortcuts() {
    return {
      Enter: () => {
        const { state } = this.editor
        const at = state.selection.$from
        if (!state.selection.empty || at.parent.type.name !== 'paragraph' || at.parentOffset !== at.parent.content.size)
          return false
        const before = at.parent.textBetween(0, at.parentOffset, '', '\ufffc')
        const match = numberMathInput(before + ' ')
        if (match) {
          const from = at.start() + match.index
          const tr = state.tr.replaceWith(from, state.selection.from, this.type.create({ latex: match.data.latex }))
          this.editor.view.dispatch(tr.setSelection(TextSelection.create(tr.doc, from + 1)))
        }
        return false
      },
    }
  },
  addInputRules() {
    return [
      new InputRule({
        find: numberMathInput,
        handler: ({ state, range, match }) => {
          state.tr.replaceWith(
            range.from,
            range.to,
            Fragment.fromArray([
              this.type.create({ latex: match.data?.latex }),
              state.schema.text(match.data?.suffix ?? ' '),
            ]),
          )
        },
      }),
      new InputRule({
        find: (source) => inlineMathInput(source, MAX_FORMULA_LENGTH),
        handler: ({ state, range, match }) => {
          state.tr.replaceWith(range.from, range.to, this.type.create({ latex: match.data?.latex }))
        },
      }),
    ]
  },
})

export const BlockMath = Node.create({
  priority: 110,
  name: 'blockMath',
  group: 'block',
  atom: true,
  draggable: true,
  addAttributes: () => ({ latex: { default: '' } }),
  parseHTML: () => [
    { tag: 'div[data-block-math]', getAttrs: (element) => ({ latex: element.getAttribute('data-latex') }) },
  ],
  renderHTML: ({ node }) => [
    'div',
    { 'data-block-math': '', 'data-latex': node.attrs.latex },
    String(node.attrs.latex),
  ],
  renderText: ({ node }) => `$$\n${node.attrs.latex}\n$$`,
  addNodeView: () => ReactNodeViewRenderer(FormulaView),
  markdownTokenizer: {
    name: 'blockMath',
    level: 'block',
    start: blockMathStart,
    tokenize(source) {
      const formula = blockMathSource(source)
      return formula ? { type: 'blockMath', ...formula } : undefined
    },
  },
  parseMarkdown: (token, helpers) => helpers.createNode('blockMath', { latex: token.latex }),
  renderMarkdown: (node) => `$$\n${String(node.attrs?.latex ?? '')}\n$$`,
  addKeyboardShortcuts() {
    return {
      Enter: () => {
        const { state } = this.editor
        const at = state.selection.$from
        if (
          !state.selection.empty ||
          at.parent.type.name !== 'paragraph' ||
          at.parentOffset !== at.parent.content.size ||
          at.depth !== 1 ||
          at.index(0) < 2
        )
          return false
        const index = at.index(0)
        const paragraphs = [state.doc.child(index - 2), state.doc.child(index - 1), at.parent]
        if (
          paragraphs.some(
            (paragraph) =>
              paragraph.type.name !== 'paragraph' ||
              paragraph.content.content.some((node) => !node.isText && node.type.name !== 'inlineMath'),
          )
        )
          return false
        const source = paragraphs
          .map((paragraph) =>
            paragraph.content.content.map((node) => (node.isText ? node.text : `$${node.attrs.latex}$`)).join(''),
          )
          .join('\n')
        const formula = binaryColumnSource(source)
        if (!formula) return false
        const from = at.before() - paragraphs[0].nodeSize - paragraphs[1].nodeSize
        this.editor.commands.insertContentAt({ from, to: at.after() }, [
          { type: this.name, attrs: { latex: formula.latex } },
          { type: 'paragraph' },
        ])
        return true
      },
    }
  },
  addInputRules() {
    return [
      new InputRule({
        find: (source) => {
          const formula = blockMathSource(source)
          if (formula && formula.raw.length === source.length) return { index: 0, text: source }
          return source === '$$' || source === '\\]' ? { index: 0, text: source } : null
        },
        handler: ({ state, range }) => {
          const current = state.doc.resolve(range.from)
          if (current.parent.type.name !== 'paragraph') return null
          const paragraph = current.parent
          if (paragraph.content.content.some((node) => !node.isText && node.type.name !== 'hardBreak')) return null
          const source = paragraph.textContent
          const inlineBlock = blockMathSource(source)
          let from = current.before(),
            latex = inlineBlock?.latex
          const container = current.node(current.depth - 1)
          const currentIndex = current.index(current.depth - 1)
          let fromIndex = currentIndex
          if (!inlineBlock || inlineBlock.raw.length !== source.length) {
            if (source !== '$$' && source !== '\\]') return null
            const opening = source === '$$' ? '$$' : '\\['
            const lines: string[] = []
            let length = 0
            for (let index = currentIndex - 1; index >= 0; index--) {
              const previous = container.child(index)
              if (
                previous.type.name !== 'paragraph' ||
                previous.content.content.some((node) => !node.isText && node.type.name !== 'hardBreak')
              )
                return null
              from -= previous.nodeSize
              fromIndex = index
              if (previous.textContent.trim() === opening) {
                latex = lines.reverse().join('\n')
                break
              }
              const line = previous.textBetween(0, previous.content.size, '\n', '\n')
              length += line.length + (lines.length ? 1 : 0)
              lines.push(line)
              if (length > MAX_FORMULA_LENGTH || previous.textContent.trim() === source) return null
            }
          }
          if (!latex?.trim()) return null
          const replacement = Fragment.fromArray([this.type.create({ latex }), state.schema.nodes.paragraph.create()])
          if (!container.canReplace(fromIndex, currentIndex + 1, replacement)) return null
          // The closing delimiter converts the whole block in one undoable step.
          state.tr.replaceWith(from, current.after(), replacement)
        },
      }),
    ]
  },
})

// Marked removes dollar escapes when importing text, while its Markdown serializer
// does not escape literal dollars. A one-character passive node preserves the
// explicit escape without changing ordinary text, prices, code or formula nodes.
export const LiteralDollar = Node.create({
  name: 'literalDollar',
  group: 'inline',
  inline: true,
  atom: true,
  selectable: false,
  parseHTML: () => [{ tag: 'span[data-literal-dollar]' }],
  renderHTML: () => ['span', { 'data-literal-dollar': '' }, '$'],
  renderText: () => '$',
  markdownTokenizer: {
    name: 'literalDollar',
    level: 'inline',
    start: (source) => source.indexOf('\\$'),
    tokenize: (source) => (source.startsWith('\\$') ? { type: 'literalDollar', raw: '\\$' } : undefined),
  },
  parseMarkdown: (_token, helpers) => helpers.createNode('literalDollar'),
  renderMarkdown: () => '\\$',
  addKeyboardShortcuts() {
    return {
      Backspace: () => {
        const { empty, $from } = this.editor.state.selection
        const previous = $from.nodeBefore
        return empty && previous?.type.name === this.name
          ? this.editor.commands.deleteRange({ from: $from.pos - previous.nodeSize, to: $from.pos })
          : false
      },
      Delete: () => {
        const { empty, $from } = this.editor.state.selection
        const next = $from.nodeAfter
        return empty && next?.type.name === this.name
          ? this.editor.commands.deleteRange({ from: $from.pos, to: $from.pos + next.nodeSize })
          : false
      },
    }
  },
  addInputRules() {
    return [
      new InputRule({
        find: (source) => {
          const index = source.length - 2
          return source.endsWith('\\$') && !isMathDelimiterEscaped(source, index) ? { index, text: '\\$' } : null
        },
        handler: ({ state, range }) => {
          state.tr.replaceWith(range.from, range.to, this.type.create())
        },
      }),
    ]
  },
})

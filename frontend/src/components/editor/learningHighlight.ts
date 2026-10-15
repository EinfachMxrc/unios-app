// SPDX-License-Identifier: AGPL-3.0-or-later
import { Mark, markInputRule, mergeAttributes, type Editor } from '@tiptap/core'

export const highlightColors = ['yellow', 'green', 'blue', 'pink'] as const
export type HighlightColor = (typeof highlightColors)[number]
export function highlightColor(value: unknown): HighlightColor {
  return highlightColors.includes(value as HighlightColor) ? (value as HighlightColor) : 'yellow'
}
export function changeHighlight(editor: Editor, color?: HighlightColor) {
  const chain = editor.chain().focus()
  if (editor.state.selection.empty) chain.extendMarkRange('learningHighlight')
  return color ? chain.setMark('learningHighlight', { color }).run() : chain.unsetMark('learningHighlight').run()
}

/** A constrained inline mark; its Markdown retains colour without arbitrary HTML. */
export const LearningHighlight = Mark.create({
  name: 'learningHighlight',
  inclusive: false,
  addAttributes: () => ({ color: { default: 'yellow' } }),
  parseHTML: () => [
    { tag: 'mark', getAttrs: (element) => ({ color: highlightColor(element.getAttribute('data-color')) }) },
  ],
  renderHTML: ({ HTMLAttributes }) => [
    'mark',
    mergeAttributes(
      { class: 'studio-highlight' },
      {
        'data-color': highlightColor(HTMLAttributes.color),
      },
    ),
    0,
  ],
  markdownTokenizer: {
    name: 'learningHighlight',
    level: 'inline',
    start: (source) => source.indexOf('=='),
    tokenize(source, _tokens, helpers) {
      const literal = /^={3,}[^\n]*?={3,}/.exec(source)
      if (literal) return { type: 'learningHighlight', raw: literal[0], literal: true }
      const match = /^==(?:\{(yellow|green|blue|pink)\})?((?![\s={])(?:(?!==)[^\n])+?)==(?![=])/.exec(source)
      if (!match) return undefined
      if (/\s$/.test(match[2])) return undefined
      return {
        type: 'learningHighlight',
        raw: match[0],
        color: match[1] ?? 'yellow',
        tokens: helpers.inlineTokens(match[2]),
      }
    },
  },
  parseMarkdown: (token, helpers) =>
    token.literal
      ? helpers.createTextNode(token.raw ?? '')
      : helpers.applyMark('learningHighlight', helpers.parseInline(token.tokens ?? []), {
          color: highlightColor(token.color),
        }),
  renderMarkdown: (node, helpers) => {
    const color = highlightColor(node.attrs?.color)
    return `==${color === 'yellow' ? '' : `{${color}}`}${helpers.renderChildren(node)}==`
  },
  addKeyboardShortcuts() {
    return { 'Mod-Shift-h': () => this.editor.commands.toggleMark(this.name, { color: 'yellow' }) }
  },
  addInputRules() {
    return [
      markInputRule({
        find: /(?:^|\s)==(?:\{(yellow|green|blue|pink)\})?((?![\s={])[^=\n]*\S)==$/,
        type: this.type,
        getAttributes: (match) => ({ color: match[1] ?? 'yellow' }),
      }),
    ]
  },
})

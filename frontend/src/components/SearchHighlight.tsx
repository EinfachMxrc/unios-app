// SPDX-License-Identifier: AGPL-3.0-or-later
/** Plain text highlighting: never interpret source snippets as HTML. */
/** The search index marks matches with 【】; the UI marks them itself, so the brackets never show. */
export function stripSnippetMarks(text: string) {
  return text.replace(/[【】]/g, '')
}

export function SearchHighlight({ text, query }: { text: string; query: string }) {
  text = stripSnippetMarks(text)
  const terms = query.trim().split(/\s+/).filter(term => term.length > 1 && !term.includes(':')).slice(0, 12)
  if (!terms.length) return <>{text}</>
  const escaped = terms.map(term => term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
  const pattern = new RegExp(`(${escaped.join('|')})`, 'giu')
  return <>{text.split(pattern).map((part, index) => index % 2 ? <mark className="search-highlight" key={index}>{part}</mark> : part)}</>
}

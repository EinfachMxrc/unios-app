// SPDX-License-Identifier: AGPL-3.0-or-later

import { useMemo, useState, type ReactNode } from 'react'
import { Check, Copy, WrapText } from 'lucide-react'
import { common, createLowlight } from 'lowlight'
import { useT } from '@/i18n/useT'

const lowlight = createLowlight(common)
type Highlight = { type: string; value?: string; properties?: { className?: unknown }; children?: Highlight[] }

/** Above this, highlighting would make the page sluggish; the text still shows. */
const HIGHLIGHT_LIMIT = 200_000

/** File endings to the highlighter's language names; anything else shows as plain text. */
const LANGUAGES: Record<string, string> = {
  py: 'python', ipynb: 'json', java: 'java', kt: 'kotlin', c: 'c', h: 'c', cpp: 'cpp', cc: 'cpp', hpp: 'cpp',
  cs: 'csharp', go: 'go', rs: 'rust', swift: 'swift', js: 'javascript', mjs: 'javascript', jsx: 'javascript',
  ts: 'typescript', tsx: 'typescript', php: 'php', rb: 'ruby', pl: 'perl', lua: 'lua', r: 'r', sql: 'sql',
  sh: 'bash', bash: 'bash', zsh: 'bash', json: 'json', jsonl: 'json', yaml: 'yaml', yml: 'yaml', toml: 'ini',
  ini: 'ini', cfg: 'ini', conf: 'ini', properties: 'ini', xml: 'xml', css: 'css', scss: 'scss', makefile: 'makefile',
  mk: 'makefile', m: 'objectivec',
}

export function languageFor(filename: string): string {
  const name = filename.toLowerCase()
  const suffix = name === 'makefile' ? 'makefile' : name.slice(name.lastIndexOf('.') + 1)
  const language = LANGUAGES[suffix]
  return language && lowlight.registered(language) ? language : 'plaintext'
}

function highlighted(nodes: Highlight[]): ReactNode {
  return nodes.map((node, index) => node.type === 'text' ? node.value : <span key={index}
    className={Array.isArray(node.properties?.className) ? node.properties.className.join(' ') : undefined}>
    {highlighted(node.children ?? [])}</span>)
}

/** Source code or plain text with line numbers, highlighting, wrapping and a copy button. */
export function CodeView({ text, filename }: { text: string; filename: string }) {
  const { t } = useT('material')
  const [wrap, setWrap] = useState(false)
  const [copied, setCopied] = useState(false)
  const language = languageFor(filename)
  const lines = text.replace(/\n$/, '').split('\n')
  const content = useMemo(() => {
    if (language === 'plaintext' || text.length > HIGHLIGHT_LIMIT) return text
    try { return highlighted(lowlight.highlight(language, text).children as Highlight[]) } catch { return text }
  }, [language, text])
  async function copy() {
    try {
      await navigator.clipboard.writeText(text)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1500)
    } catch { /* the clipboard may be blocked; selecting the text still works */ }
  }
  return (
    <figure className="code-view">
      <figcaption className="viewer-bar">
        <span>{language === 'plaintext' ? filename : `${filename} · ${language}`}</span>
        <span className="muted-text">{t('viewerLines', { count: lines.length })}</span>
        <button type="button" aria-pressed={wrap} onClick={() => setWrap(!wrap)}><WrapText size={14} /> {t('viewerWrap')}</button>
        <button type="button" onClick={() => void copy()}>
          {copied ? <Check size={14} /> : <Copy size={14} />} {copied ? t('viewerCopied') : t('viewerCopy')}
        </button>
      </figcaption>
      <div className={`code-view-body ${wrap ? 'is-wrapped' : ''}`} tabIndex={0}>
        {!wrap && <pre className="code-view-lines" aria-hidden="true">{lines.map((_, index) => `${index + 1}\n`)}</pre>}
        <pre className="code-view-text"><code>{content}</code></pre>
      </div>
    </figure>
  )
}

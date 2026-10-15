// SPDX-License-Identifier: AGPL-3.0-or-later

import { useEffect, useId, useRef, useState } from 'react'
import { Star } from 'lucide-react'
import { useT } from '@/i18n/useT'
import { Dialog, DialogContent, DialogDescription, DialogTitle } from './StudioDialog'
import { binaryWord, formatNumber, parseNumber, placeValues } from './numberSystems'
import { binomialProbability, describeNumbers, markdownCell, markdownTable, parseDiagram, parseRecall, studyFence } from './studyModels'
import { StudyDiagram } from './StudyDiagram'
import { StudyInsertTools } from './StudyInsertTools'
import { useStudyQuickAccess } from './studyQuickAccess'
import { useStudyDialogEscape } from './useStudyDialogEscape'
import './StudyInsert.css'

export const studyTools = ['number', 'diagram', 'recall', 'statistics', 'source', 'project', 'code'] as const
export type StudyTool = typeof studyTools[number]
type Form = { number: string; base: string; width: string; diagram: string; question: string; answer: string; hint: string;
  values: string; n: string; k: string; p: string; author: string; year: string; title: string; url: string; page: string; date: string; code: string; language: string }
const diagramPresets = ['flow', 'tree', 'state', 'uml', 'er', 'network', 'probability'] as const

function RecallField({ id, label, value, onChange }: { id: string; label: string; value: string; onChange: (value: string) => void }) {
  const field = useRef<HTMLTextAreaElement>(null)
  return <div><label className="study-field" htmlFor={id}>{label}<textarea id={id} ref={field} value={value} maxLength={2000} rows={3}
    onChange={event => onChange(event.target.value)} /></label>
    <StudyInsertTools field={field} value={value} maxLength={2000} onChange={onChange} mathOnly /></div>
}

export default function StudyHelperDialog({ initialTool = 'number', initialBase = 2, initialSource, onApply, onClose }: {
  initialTool?: StudyTool; initialBase?: number; initialSource?: string; onApply: (markdown: string) => void; onClose: () => void
}) {
  const { t } = useT('notes')
  const { t: tq } = useT('mathQuick')
  const content = useStudyDialogEscape(onClose)
  const quick = useStudyQuickAccess()
  const id = useId()
  const [tool, setTool] = useState<StudyTool>(initialTool)
  const [form, setForm] = useState<Form>(() => {
    let recall = { question: '', answer: '', hint: '' }
    try { if (initialTool === 'recall' && initialSource) recall = parseRecall(initialSource) } catch { /* Raw content remains editable below. */ }
    return { number: '', base: String(initialBase), width: '', diagram: initialTool === 'diagram' && initialSource ? initialSource : t('study.diagramFlow'),
      ...recall, values: '', n: '10', k: '3', p: '0.5', author: '', year: '', title: '', url: '', page: '',
      date: new Date().toLocaleDateString('en-CA'), code: '', language: 'java' }
  })
  const [distribution, setDistribution] = useState(false)
  const [placeTable, setPlaceTable] = useState(false)
  const [blank, setBlank] = useState(false)
  useEffect(() => {
    const key = { number: 'number', diagram: 'diagram', recall: 'question', statistics: distribution ? 'n' : 'values', source: 'title', project: 'title', code: 'code' }[tool]
    const frame = requestAnimationFrame(() => document.getElementById(`${id}-${key}`)?.focus())
    return () => cancelAnimationFrame(frame)
  }, [tool, id, distribution])
  function change(key: keyof Form, value: string) { setForm(current => ({ ...current, [key]: value })) }
  function field(key: keyof Form, label: string, multiline = false, limit = 2000) {
    const attributes = { id: `${id}-${key}`, value: form[key], maxLength: limit,
      onChange: (event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => change(key, event.target.value) }
    return <label className="study-field" key={key} htmlFor={attributes.id}>{label}
      {multiline ? <textarea {...attributes} rows={4} /> : <input {...attributes} />}</label>
  }
  let markdown = '', error = '', output: { headers: string[]; rows: (string | number)[][] } | null = null
  try {
    if (tool === 'number') {
      const value = parseNumber(form.number, Number(form.base))
      const rows = [2, 8, 10, 16].map(base => [String(base), formatNumber(value, base).text])
      if (form.width) {
        const word = binaryWord(value, Number(form.width))
        rows.push([t('study.bits'), word.bits], [t('study.unsigned'), word.unsigned], [t('study.signed'), word.signed])
      }
      output = { headers: [t('study.base'), t('study.value')], rows }
      markdown = markdownTable(output.headers, blank ? rows.map(row => [row[0], '']) : rows)
      if (placeTable) markdown += markdownTable([t('study.digit'), t('study.power'), t('study.contribution')],
        placeValues(form.number, Number(form.base)).map(v => [v.digit, `${form.base}^${v.exponent}`, blank ? '' : v.value]))
      if (placeTable && value.numerator < 0n) markdown += t('study.negativePlaces') + '\n\n'
    } else if (tool === 'diagram') {
      parseDiagram(form.diagram)
      markdown = studyFence('diagram', form.diagram)
    } else if (tool === 'recall') {
      const source = JSON.stringify({ question: form.question, answer: form.answer, hint: form.hint })
      parseRecall(source); markdown = studyFence('recall', source)
    } else if (tool === 'statistics') {
      const rows: (string | number)[][] = []
      if (distribution) {
        if (![form.n, form.k, form.p].every(value => value.trim() && /^\d+(?:[.,]\d+)?$/.test(value.trim()))) throw new Error('distribution')
        const value = binomialProbability(Number(form.n), Number(form.k), Number(form.p.replace(',', '.')))
        rows.push(['n', form.n], ['k', form.k], ['p', form.p], ['P(X = k)', value.toPrecision(10)])
        markdown = `\n\n$$\nP(X=k)=\\binom{n}{k}p^k(1-p)^{n-k}\n$$\n\n${t('study.binomialAssumptions')}\n\n`
      } else {
        const result = describeNumbers(form.values)
        for (const key of ['count', 'mean', 'median', 'min', 'max', 'population', 'sample'] as const) {
          rows.push([t(`study.${key}`), result[key] === null ? '—' : Number(result[key]).toPrecision(10)])
        }
        markdown = markdownTable([t('study.observation'), t('study.value')], result.values.map((x, i) => [i + 1, x]))
      }
      output = { headers: [t('study.measure'), t('study.value')], rows }
      markdown += markdownTable(output.headers, rows)
    } else if (tool === 'source') {
      if (!form.title.trim() || (form.url && !/^(https?:\/\/[^\s<>]+|\/material\/[1-9]\d*(?:\?page=[1-9]\d*)?)$/.test(form.url))) throw new Error('source')
      markdown = markdownTable([t('study.sourceField'), t('study.value')], [
        [t('study.titleField'), form.title], [t('study.author'), form.author], [t('study.year'), form.year],
        [t('study.page'), form.page], [t('study.url'), form.url],
      ])
      if (form.url) markdown += `[${markdownCell(form.title)}](<${form.url}>)\n\n`
    } else if (tool === 'project') {
      if (!form.title.trim()) throw new Error('project')
      markdown = `\n\n## ${markdownCell(form.title)}\n\n${markdownCell(form.date)}\n\n` +
        (['problem', 'approach', 'result', 'evidence', 'nextStep'] as const).map(key => `### ${t(`study.${key}`)}\n\n`).join('')
    } else {
      if (!form.code.trim() || /`{3}/.test(form.code)) throw new Error('code')
      markdown = `\n\n\`\`\`${form.language}\n${form.code}\n\`\`\`\n\n` + markdownTable(
        [t('study.step'), t('study.variable'), t('study.value'), t('study.explanation')], [['', '', '', ''], ['', '', '', ''], ['', '', '', '']])
    }
  } catch { error = t(`study.error_${tool}`) }
  function apply() { if (markdown && !error) { quick.useTool(tool); onApply(markdown) } }
  const favoriteTools = quick.preferences.tools.favorites as StudyTool[]
  const recentTools = quick.preferences.tools.recent.filter(key => !favoriteTools.includes(key as StudyTool)).slice(0, 3) as StudyTool[]
  return <Dialog open onOpenChange={open => { if (!open) onClose() }}>
    <DialogContent ref={content} className="studio-dialog study-insert-dialog" onEscapeKeyDown={event => {
      event.preventDefault(); event.stopPropagation(); onClose()
    }} onKeyDown={event => {
      if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) { event.preventDefault(); event.stopPropagation(); apply() }
    }}>
      <DialogTitle>{t('study.title')}</DialogTitle><DialogDescription>{t('study.description')}</DialogDescription>
      {!initialSource && <div className="study-helper-quick">
        {favoriteTools.length > 0 && <div className="study-helper-shelf" role="group" aria-label={tq('toolFavorites')}>
          <span>{tq('toolFavorites')}</span>{favoriteTools.map(key => <button type="button" key={key} aria-pressed={tool === key}
            onClick={() => setTool(key)}>{t(`study.${key}`)}</button>)}
        </div>}
        {recentTools.length > 0 && <div className="study-helper-shelf" role="group" aria-label={tq('toolRecent')}>
          <span>{tq('toolRecent')}</span>{recentTools.map(key => <button type="button" key={key} aria-pressed={tool === key}
            onClick={() => setTool(key)}>{t(`study.${key}`)}</button>)}
        </div>}
      </div>}
      <div className="study-helper-select"><label className="study-field">{t('study.tool')}<select disabled={!!initialSource} value={tool} onChange={event => setTool(event.target.value as StudyTool)}>
        {studyTools.map(key => <option key={key} value={key}>{t(`study.${key}`)}</option>)}</select></label>
        <button type="button" className="study-helper-star" aria-pressed={favoriteTools.includes(tool)}
          aria-label={tq(favoriteTools.includes(tool) ? 'toolUnfavorite' : 'toolFavorite', { name: t(`study.${tool}`) })}
          onClick={() => quick.toggleTool(tool)}><Star size={16} aria-hidden="true" fill={favoriteTools.includes(tool) ? 'currentColor' : 'none'} /></button>
      </div>
      {quick.sessionOnly && <p role="status">{tq('sessionOnly')}</p>}
      {tool === 'number' && <>
        {field('number', t('study.numberInput'), false, 128)}
        <label className="study-field">{t('study.inputBase')}<select value={form.base} onChange={event => change('base', event.target.value)}>
          {[2, 8, 10, 16].map(base => <option key={base}>{base}</option>)}</select></label>
        <p className="muted-text">{t('study.numberHint')}</p>
        <details><summary>{t('study.options')}</summary>{field('width', t('study.bitWidth'), false, 3)}
          <label><input type="checkbox" checked={placeTable} onChange={event => setPlaceTable(event.target.checked)} />{t('study.placeTable')}</label>
          <label><input type="checkbox" checked={blank} onChange={event => setBlank(event.target.checked)} />{t('study.blank')}</label>
        </details>
      </>}
      {tool === 'diagram' && <>
        <label className="study-field">{t('study.preset')}<select defaultValue="flow" onChange={event => change('diagram', t(`study.diagram_${event.target.value as typeof diagramPresets[number]}`))}>
          {diagramPresets.map(key => <option value={key} key={key}>{t(`study.preset_${key}`)}</option>)}</select></label>
        {field('diagram', t('study.connections'), true, 3000)}<p className="muted-text">{t('study.diagramHint')}</p>
        {!error && <StudyDiagram source={form.diagram} />}
      </>}
      {tool === 'recall' && <>{(['question', 'answer', 'hint'] as const).map(key => <RecallField key={key} id={`${id}-${key}`}
        label={t(`study.${key}`)} value={form[key]} onChange={value => change(key, value)} />)}
        <p className="muted-text">{t('study.recallHint')}</p></>}
      {tool === 'statistics' && <>
        <label><input type="checkbox" checked={distribution} onChange={event => setDistribution(event.target.checked)} />{t('study.binomial')}</label>
        {distribution ? <>{field('n', 'n', false, 3)}{field('k', 'k', false, 3)}{field('p', 'p', false, 20)}<p>{t('study.binomialAssumptions')}</p></>
          : <>{field('values', t('study.values'), true, 10000)}<p className="muted-text">{t('study.statisticsHint')}</p></>}
      </>}
      {tool === 'source' && <>{field('title', t('study.titleField'))}{field('author', t('study.author'))}
        <div className="study-fields">{field('year', t('study.year'))}{field('page', t('study.page'))}</div>{field('url', t('study.url'))}</>}
      {tool === 'project' && <>{field('title', t('study.titleField'))}{field('date', t('study.date'))}</>}
      {tool === 'code' && <><label className="study-field">{t('studio.language')}<select value={form.language} onChange={event => change('language', event.target.value)}>
        {['java', 'python', 'cpp', 'c', 'javascript', 'sql'].map(language => <option key={language}>{language}</option>)}</select></label>
        {field('code', t('study.codeInput'), true, 8000)}<p className="muted-text">{t('study.codeHint')}</p></>}
      {error && <p role="status">{error}</p>}
      {output && !error && <div className="logic-table-scroll" tabIndex={0} role="region" aria-label={t('math.preview')}>
        <table className="logic-table"><thead><tr>{output.headers.map(h => <th key={h} scope="col">{h}</th>)}</tr></thead>
          <tbody>{output.rows.map((row, i) => <tr key={i}>{row.map((value, j) => <td key={j}>{blank && tool === 'number' && j > 0 ? '—' : value}</td>)}</tr>)}</tbody></table>
      </div>}
      <p className="muted-text">{tq('toolHint')}</p>
      <div className="study-insert-actions"><button type="button" onClick={onClose}>{t('cancelButton')}</button>
        <button type="button" disabled={!markdown || !!error} onClick={apply}>{t('study.apply')}</button></div>
    </DialogContent>
  </Dialog>
}

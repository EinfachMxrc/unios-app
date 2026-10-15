// SPDX-License-Identifier: AGPL-3.0-or-later

import { useEffect, useId, useRef, useState, type RefObject } from 'react'
import { MathfieldElement } from 'mathlive'
import { Star } from 'lucide-react'
import i18n from '@/i18n'
import { useT } from '@/i18n/useT'
import { Dialog, DialogContent, DialogDescription, DialogTitle } from './StudioDialog'
import { MAX_FORMULA_LENGTH, renderFormula } from './math'
import { logicFormula } from './logicFormula'
import { compareLogicEquation, TruthTableError, type TruthTableErrorCode } from './truthTable'
import LogicEquationResult from './LogicEquationResult'
import { mathTemplates, matrixTemplate, type MathTemplate } from './mathTemplates'
import { matchesMathTemplate, useStudyQuickAccess } from './studyQuickAccess'
import { useStudyDialogEscape } from './useStudyDialogEscape'
import './StudyInsert.css'

// No CDN, sounds or model service. Vite ships the font files with the app.
MathfieldElement.fontsDirectory = `${import.meta.env.BASE_URL}mathlive/fonts`
MathfieldElement.soundsDirectory = null
MathfieldElement.computeEngine = null

function focusMathField(mathfield: MathfieldElement) {
  // MathLive defers its input focus by 60 ms. Focus its exposed keyboard part
  // immediately so fast typing after a template choice keeps the first key.
  const sink = mathfield.shadowRoot?.querySelector<HTMLElement>('[part="keyboard-sink"]')
  if (sink) sink.focus({ preventScroll: true })
  else HTMLElement.prototype.focus.call(mathfield, { preventScroll: true })
  mathfield.focus()
}

function MathInput({
  initial,
  template,
  field,
  keyboardContainer,
  onChange,
  onEnter,
  onKeyboardChange,
}: {
  initial: string
  field: RefObject<MathfieldElement | null>
  keyboardContainer: RefObject<HTMLDivElement | null>
  template?: MathTemplate
  onChange: (value: string) => void
  onEnter: () => void
  onKeyboardChange: (visible: boolean) => void
}) {
  const { t } = useT('notes')
  const container = useRef<HTMLDivElement>(null)
  const enterAction = useRef(onEnter)
  enterAction.current = onEnter
  useEffect(() => {
    const host = container.current
    if (!host) return
    MathfieldElement.locale = i18n.resolvedLanguage ?? 'de'
    const mathfield = new MathfieldElement()
    mathfield.mathVirtualKeyboardPolicy = 'manual'
    mathfield.smartFence = true
    mathfield.setAttribute('aria-label', t('math.input'))
    mathfield.value = initial.length <= MAX_FORMULA_LENGTH ? initial : ''
    const changed = () => onChange(mathfield.value)
    const enter = (event: KeyboardEvent) => {
      if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) {
        event.preventDefault()
        event.stopPropagation()
        enterAction.current()
      }
    }
    mathfield.addEventListener('input', changed)
    mathfield.addEventListener('keydown', enter)
    host.append(mathfield)
    mathfield.menuItems = []
    if (template && !initial) {
      mathfield.insert(mathTemplates[template], { selectionMode: 'placeholder' })
      onChange(mathfield.value)
    }
    field.current = mathfield
    const keyboard = window.mathVirtualKeyboard
    const previousContainer = keyboard.container
    if (keyboardContainer.current) keyboard.container = keyboardContainer.current
    const resizeKeyboard = () => {
      // Custom containers need a content height; MathLive's root is height:100%.
      if (keyboardContainer.current)
        keyboardContainer.current.style.height = keyboard.visible
          ? `${Math.ceil(keyboard.boundingRect.height) + 8}px`
          : '0px'
      onKeyboardChange(keyboard.visible)
    }
    keyboard.addEventListener('geometrychange', resizeKeyboard)
    keyboard.addEventListener('virtual-keyboard-toggle', resizeKeyboard)
    const frame = requestAnimationFrame(() => focusMathField(mathfield))
    return () => {
      cancelAnimationFrame(frame)
      keyboard.removeEventListener('geometrychange', resizeKeyboard)
      keyboard.removeEventListener('virtual-keyboard-toggle', resizeKeyboard)
      keyboard.hide()
      keyboard.container = previousContainer
      mathfield.removeEventListener('input', changed)
      mathfield.removeEventListener('keydown', enter)
      mathfield.remove()
      field.current = null
    }
  }, [initial, template, t, field, keyboardContainer, onChange, onKeyboardChange])
  return <div className="math-entry-host" ref={container} />
}

export default function MathEntryDialog({
  initial = '',
  template,
  displayMode = false,
  onApply,
  onClose,
}: {
  initial?: string
  template?: MathTemplate
  displayMode?: boolean
  onApply: (latex: string) => void
  onClose: () => void
}) {
  const { t } = useT('notes')
  const { t: tq } = useT('mathQuick')
  const content = useStudyDialogEscape(onClose)
  const quick = useStudyQuickAccess()
  const searchHint = useId()
  const field = useRef<MathfieldElement | null>(null)
  const usedTemplates = useRef<MathTemplate[]>(template ? [template] : [])
  const keyboardContainer = useRef<HTMLDivElement>(null)
  const [latex, setLatex] = useState(initial)
  const [keyboardOpen, setKeyboardOpen] = useState(false)
  const [mathInitial, setMathInitial] = useState(initial)
  const [mode, setMode] = useState<'math' | 'logic'>('math')
  const [logic, setLogic] = useState('')
  const logicHelp = useId()
  const [query, setQuery] = useState('')
  const [shelf, setShelf] = useState<'all' | 'favorites' | 'recent'>('all')
  const [selected, setSelected] = useState(0)
  const [rows, setRows] = useState(2)
  const [columns, setColumns] = useState(2)
  const [square, setSquare] = useState(false)
  const formula = mode === 'logic' ? (logicFormula(logic) ?? '') : latex
  const preview = renderFormula(formula, displayMode)
  let comparison = null
  let comparisonError: TruthTableErrorCode | null = null
  if (mode === 'logic') {
    try {
      comparison = compareLogicEquation(logic)
    } catch (error) {
      comparisonError = error instanceof TruthTableError ? error.code : 'syntax'
    }
  }
  const valid = preview !== null && !comparisonError
  const { favorites, recent } = quick.preferences.templates
  const templateKeys =
    shelf === 'all'
      ? [...new Set([...favorites, ...recent, ...Object.keys(mathTemplates)])]
      : quick.preferences.templates[shelf]
  const templates = (templateKeys as MathTemplate[]).filter((key) => matchesMathTemplate(key, t(`math.${key}`), query))
  const selectedTemplate = templates[Math.min(selected, Math.max(0, templates.length - 1))]
  function insertTemplate(value: string, templateKey?: MathTemplate) {
    if (templateKey) usedTemplates.current.push(templateKey)
    field.current?.insert(value, { selectionMode: 'placeholder' })
    if (field.current) {
      focusMathField(field.current)
      setLatex(field.current.value)
    }
  }
  const apply = useRef(() => {})
  apply.current = () => {
    if (!valid) return
    // Cancelled dialogs do not fill the recent shelf with unused templates.
    if (mode === 'math') for (const key of usedTemplates.current) quick.useTemplate(key)
    onApply(formula)
  }
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onClose()
      }}
    >
      <DialogContent
        ref={content}
        className="studio-dialog study-insert-dialog"
        onEscapeKeyDown={(event) => {
          // Do not let Escape dismiss the parent PDF or helper dialog as well.
          event.preventDefault()
          event.stopPropagation()
          onClose()
        }}
        onKeyDownCapture={(event) => {
          if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) {
            event.preventDefault()
            event.stopPropagation()
            apply.current()
          }
        }}
      >
        <DialogTitle>{t('math.title')}</DialogTitle>
        <DialogDescription>{t('math.description')}</DialogDescription>
        <div className="math-quick-tabs" role="group" aria-label={t('math.entryMode')}>
          <button type="button" aria-pressed={mode === 'math'} onClick={() => setMode('math')}>
            {t('math.mathMode')}
          </button>
          <button
            type="button"
            aria-pressed={mode === 'logic'}
            onClick={() => {
              setMathInitial(latex)
              setMode('logic')
              setKeyboardOpen(false)
            }}
          >
            {t('math.logicMode')}
          </button>
        </div>
        {mode === 'logic' ? (
          <>
            <label className="logic-expression">
              {t('math.logicInput')}
              <input
                autoFocus
                value={logic}
                maxLength={MAX_FORMULA_LENGTH}
                spellCheck={false}
                aria-describedby={logicHelp}
                aria-invalid={!!logic.trim() && (!preview || !!comparisonError)}
                onChange={(event) => setLogic(event.target.value)}
              />
            </label>
            <p id={logicHelp} className="muted-text">
              {t('math.logicHint')}
            </p>
            {preview && (
              <div
                className="reader-note-preview"
                role="region"
                aria-label={t('math.logicPreview')}
                dangerouslySetInnerHTML={{ __html: preview }}
              />
            )}
            {comparisonError ? (
              <p role="status">{t(`logic.error_${comparisonError}`)}</p>
            ) : (
              comparison && <LogicEquationResult comparison={comparison} />
            )}
            <p className="muted-text">{t('math.logicPresentation')}</p>
          </>
        ) : (
          <>
            <MathInput
              initial={mathInitial}
              template={template}
              field={field}
              keyboardContainer={keyboardContainer}
              onChange={setLatex}
              onEnter={() => apply.current()}
              onKeyboardChange={setKeyboardOpen}
            />
            <div className="math-keyboard-container" ref={keyboardContainer} />
            {!keyboardOpen && (
              <>
                <div className="math-quick-tabs" role="group" aria-label={t('math.templates')}>
                  {(['all', 'favorites', 'recent'] as const).map((key) => (
                    <button
                      type="button"
                      key={key}
                      aria-pressed={shelf === key}
                      onClick={() => {
                        setShelf(key)
                        setSelected(0)
                      }}
                    >
                      {tq(key)}
                    </button>
                  ))}
                </div>
                <label className="logic-expression">
                  {tq('findTemplate')}
                  <input
                    value={query}
                    maxLength={80}
                    onChange={(event) => {
                      setQuery(event.target.value)
                      setSelected(0)
                    }}
                    aria-describedby={searchHint}
                    onKeyDown={(event) => {
                      if (event.nativeEvent.isComposing) return
                      if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
                        event.preventDefault()
                        setSelected((index) =>
                          templates.length
                            ? (Math.min(index, templates.length - 1) +
                                (event.key === 'ArrowDown' ? 1 : -1) +
                                templates.length) %
                              templates.length
                            : 0,
                        )
                      } else if (event.key === 'Enter' && !event.ctrlKey && !event.metaKey && selectedTemplate) {
                        event.preventDefault()
                        insertTemplate(mathTemplates[selectedTemplate], selectedTemplate)
                      }
                    }}
                  />
                </label>
                <div className="math-templates" role="group" aria-label={t('math.templates')}>
                  {templates.map((key) => (
                    <div key={key} className={`math-template-choice${key === selectedTemplate ? ' is-selected' : ''}`}>
                      <button
                        type="button"
                        onMouseDown={(event) => event.preventDefault()}
                        onClick={() => insertTemplate(mathTemplates[key], key)}
                      >
                        {t(`math.${key}`)}
                      </button>
                      <button
                        type="button"
                        className="math-template-star"
                        aria-pressed={favorites.includes(key)}
                        aria-label={tq(favorites.includes(key) ? 'unfavorite' : 'favorite', { name: t(`math.${key}`) })}
                        onMouseDown={(event) => event.preventDefault()}
                        onClick={() => quick.toggleTemplate(key)}
                      >
                        <Star size={14} aria-hidden="true" fill={favorites.includes(key) ? 'currentColor' : 'none'} />
                      </button>
                    </div>
                  ))}
                </div>
                <span className="sr-only" role="status">
                  {selectedTemplate ? tq('selected', { name: t(`math.${selectedTemplate}`) }) : ''}
                </span>
                {!templates.length && (
                  <p role="status">
                    {tq(query.trim() ? 'noResults' : shelf === 'favorites' ? 'emptyFavorites' : 'emptyRecent')}
                  </p>
                )}
                <p className="muted-text" id={searchHint}>
                  {tq('searchHint')}
                </p>
                {quick.sessionOnly && <p role="status">{tq('sessionOnly')}</p>}
                <details>
                  <summary>{t('math.matrixSize')}</summary>
                  <div className="study-fields">
                    <label>
                      {t('math.rows')}
                      <input
                        type="number"
                        min={1}
                        max={8}
                        value={rows}
                        onChange={(event) => setRows(Number(event.target.value))}
                      />
                    </label>
                    <label>
                      {t('math.columns')}
                      <input
                        type="number"
                        min={1}
                        max={8}
                        value={columns}
                        onChange={(event) => setColumns(Number(event.target.value))}
                      />
                    </label>
                    <label>
                      <input type="checkbox" checked={square} onChange={(event) => setSquare(event.target.checked)} />
                      {t('math.squareBrackets')}
                    </label>
                    <button
                      type="button"
                      disabled={![rows, columns].every((n) => Number.isInteger(n) && n >= 1 && n <= 8)}
                      onClick={() => insertTemplate(matrixTemplate(rows, columns, square), 'matrix')}
                    >
                      {t('math.insertMatrix')}
                    </button>
                  </div>
                </details>
                <p className="muted-text">{t('math.shortcuts')}</p>
              </>
            )}
          </>
        )}
        {mode === 'math' && (
          <details open={initial.length > MAX_FORMULA_LENGTH || undefined}>
            <summary>{t('math.source')}</summary>
            <textarea
              className="math-source"
              aria-label={t('math.source')}
              value={latex}
              maxLength={MAX_FORMULA_LENGTH}
              spellCheck={false}
              onChange={(event) => {
                setLatex(event.target.value)
                if (field.current) field.current.value = event.target.value
              }}
            />
          </details>
        )}
        {(mode === 'logic' ? logic : latex).trim() && !preview && (
          <p role="status">
            {t(
              mode === 'logic'
                ? 'math.logicInvalid'
                : latex.length > MAX_FORMULA_LENGTH
                  ? 'math.tooLong'
                  : 'math.invalid',
            )}
          </p>
        )}
        <div className="study-insert-actions">
          <button type="button" onClick={onClose}>
            {t('cancelButton')}
          </button>
          <button type="button" disabled={!valid} onClick={() => apply.current()}>
            {t('math.apply')}
          </button>
        </div>
      </DialogContent>
    </Dialog>
  )
}

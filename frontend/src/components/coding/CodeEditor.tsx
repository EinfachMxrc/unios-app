// SPDX-License-Identifier: AGPL-3.0-or-later

import { useEffect, useRef } from 'react'
import * as monaco from 'monaco-editor/editor/editor.api.js'
import 'monaco-editor/languages/definitions/java/register.js'
import 'monaco-editor/languages/definitions/python/register.js'
import 'monaco-editor/languages/definitions/javascript/register.js'
import 'monaco-editor/languages/features/typescript/register.js'
import EditorWorker from 'monaco-editor/editor/editor.worker.js?worker'
import TypeScriptWorker from 'monaco-editor/languages/features/typescript/ts.worker.js?worker'

self.MonacoEnvironment = {
  getWorker(_id, label) {
    return label === 'typescript' || label === 'javascript' ? new TypeScriptWorker() : new EditorWorker()
  },
}

type Props = {
  value: string
  language: string
  filename: string
  label: string
  onChange: (value: string) => void
  onRun: () => void
  original?: string
  readOnly?: boolean
}

export function CodeEditor({ value, language, filename, label, onChange, onRun, original, readOnly = false }: Props) {
  const container = useRef<HTMLDivElement>(null)
  const editor = useRef<monaco.editor.IStandaloneCodeEditor | monaco.editor.IStandaloneDiffEditor | null>(null)
  const model = useRef<monaco.editor.ITextModel | null>(null)
  const callbacks = useRef({ onChange, onRun })
  callbacks.current = { onChange, onRun }

  useEffect(() => {
    if (!container.current) return
    const code = monaco.editor.createModel(value, language)
    model.current = code
    const options = {
      automaticLayout: true, minimap: { enabled: false }, fontSize: 14, fontFamily: 'Fira Code, monospace',
      fontLigatures: true, scrollBeyondLastLine: false, tabSize: 4, ariaLabel: label,
      wordWrap: 'on' as const, padding: { top: 20, bottom: 20 }, fixedOverflowWidgets: true,
      readOnly,
      editContext: false,
    }
    let old: monaco.editor.ITextModel | null = null
    if (original !== undefined) {
      old = monaco.editor.createModel(original, language)
      const diff = monaco.editor.createDiffEditor(container.current, { ...options, renderSideBySide: false, originalEditable: false })
      diff.setModel({ original: old, modified: code })
      editor.current = diff
    } else {
      editor.current = monaco.editor.create(container.current, { ...options, model: code })
    }
    const editable = 'getModifiedEditor' in editor.current ? editor.current.getModifiedEditor() : editor.current
    const change = code.onDidChangeContent(() => callbacks.current.onChange(code.getValue()))
    const action = editable.addAction({
      id: 'unios.run', label, keybindings: [monaco.KeyMod.CtrlCmd | monaco.KeyCode.Enter],
      run: () => callbacks.current.onRun(),
    })
    const theme = () => monaco.editor.setTheme(document.documentElement.classList.contains('dark') ? 'vs-dark' : 'vs')
    theme()
    const observer = new MutationObserver(theme)
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] })
    return () => {
      observer.disconnect()
      action.dispose()
      change.dispose()
      editor.current?.dispose()
      code.dispose()
      old?.dispose()
      editor.current = null
      model.current = null
    }
    // Models survive keystrokes; a file/diff change gets a fresh isolated editor.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filename, language, original])

  useEffect(() => {
    if (model.current && model.current.getValue() !== value) model.current.setValue(value)
  }, [value])

  useEffect(() => { editor.current?.updateOptions({ readOnly }) }, [readOnly])

  return <div className="coding-monaco" ref={container} />
}

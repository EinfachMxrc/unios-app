// SPDX-License-Identifier: AGPL-3.0-or-later

import { useEffect, useRef, useState, type PointerEvent } from 'react'
import type { PDFDocumentProxy } from 'pdfjs-dist'
import { request } from '@/api'
import { useT } from '@/i18n/useT'
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/editor/StudioDialog'
import { markdownCell } from '@/components/editor/studyModels'
import type { Material } from '@/types'
import { Button } from '@/components/ui/button'
import './PdfClipTool.css'

type Rectangle = { x: number; y: number; width: number; height: number }
export function parseClip(value: string | null): Rectangle | null {
  if (!value || value.length > 100 || !/^(?:\d+(?:\.\d+)?,){3}\d+(?:\.\d+)?$/.test(value)) return null
  const [x, y, width, height] = value.split(',').map(Number)
  const rect = { x, y, width, height }
  return validClip(rect) ? rect : null
}
export function validClip(rect: Rectangle): boolean {
  return Object.values(rect).every(Number.isFinite) && rect.x >= 0 && rect.y >= 0 && rect.width >= .005 && rect.height >= .005 &&
    rect.x + rect.width <= 1.000001 && rect.y + rect.height <= 1.000001
}
export function PdfClipTool({ pdf, material, page, canWrite, onApply }: {
  pdf: PDFDocumentProxy; material: Material; page: number; canWrite: boolean; onApply: (markdown: string) => void
}) {
  const { t } = useT('material')
  const [open, setOpen] = useState(false)
  return <><Button size="sm" variant="outline" disabled={!canWrite} onClick={() => setOpen(true)}>{t('clip.open')}</Button>
    {open && <ClipDialog pdf={pdf} material={material} page={page} onClose={() => setOpen(false)} onApply={markdown => { onApply(markdown); setOpen(false) }} />}</>
}
function ClipDialog({ pdf, material, page, onApply, onClose }: {
  pdf: PDFDocumentProxy; material: Material; page: number; onApply: (markdown: string) => void; onClose: () => void
}) {
  const { t } = useT('material')
  const [surface, setSurface] = useState<HTMLCanvasElement | null>(null)
  const controller = useRef<AbortController | null>(null)
  const [ready, setReady] = useState(false), [busy, setBusy] = useState(false), [error, setError] = useState('')
  const [rect, setRect] = useState<Rectangle>({ x: 0, y: 0, width: 1, height: 1 })
  const drag = useRef<{ x: number; y: number } | null>(null)
  const savedAsset = useRef<{ key: string; src: string } | null>(null)
  const running = useRef(false)
  useEffect(() => {
    let disposed = false, task: { cancel: () => void } | undefined
    if (!surface) return
    void pdf.getPage(page).then(async source => {
      if (disposed || !surface) return
      const original = source.getViewport({ scale: 1 })
      const viewport = source.getViewport({ scale: Math.min(1600 / original.width, 2000 / original.height) })
      surface.width = Math.ceil(viewport.width); surface.height = Math.ceil(viewport.height)
      const rendering = source.render({ canvas: surface, canvasContext: surface.getContext('2d')!, viewport, background: 'white' })
      task = rendering
      await rendering.promise
      if (!disposed) setReady(true)
    }).catch(() => { if (!disposed) setError(t('clip.renderFailed')) })
    return () => { disposed = true; task?.cancel(); controller.current?.abort() }
  }, [pdf, page, t, surface])
  function point(event: PointerEvent<HTMLDivElement>) {
    const box = event.currentTarget.getBoundingClientRect()
    return { x: Math.max(0, Math.min(1, (event.clientX - box.left) / box.width)), y: Math.max(0, Math.min(1, (event.clientY - box.top) / box.height)) }
  }
  async function apply() {
    if (!ready || running.current || !surface || !validClip(rect)) return
    running.current = true
    setBusy(true); setError('')
    const abort = new AbortController(); controller.current = abort
    const captured = { ...rect }, key = JSON.stringify(captured)
    try {
      let asset = savedAsset.current?.key === key ? savedAsset.current : null
      if (!asset) {
        const source = surface, output = document.createElement('canvas')
        const left = Math.floor(captured.x * source.width), top = Math.floor(captured.y * source.height)
        output.width = Math.max(1, Math.min(source.width - left, Math.ceil(captured.width * source.width)))
        output.height = Math.max(1, Math.min(source.height - top, Math.ceil(captured.height * source.height)))
        output.getContext('2d')!.drawImage(source, left, top, output.width, output.height, 0, 0, output.width, output.height)
        const blob = await new Promise<Blob>((resolve, reject) => output.toBlob(value => value ? resolve(value) : reject(new Error('blob')), 'image/png'))
        if (abort.signal.aborted) return
        const form = new FormData(); form.append('file', blob, `pdf-clip-${page}.png`)
        const result = await request<{ src: string; kind: string }>('/api/note-assets', { method: 'POST', body: form, signal: abort.signal })
        if (!/^\/api\/note-assets\/[0-9a-f-]{36}\.png$/.test(result.src) || result.kind !== 'image') throw new Error('asset')
        asset = { key, src: result.src }; savedAsset.current = asset
      }
      if (abort.signal.aborted) return
      const coordinates = [captured.x, captured.y, captured.width, captured.height].map(n => n.toFixed(5)).join(',')
      const label = markdownCell(`${material.resource_name} · ${page}`)
      onApply(`![${label}](${asset.src})\n\n[${label}](/material/${material.version_id}?page=${page}&clip=${coordinates})\n\n`)
    } catch { if (!abort.signal.aborted) setError(t('clip.saveFailed')) }
    finally { running.current = false; if (!abort.signal.aborted) setBusy(false) }
  }
  return <Dialog open onOpenChange={next => { if (!next && !busy) onClose() }}>
    <DialogContent className="studio-dialog study-insert-dialog" onKeyDown={event => {
      if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) { event.preventDefault(); event.stopPropagation(); void apply() }
    }}>
      <DialogTitle>{t('clip.title')}</DialogTitle><DialogDescription>{t('clip.description')}</DialogDescription>
      <div className="pdf-clip-page" role="group" aria-label={t('clip.page', { page })} onPointerDown={event => {
        if (!ready || busy || event.button !== 0) return
        drag.current = point(event); event.currentTarget.setPointerCapture(event.pointerId); event.preventDefault()
      }} onPointerMove={event => {
        if (!drag.current || busy) return
        const end = point(event), start = drag.current
        setRect({ x: Math.min(start.x, end.x), y: Math.min(start.y, end.y), width: Math.abs(end.x - start.x), height: Math.abs(end.y - start.y) })
      }} onPointerUp={() => { drag.current = null }} onPointerCancel={() => { drag.current = null }}>
        <canvas ref={setSurface} /><div className="pdf-clip-selection" style={{ left: `${rect.x * 100}%`, top: `${rect.y * 100}%`, width: `${rect.width * 100}%`, height: `${rect.height * 100}%` }} />
      </div>
      <div className="study-fields">{(['x', 'y', 'width', 'height'] as const).map(key => <label key={key}>{t(`clip.${key}`)}
        <input type="number" min={0} max={100} step={.5} value={Number((rect[key] * 100).toFixed(2))} readOnly={busy}
          onChange={event => setRect(current => ({ ...current, [key]: Number(event.target.value) / 100 }))} /></label>)}</div>
      {error && <p role="status">{error}</p>}
      <div className="study-insert-actions"><button type="button" onClick={() => { controller.current?.abort(); onClose() }}>{t('cancelButton')}</button>
        <button type="button" disabled={!ready || busy || !validClip(rect)} onClick={() => void apply()}>{t(busy ? 'clip.saving' : 'clip.apply')}</button></div>
    </DialogContent>
  </Dialog>
}

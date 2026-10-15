// SPDX-License-Identifier: AGPL-3.0-or-later
// @vitest-environment jsdom

import { act, cleanup, fireEvent, render } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { PageProps } from 'react-pdf'
import { ReaderPage } from './ReaderParts'
import { READER_RENDER_IDLE_MS } from './useReaderRenderLayers'

const pdf = vi.hoisted(() => ({
  pages: new Map<number, PageProps>(),
  registerPage: vi.fn(),
  unregisterPage: vi.fn(),
}))
vi.mock('react-pdf', () => ({
  useDocumentContext: () => ({ registerPage: pdf.registerPage, unregisterPage: pdf.unregisterPage }),
  Page: (props: PageProps) => {
    pdf.pages.set(props.width!, props)
    return (
      <div className="react-pdf__Page">
        <canvas className="react-pdf__Page__canvas" />
        <div className="react-pdf__Page__textContent">
          <span>synthetic passage</span>
        </div>
        <div className="react-pdf__Page__annotations">
          <a href="#fixture">synthetic link</a>
        </div>
      </div>
    )
  },
}))
vi.mock('@/i18n/useT', () => ({ useT: () => ({ t: (key: string) => key }) }))
vi.mock('@/api', () => ({ localDate: () => '' }))
vi.mock('@/components/State', () => ({
  Failure: ({ message }: { message: string }) => <div role="alert">{message}</div>,
}))

let observers: IntersectionObserverCallback[]
beforeEach(() => {
  vi.useFakeTimers()
  pdf.pages.clear()
  pdf.registerPage.mockClear()
  pdf.unregisterPage.mockClear()
  observers = []
  vi.stubGlobal(
    'IntersectionObserver',
    class {
      constructor(callback: IntersectionObserverCallback) {
        observers.push(callback)
      }
      observe() {}
      disconnect() {}
    },
  )
})
afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
  vi.useRealTimers()
})
const advance = () =>
  act(() => {
    vi.advanceTimersByTime(READER_RENDER_IDLE_MS)
  })
const finish = (width: number, part: 'canvas' | 'text' | 'annotations') =>
  act(() => {
    const page = pdf.pages.get(width)!
    if (part === 'canvas') page.onRenderSuccess?.({} as never)
    if (part === 'text') page.onRenderTextLayerSuccess?.()
    if (part === 'annotations') page.onRenderAnnotationLayerSuccess?.()
  })
const finishAll = (width: number) => {
  finish(width, 'canvas')
  finish(width, 'text')
  finish(width, 'annotations')
}
const props = {
  number: 1,
  width: 760,
  ratio: 1.5,
  originalColors: true,
  annotations: [],
  pendingSelection: null,
  onSelect: vi.fn(),
}

describe('reader page rendering', () => {
  it('keeps React-PDF task callbacks stable during layout-only zoom updates', () => {
    const { rerender } = render(<ReaderPage {...props} />)
    const original = pdf.pages.get(760)!
    rerender(<ReaderPage {...props} width={850} />)
    rerender(<ReaderPage {...props} width={1000} />)
    const preview = pdf.pages.get(760)!
    expect(preview.width).toBe(original.width)
    expect(preview.onRenderSuccess).toBe(original.onRenderSuccess)
    expect(preview.onRenderTextLayerSuccess).toBe(original.onRenderTextLayerSuccess)
    expect(preview.onRenderAnnotationLayerSuccess).toBe(original.onRenderAnnotationLayerSuccess)
    expect(preview.onRenderTextLayerError).toBe(original.onRenderTextLayerError)
    expect(preview.onRenderAnnotationLayerError).toBe(original.onRenderAnnotationLayerError)
  })

  it('scales canvas, text, links and normalized marks together while slot geometry updates immediately', () => {
    const pendingSelection = { quote: 'synthetic passage', page: 1, rects: [[0.2, 0.3, 0.5, 0.4]] }
    const { container, rerender } = render(<ReaderPage {...props} pendingSelection={pendingSelection} />)
    rerender(<ReaderPage {...props} width={1000} pendingSelection={pendingSelection} />)
    const slot = container.querySelector<HTMLElement>('[data-reader-page]')!
    const frame = container.querySelector<HTMLElement>('[data-material-page]')!
    const layer = frame.querySelector<HTMLElement>('[data-reader-render-active="true"]')!
    expect(slot.style.width).toBe('1000px')
    expect(slot.style.height).toBe('1500px')
    expect(frame.style.width).toBe('1000px')
    expect(frame.style.height).toBe('1500px')
    expect(frame.style.overflow).toBe('hidden')
    expect(layer.style.transform).toBe(`scale(${1000 / 760})`)
    for (const selector of [
      'canvas',
      '.react-pdf__Page__textContent',
      '.react-pdf__Page__annotations',
      '.material-overlays',
    ]) {
      expect(frame.querySelector(selector)?.closest('.material-render-layer')).toBe(layer)
    }
    const mark = frame.querySelector<HTMLElement>('.material-mark.pending')!
    expect(mark.style.left).toBe('20%')
    expect(mark.style.top).toBe('30%')
    expect(mark.style.width).toBe('30%')
    expect(pdf.pages.has(1000)).toBe(false)
  })

  it('keeps the old page until all replacement layers are ready and never exceeds two canvases', () => {
    const { container, rerender } = render(<ReaderPage {...props} />)
    rerender(<ReaderPage {...props} width={1000} />)
    advance()
    expect(container.querySelectorAll('canvas').length).toBe(2)
    const candidate = container.querySelector('[data-reader-render-active="false"]')!
    expect(candidate.getAttribute('data-reader-render-complete')).toBe('false')
    expect(candidate.getAttribute('aria-hidden')).toBe('true')
    expect(candidate.hasAttribute('inert')).toBe(true)
    finish(1000, 'canvas')
    finish(1000, 'text')
    expect(candidate.getAttribute('data-reader-render-complete')).toBe('false')
    expect(
      container.querySelector('[data-reader-render-active="true"]')?.getAttribute('data-reader-render-width'),
    ).toBe('760')
    finish(1000, 'annotations')
    expect(container.querySelectorAll('canvas').length).toBe(1)
    expect(
      container.querySelector('[data-reader-render-active="true"]')?.getAttribute('data-reader-render-width'),
    ).toBe('1000')
    expect(
      container.querySelector('[data-reader-render-active="true"]')?.getAttribute('data-reader-render-complete'),
    ).toBe('true')
    expect(container.querySelector<HTMLElement>('.material-render-layer')?.style.transform).toBe('')
    expect(pdf.registerPage).toHaveBeenCalledOnce()
    expect(pdf.unregisterPage).not.toHaveBeenCalled()
  })

  it('does not replace selected text before capture and releases the ready raster when selection clears', () => {
    const onSelect = vi.fn()
    const { container, rerender } = render(<ReaderPage {...props} onSelect={onSelect} />)
    const span = container.querySelector('.react-pdf__Page__textContent span')!
    const selected = vi
      .spyOn(window, 'getSelection')
      .mockReturnValue({ isCollapsed: false, anchorNode: span.firstChild } as Selection)
    rerender(<ReaderPage {...props} width={1000} onSelect={onSelect} />)
    advance()
    finishAll(1000)
    expect(container.contains(span)).toBe(true)
    expect(container.querySelectorAll('canvas').length).toBe(2)
    fireEvent.mouseUp(span)
    expect(onSelect).toHaveBeenCalledOnce()
    selected.mockReturnValue({ isCollapsed: true, anchorNode: null } as Selection)
    fireEvent(document, new Event('selectionchange'))
    expect(container.contains(span)).toBe(false)
    expect(container.querySelectorAll('canvas').length).toBe(1)
  })

  it('unmounts stale replacements when zoom resumes and retains the last good page after failure', () => {
    const { container, rerender } = render(<ReaderPage {...props} />)
    rerender(<ReaderPage {...props} width={900} />)
    advance()
    rerender(<ReaderPage {...props} width={1100} />)
    finishAll(900)
    expect(container.querySelectorAll('canvas').length).toBe(1)
    advance()
    act(() => pdf.pages.get(1100)!.onRenderError?.(new Error('synthetic failure')))
    expect(container.querySelectorAll('canvas').length).toBe(1)
    expect(
      container.querySelector('[data-reader-render-active="true"]')?.getAttribute('data-reader-render-width'),
    ).toBe('760')
    expect(container.querySelector('[role="alert"]')?.textContent).toBe('pdfLoadFailed')
  })

  it.each(['text', 'annotations'] as const)(
    'retains the last good page when %s fails after the other replacement layers succeed',
    (part) => {
      const { container, rerender } = render(<ReaderPage {...props} />)
      const oldLayer = container.querySelector('[data-reader-render-active="true"]')!
      rerender(<ReaderPage {...props} width={1000} />)
      advance()
      finish(1000, 'canvas')
      finish(1000, part === 'text' ? 'annotations' : 'text')
      act(() => {
        const page = pdf.pages.get(1000)!
        if (part === 'text') page.onRenderTextLayerError?.(new Error('synthetic text failure'))
        else page.onRenderAnnotationLayerError?.(new Error('synthetic annotation failure'))
      })
      // Late callbacks from a failed/unmounted task must never publish it.
      finishAll(1000)
      expect(container.querySelectorAll('canvas').length).toBe(1)
      expect(container.querySelector('[data-reader-render-active="true"]')).toBe(oldLayer)
      expect(oldLayer.getAttribute('data-reader-render-width')).toBe('760')
      expect(container.querySelector('[role="alert"]')?.textContent).toBe('pdfLoadFailed')
    },
  )

  it('renders no offscreen canvases and cancels pending work when a lazy page leaves view', () => {
    const { container, rerender } = render(<ReaderPage {...props} number={120} />)
    expect(container.querySelectorAll('canvas').length).toBe(0)
    act(() => observers[0]([{ isIntersecting: true }] as IntersectionObserverEntry[], {} as IntersectionObserver))
    expect(container.querySelectorAll('canvas').length).toBe(1)
    rerender(<ReaderPage {...props} number={120} width={1000} />)
    expect(vi.getTimerCount()).toBe(1)
    act(() => observers[0]([{ isIntersecting: false }] as IntersectionObserverEntry[], {} as IntersectionObserver))
    expect(container.querySelectorAll('canvas').length).toBe(0)
    expect(vi.getTimerCount()).toBe(0)
    expect(container.querySelector<HTMLElement>('[data-reader-page]')?.style.height).toBe('1500px')
    expect(pdf.unregisterPage).toHaveBeenCalledExactlyOnceWith(119)
  })
})

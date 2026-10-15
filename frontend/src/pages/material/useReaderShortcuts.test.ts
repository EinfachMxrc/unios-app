// SPDX-License-Identifier: AGPL-3.0-or-later
// @vitest-environment jsdom

import { cleanup, renderHook } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { useReaderShortcuts } from './useReaderShortcuts'

afterEach(() => {
  cleanup()
  document.body.replaceChildren()
})

function press(target: EventTarget, init: KeyboardEventInit) {
  const event = new KeyboardEvent('keydown', { bubbles: true, cancelable: true, ...init })
  target.dispatchEvent(event)
  return event
}

function setup() {
  const actions = {
    zoom: vi.fn(),
    fitWidth: vi.fn(),
    toggleNoteBeside: vi.fn(),
    jumpToPage: vi.fn(),
    focusSearch: vi.fn(),
  }
  const hook = renderHook((props) => useReaderShortcuts(props), { initialProps: actions })
  return { actions, ...hook }
}

it('zooms the PDF instead of the page and fits the width', () => {
  const { actions } = setup()
  expect(press(window, { key: '=', ctrlKey: true }).defaultPrevented).toBe(true)
  press(window, { key: '-', metaKey: true })
  press(window, { key: '0', ctrlKey: true })
  expect(actions.zoom.mock.calls).toEqual([[1], [-1]])
  expect(actions.fitWidth).toHaveBeenCalledOnce()
})

it('leaves zoom keys to text fields but toggles the split view everywhere', () => {
  const { actions } = setup()
  const editor = document.createElement('div')
  editor.setAttribute('contenteditable', 'true')
  document.body.append(editor)
  expect(press(editor, { key: '=', ctrlKey: true }).defaultPrevented).toBe(false)
  expect(actions.zoom).not.toHaveBeenCalled()
  expect(press(editor, { key: 'B', code: 'KeyB', ctrlKey: true, shiftKey: true }).defaultPrevented).toBe(true)
  expect(actions.toggleNoteBeside).toHaveBeenCalledOnce()
})

it('always calls the latest handlers and stops listening on unmount', () => {
  const { actions, rerender, unmount } = setup()
  const next = {
    zoom: vi.fn(),
    fitWidth: vi.fn(),
    toggleNoteBeside: vi.fn(),
    jumpToPage: vi.fn(),
    focusSearch: vi.fn(),
  }
  rerender(next)
  press(window, { key: '+', ctrlKey: true })
  expect(next.zoom).toHaveBeenCalledWith(1)
  expect(actions.zoom).not.toHaveBeenCalled()
  unmount()
  expect(press(window, { key: '+', ctrlKey: true }).defaultPrevented).toBe(false)
})

it('opens the page field with G, but never while typing or with a modifier', () => {
  const { actions } = setup()
  expect(press(window, { key: 'g' }).defaultPrevented).toBe(true)
  press(window, { key: 'G', shiftKey: true })
  const field = document.createElement('input')
  document.body.append(field)
  expect(press(field, { key: 'g' }).defaultPrevented).toBe(false)
  press(window, { key: 'g', ctrlKey: true })
  expect(actions.jumpToPage).toHaveBeenCalledTimes(2)
})

it('sends Ctrl/Cmd+F to the PDF search instead of the browser, outside text fields', () => {
  const { actions } = setup()
  expect(press(window, { key: 'f', ctrlKey: true }).defaultPrevented).toBe(true)
  press(window, { key: 'F', metaKey: true })
  const editor = document.createElement('textarea')
  document.body.append(editor)
  expect(press(editor, { key: 'f', ctrlKey: true }).defaultPrevented).toBe(false)
  expect(actions.focusSearch).toHaveBeenCalledTimes(2)
})

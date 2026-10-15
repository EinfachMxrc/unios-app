// SPDX-License-Identifier: AGPL-3.0-or-later
// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { createPortal } from 'react-dom'
import { afterEach, expect, it, vi } from 'vitest'
import { useStudyDialogEscape } from './useStudyDialogEscape'

function Helper({ name, close, children }: { name: string; close: () => void; children?: React.ReactNode }) {
  const content = useStudyDialogEscape(close)
  return (
    <div ref={content}>
      <input aria-label={name} />
      {children}
    </div>
  )
}
afterEach(cleanup)

it('consumes the first Escape before the surrounding document listener', () => {
  const parent = vi.fn(),
    close = vi.fn()
  document.addEventListener('keydown', parent, { capture: true })
  try {
    render(<Helper name="synthetic formula" close={close} />)
    const field = screen.getByRole('textbox')
    field.focus()
    fireEvent.keyDown(field, { key: 'Escape' })
    expect(close).toHaveBeenCalledOnce()
    expect(parent).not.toHaveBeenCalled()
  } finally {
    document.removeEventListener('keydown', parent, { capture: true })
  }
})

it('closes only the focused portalled helper and ignores keys outside it or during composition', () => {
  const outer = vi.fn(),
    inner = vi.fn()
  render(
    <>
      <Helper name="synthetic recall" close={outer}>
        {createPortal(<Helper name="synthetic child formula" close={inner} />, document.body)}
      </Helper>
      <input aria-label="outside notes" />
    </>,
  )
  const child = screen.getByRole('textbox', { name: 'synthetic child formula' })
  child.focus()
  fireEvent.keyDown(child, { key: 'Escape', isComposing: true })
  expect(inner).not.toHaveBeenCalled()
  fireEvent.keyDown(child, { key: 'Escape' })
  expect(inner).toHaveBeenCalledOnce()
  expect(outer).not.toHaveBeenCalled()
  const outside = screen.getByRole('textbox', { name: 'outside notes' })
  outside.focus()
  fireEvent.keyDown(outside, { key: 'Escape' })
  expect(inner).toHaveBeenCalledOnce()
  expect(outer).not.toHaveBeenCalled()
})

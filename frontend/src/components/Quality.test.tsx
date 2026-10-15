// SPDX-License-Identifier: AGPL-3.0-or-later
// @vitest-environment jsdom
import { render, screen } from '@testing-library/react'
import { expect, it } from 'vitest'
import { FormField } from './FormField'
import { SearchHighlight } from './SearchHighlight'
it('associates labels, required state, helpers and inline errors', () => {
  render(
    <FormField label="Calendar" hint="Private" error="Invalid URL" required>
      {(control) => <input {...control} />}
    </FormField>,
  )
  const input = screen.getByRole('textbox', { name: /Calendar/ })
  expect(input.getAttribute('aria-invalid')).toBe('true')
  expect(input.hasAttribute('required')).toBe(true)
  expect(input.getAttribute('aria-describedby')?.split(' ')).toHaveLength(2)
  expect(screen.getByRole('alert').textContent).toBe('Invalid URL')
})
it('highlights literal queries and renders hostile snippets as text', () => {
  const { container } = render(<SearchHighlight text={'a+b <img src=x onerror=bad>'} query="a+b" />)
  expect(container.querySelector('mark')?.textContent).toBe('a+b')
  expect(container.querySelector('img')).toBeNull()
})

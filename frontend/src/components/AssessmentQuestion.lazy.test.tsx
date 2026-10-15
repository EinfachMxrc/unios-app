// SPDX-License-Identifier: AGPL-3.0-or-later
// @vitest-environment jsdom

import { cleanup, render, screen, waitFor } from '@testing-library/react'
import { afterEach, expect, it } from 'vitest'
import { AssessmentCode, AssessmentInline, AssessmentQuestion } from './AssessmentQuestion'

afterEach(cleanup)

it('loads all task renderers and keeps updated content and inline label semantics', async () => {
  const view = render(<AssessmentQuestion text="## First instruction" />)
  view.rerender(<AssessmentQuestion text="## Current instruction" />)
  expect(await screen.findByRole('heading', { name: 'Current instruction' })).toBeTruthy()
  expect(screen.queryByText('First instruction')).toBeNull()

  view.rerender(
    <label>
      <AssessmentInline text="Compare $x^2$" />
    </label>,
  )
  await waitFor(() => expect(view.container.querySelector('label .katex')).not.toBeNull())
  expect(view.container.querySelector('label div')).toBeNull()

  view.rerender(<AssessmentCode text={'return "<script>";'} language="java" />)
  await waitFor(() => expect(view.container.querySelector('.assessment-code-block')).not.toBeNull())
  expect(view.container.querySelector('pre code')?.textContent).toBe('return "<script>";')
  expect(view.container.querySelector('script')).toBeNull()
})

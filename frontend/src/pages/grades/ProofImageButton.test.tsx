// SPDX-License-Identifier: AGPL-3.0-or-later
// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { ProofImageButton } from './ProofImageButton'

vi.mock('@/i18n/useT', () => ({ useT: () => ({ t: (key: string) => key }) }))

afterEach(cleanup)

it('shows the proof inside the app instead of linking out', () => {
  render(<ProofImageButton proofId="abc 1" label="Nachweisbild öffnen" takenAt="12.10.2026" />)
  expect(screen.queryByRole('link')).toBeNull()
  fireEvent.click(screen.getByRole('button', { name: 'Nachweisbild öffnen' }))
  const dialog = screen.getByRole('dialog', { name: 'proofRowLabel' })
  expect(dialog.querySelector('img')!.getAttribute('src')).toBe('/api/primuss/proofs/abc%201')
  expect(screen.getByText('12.10.2026')).toBeTruthy()
})

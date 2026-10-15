// SPDX-License-Identifier: AGPL-3.0-or-later
// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import '@/i18n'
import RecoveryPage from './RecoveryPage'
afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})
it('allows a checked recovery copy without calling the normal writer API', async () => {
  const fetcher = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ id: 'invented', verified: true }) })
  vi.stubGlobal('fetch', fetcher)
  render(<RecoveryPage status={{ mode: 'recovery', database: { status: 'ok' } }} />)
  fireEvent.click(screen.getByRole('button', { name: 'Geprüfte Datenbankkopie erstellen' }))
  expect(await screen.findByText(/Kennung: invented/)).toBeTruthy()
  expect(fetcher).toHaveBeenCalledTimes(1)
  expect(fetcher.mock.calls[0][0]).toBe('/api/recovery/backup')
  expect(fetcher.mock.calls[0][1]).toMatchObject({ method: 'POST', credentials: 'same-origin', cache: 'no-store' })
})
it('does not call a warning a verified backup', async () => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => ({ id: 'bad', verified: false }) }))
  render(<RecoveryPage status={{ mode: 'recovery', database: { status: 'error' } }} />)
  fireEvent.click(screen.getByRole('button', { name: 'Geprüfte Datenbankkopie erstellen' }))
  expect(await screen.findByText('Das hat nicht geklappt. Deine Originale wurden nicht verändert.')).toBeTruthy()
  expect(screen.queryByText(/Kennung: bad/)).toBeNull()
})

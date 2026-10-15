// SPDX-License-Identifier: AGPL-3.0-or-later
// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import i18n from '@/i18n'
import releaseOnboarding from '@/i18n/locales/de/releaseOnboarding'
import { ImportWizard } from './ImportWizard'
import { request } from '@/api'
vi.mock('@/hooks/host', () => ({ useWritableHost: () => true }))
vi.mock('@/api', () => ({
  request: vi.fn().mockResolvedValue({}),
  useApi: () => ({ data: { courses: [{ id: 4, name: 'Demo Course' }] } }),
}))
i18n.addResourceBundle('de', 'releaseOnboarding', releaseOnboarding)
afterEach(() => {
  cleanup()
  vi.mocked(request).mockReset()
  vi.mocked(request).mockResolvedValue({})
})
it('imports Markdown only after course selection and confirmation; reports preserved partial success', async () => {
  const first = new File(['# A'], 'A.md')
  Object.defineProperty(first, 'text', { value: async () => '# A' })
  const second = new File(['# B'], 'B.md')
  Object.defineProperty(second, 'text', { value: async () => '# B' })
  render(
    <MemoryRouter>
      <ImportWizard />
    </MemoryRouter>,
  )
  fireEvent.change(screen.getByLabelText('Dateien auswählen'), { target: { files: [first, second] } })
  expect((screen.getByRole('button', { name: 'Auswahl prüfen' }) as HTMLButtonElement).disabled).toBe(true)
  fireEvent.change(screen.getByLabelText('Kurs für die Notizen'), { target: { value: '4' } })
  fireEvent.click(screen.getByRole('button', { name: 'Auswahl prüfen' }))
  expect(request).not.toHaveBeenCalled()
  expect(screen.getByText('A.md')).toBeTruthy()
  vi.mocked(request).mockResolvedValueOnce({}).mockRejectedValueOnce(new Error('offline'))
  fireEvent.click(screen.getByRole('button', { name: 'Import bestätigen' }))
  await waitFor(() => expect(screen.getByRole('alert').textContent).toContain('1 bestätigten Dateien'))
  expect(vi.mocked(request).mock.calls[0]).toEqual([
    '/api/notes',
    { method: 'POST', body: JSON.stringify({ course_id: 4, resource_id: null, title: 'A', body: '# A' }) },
  ])
  fireEvent.click(screen.getByRole('button', { name: 'Auswahl prüfen' }))
  expect(screen.queryByText('A.md')).toBeNull()
  expect(screen.getByText('B.md')).toBeTruthy()
})
it('previews CSV without writing and retries only remaining notes after partial failure', async () => {
  const file = new File(['Title,Body\nA,First\nB,Second'], 'notes.csv')
  Object.defineProperty(file, 'text', { value: async () => 'Title,Body\nA,First\nB,Second' })
  render(
    <MemoryRouter>
      <ImportWizard />
    </MemoryRouter>,
  )
  fireEvent.click(screen.getByRole('button', { name: 'CSV-Notizen' }))
  fireEvent.change(screen.getByLabelText('Dateien auswählen'), { target: { files: [file] } })
  fireEvent.change(screen.getByLabelText('Kurs für die Notizen'), { target: { value: '4' } })
  fireEvent.click(screen.getByRole('button', { name: 'Auswahl prüfen' }))
  await screen.findByText('2 neue Notizen. Vorschau der ersten zehn:')
  expect(request).not.toHaveBeenCalled()
  vi.mocked(request).mockResolvedValueOnce({}).mockRejectedValueOnce(new Error('offline'))
  fireEvent.click(screen.getByRole('button', { name: 'Import bestätigen' }))
  await waitFor(() => expect(screen.getByRole('alert').textContent).toContain('1 bestätigten Notizen'))
  expect(screen.queryByText('First')).toBeNull()
  fireEvent.click(screen.getByRole('button', { name: 'Import bestätigen' }))
  await screen.findByText('1 Notizen übernommen')
  expect(vi.mocked(request).mock.calls.map(([, options]) => JSON.parse(options?.body as string).title)).toEqual([
    'A',
    'B',
    'B',
  ])
})

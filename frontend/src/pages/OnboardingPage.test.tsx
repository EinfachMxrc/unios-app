// SPDX-License-Identifier: AGPL-3.0-or-later
// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import i18n from '@/i18n'
import releaseOnboarding from '@/i18n/locales/de/releaseOnboarding'
import { DemoBanner, OnboardingPage } from './OnboardingPage'
afterEach(cleanup)
i18n.addResourceBundle('de', 'releaseOnboarding', releaseOnboarding)
it('lets a new student start an isolated demo and retry a failed startup', async () => {
  const start = vi.fn().mockRejectedValueOnce(new Error('startup')).mockResolvedValue(undefined)
  const connect = vi.fn()
  render(<OnboardingPage onStartDemo={start} onConnect={connect} />)
  fireEvent.click(screen.getByRole('button', { name: 'Demo ausprobieren' }))
  await waitFor(() => expect(screen.getByRole('alert')).toBeTruthy())
  fireEvent.click(screen.getByRole('button', { name: 'Demo ausprobieren' }))
  await waitFor(() => expect(start).toHaveBeenCalledTimes(2))
  await waitFor(() => expect(screen.queryByRole('alert')).toBeNull())
  fireEvent.click(screen.getByRole('button', { name: 'Meine Hochschule verbinden' }))
  expect(connect).toHaveBeenCalledOnce()
})
it('provides a real demo journey and an explicit exit without activating a connector', async () => {
  const exit = vi.fn().mockResolvedValue(undefined)
  render(<DemoBanner onExit={exit} />)
  expect(screen.getByRole('link', { name: 'Kurs öffnen' }).getAttribute('href')).toBe('/courses')
  expect(screen.getByRole('link', { name: 'Ein PDF lesen' }).getAttribute('href')).toBe('/search?q=Schleifen')
  expect(screen.getByRole('link', { name: 'Eine Lernkarte beantworten' }).getAttribute('href')).toBe('/study')
  fireEvent.click(screen.getByRole('button', { name: 'Demo verlassen' }))
  await waitFor(() => expect(exit).toHaveBeenCalledOnce())
})
it('offers the local choice only when the shell can restart into it, and shows a failure', async () => {
  const noop = vi.fn().mockResolvedValue(undefined)
  const { rerender } = render(<OnboardingPage onStartDemo={noop} onConnect={vi.fn()} />)
  expect(screen.queryByRole('button', { name: 'Nur auf diesem Gerät nutzen' })).toBeNull()
  const local = vi.fn().mockRejectedValueOnce(new Error('x')).mockResolvedValue(undefined)
  rerender(<OnboardingPage onStartDemo={noop} onConnect={vi.fn()} onUseLocal={local} />)
  fireEvent.click(screen.getByRole('button', { name: 'Nur auf diesem Gerät nutzen' }))
  expect(await screen.findByRole('alert')).toBeTruthy()
  fireEvent.click(screen.getByRole('button', { name: 'Nur auf diesem Gerät nutzen' }))
  await waitFor(() => expect(local).toHaveBeenCalledTimes(2))
})

// SPDX-License-Identifier: AGPL-3.0-or-later

import { screenshotPath } from './artifacts'

import { expect, test } from './fixtures'

test('Aufnahme und gespeicherte Sprachnotiz spielen unter der ausgelieferten Sicherheitsrichtlinie', async ({
  page,
}) => {
  const response = await page.request.get('http://127.0.0.1:8173/api/host')
  const policy = response.headers()['content-security-policy']
  expect(policy).toBeTruthy()
  await page.route('**/voice', async (route) => {
    if (!route.request().isNavigationRequest()) return route.continue()
    const document = await route.fetch()
    await route.fulfill({ response: document, headers: { ...document.headers(), 'content-security-policy': policy } })
  })
  await page.route('**/api/voice/transcription/status', (route) => route.fulfill({ json: { available: false } }))
  await page.addInitScript(() => {
    const context = new AudioContext()
    const output = context.createMediaStreamDestination()
    const oscillator = context.createOscillator()
    const gain = context.createGain()
    gain.gain.value = 0.01
    oscillator.connect(gain).connect(output)
    oscillator.start()
    Object.defineProperty(navigator, 'mediaDevices', {
      configurable: true,
      value: {
        getUserMedia: async () => {
          await context.resume()
          return output.stream
        },
      },
    })
    Object.defineProperty(window, 'SpeechRecognition', { configurable: true, value: undefined })
    Object.defineProperty(window, 'webkitSpeechRecognition', { configurable: true, value: undefined })
  })
  await page.goto('/voice')
  await page.getByRole('button', { name: 'Aufnahme starten' }).click()
  await expect(page.getByText('Aufnahme läuft')).toBeVisible()
  // Capture actual encoded audio, rather than the five-byte placeholder in the capture-flow test.
  await page.waitForTimeout(1200)
  await page.getByRole('button', { name: 'Aufnahme stoppen' }).click()
  const preview = page.locator('.voice-capture audio')
  await expect(preview).toBeVisible()
  await preview.evaluate((element: HTMLAudioElement) => element.play())
  await expect.poll(() => preview.evaluate((element: HTMLAudioElement) => element.currentTime)).toBeGreaterThan(0)
  expect(await preview.evaluate((element: HTMLAudioElement) => element.error?.code ?? null)).toBeNull()
  await preview.evaluate((element: HTMLAudioElement) => element.pause())
  await page.getByRole('textbox', { name: 'Titel' }).first().fill('Abspielbare Testaufnahme')
  await page.getByRole('button', { name: 'Audio und Text speichern' }).click()
  await expect(page.getByRole('status')).toContainText('lokal gespeichert')
  await page.reload()
  const saved = page.locator('.voice-memo').filter({ hasText: 'Abspielbare Testaufnahme' }).locator('audio')
  await expect(saved).toBeVisible()
  await saved.evaluate((element: HTMLAudioElement) => element.play())
  await expect.poll(() => saved.evaluate((element: HTMLAudioElement) => element.currentTime)).toBeGreaterThan(0)
  expect(await saved.evaluate((element: HTMLAudioElement) => element.error?.code ?? null)).toBeNull()
  await saved.evaluate((element: HTMLAudioElement) => element.pause())
})

test('Sprachnotiz wird aufgenommen, korrigiert und als Schnellerfassung gespeichert', async ({ page }) => {
  await page.route('**/api/voice/transcription/status', (route) => route.fulfill({ json: { available: false } }))
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'mediaDevices', {
      configurable: true,
      value: {
        getUserMedia: async () => ({ getTracks: () => [{ stop() {} }] }),
      },
    })
    class FakeRecorder {
      static isTypeSupported() {
        return true
      }
      mimeType = 'audio/webm'
      state = 'inactive'
      ondataavailable: ((event: { data: Blob }) => void) | null = null
      onstop: (() => void) | null = null
      start() {
        this.state = 'recording'
      }
      stop() {
        this.state = 'inactive'
        this.ondataavailable?.({
          data: new Blob([new Uint8Array([0x1a, 0x45, 0xdf, 0xa3, 0x00])], { type: 'audio/webm' }),
        })
        this.onstop?.()
      }
    }
    Object.defineProperty(window, 'MediaRecorder', { configurable: true, value: FakeRecorder })
    class FakeRecognition {
      static async available() {
        return 'available'
      }
      lang = ''
      continuous = false
      interimResults = false
      processLocally = false
      onresult:
        | ((event: {
            resultIndex: number
            results: ArrayLike<ArrayLike<{ transcript: string }> & { isFinal: boolean }>
          }) => void)
        | null = null
      onerror = null
      onend: (() => void) | null = null
      start() {
        this.onresult?.({
          resultIndex: 0,
          results: [{ 0: { transcript: 'Rekursion braucht einen Basisfall.' }, length: 1, isFinal: true }],
        })
      }
      stop() {
        this.onend?.()
      }
    }
    Object.defineProperty(window, 'SpeechRecognition', { configurable: true, value: FakeRecognition })
  })
  await page.goto('/voice')
  await page.getByRole('button', { name: 'Aufnahme starten' }).click()
  await expect(page.getByText('Aufnahme läuft')).toBeVisible()
  await expect(page.getByRole('textbox', { name: 'Transkript' }).first()).toHaveValue(
    'Rekursion braucht einen Basisfall.',
  )
  await page.getByRole('button', { name: 'Aufnahme stoppen' }).click()
  await page.getByRole('textbox', { name: 'Titel' }).first().fill('Gedanke zu Schleifen')
  await page
    .getByRole('textbox', { name: 'Transkript' })
    .first()
    .fill('Bei Rekursion braucht jeder Aufruf einen Basisfall.')
  await page.getByRole('combobox', { name: 'Kurs' }).first().selectOption({ label: 'Programmieren 1' })
  await page.getByRole('button', { name: 'Audio und Text speichern' }).click()
  await expect(page.getByRole('status')).toContainText('lokal gespeichert')
  const saved = page.locator('.voice-memo').filter({ hasText: 'Gedanke zu Schleifen' })
  await expect(saved.getByText('Bei Rekursion braucht jeder Aufruf einen Basisfall.')).toBeVisible()
  await expect(saved.locator('audio[aria-label="Audio: Gedanke zu Schleifen"]')).toBeVisible()
  await saved.getByRole('button', { name: 'Bearbeiten' }).click()
  await saved.getByRole('textbox', { name: 'Transkript' }).fill('Rekursion endet im Basisfall.')
  await saved.getByRole('button', { name: 'Änderungen speichern' }).click()
  await expect(saved.locator('.voice-transcript')).toContainText('Rekursion endet im Basisfall.')
  await page.evaluate(() => window.scrollTo(0, 0))
  await page.screenshot({ path: screenshotPath('test-results/voice-desktop.png'), fullPage: true })
  await page.setViewportSize({ width: 390, height: 844 })
  await page.screenshot({ path: screenshotPath('test-results/voice-mobile.png'), fullPage: true })
  expect(await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth)).toBe(false)
})

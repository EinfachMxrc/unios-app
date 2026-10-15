// SPDX-License-Identifier: AGPL-3.0-or-later

import { expect, test } from './fixtures'

test('manual modules show ECTS and a separate hypothetical average', async ({ page }) => {
  await page.goto('/more')
  await expect(page.getByRole('link', { name: 'Noten und ECTS' })).toHaveCount(0)
  await page.goto('/settings')
  await page.getByRole('switch', { name: 'Noten und ECTS' }).click()
  await page.goto('/grades')
  await page.getByRole('button', { name: 'Modul ergänzen' }).click()
  await page.getByLabel('Modulname').fill('Erfundene Mathematik')
  await page.getByLabel('ECTS', { exact: true }).fill('5')
  await page.getByRole('combobox', { name: 'Status' }).selectOption('passed')
  await page.getByLabel('Tatsächliche Note').fill('1.3')
  await page.getByRole('button', { name: 'Modul speichern' }).click()
  await expect(page.getByText('5.00 / 5.00', { exact: true })).toBeVisible()
  await expect(page.getByText('Einfacher ECTS-gewichteter Schnitt')).toBeVisible()
  await page.getByRole('button', { name: 'Modul ergänzen' }).click()
  await page.getByLabel('Modulname').fill('Erfundene Informatik')
  await page.getByLabel('ECTS', { exact: true }).fill('10')
  await page.getByRole('button', { name: 'Modul speichern' }).click()
  await expect(page.getByText('5.00 / 15.00', { exact: true })).toBeVisible()
  await page.getByPlaceholder('Hypothetische Note').fill('2.0')
  await page.getByRole('button', { name: 'Schnitt berechnen' }).click()
  await expect(page.getByText('Hypothetischer Schnitt: 1.77')).toBeVisible()
  await expect(page.getByText('5.00 / 15.00', { exact: true })).toBeVisible()
  await page.setViewportSize({ width: 390, height: 844 })
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
})

test('PRIMUSS preview labels uncertain registration without changing saved grades', async ({ page }) => {
  await page.addInitScript(() =>
    localStorage.setItem('marc-ui-preferences-v1', JSON.stringify({ modules: { grades: true } })),
  )
  let aliasAvailable = false
  let syncAvailable = false
  let gradeSyncAvailable = false
  let hasSaved = false
  const preview = {
    exams: [
      {
        source_key: null,
        title: 'Fiktive Prüfung',
        exam_at: null,
        registration: 'unclear',
        registration_text: 'Wird bearbeitet',
        registration_deadline: null,
      },
    ],
    grades: [{ title: 'Fiktive Informatik', value: '1,7', ects: '5', status: 'bestanden' }],
    warnings: ['Prüfung „Fiktive Prüfung“: Termin unklar.'],
    proof_id: '20260925T200000Z-0123456789abcdef0123456789abcdef',
    proof_at: '2026-09-25T20:00:00Z',
    saved: false,
  }
  await page.route('**/api/primuss/status', (route) =>
    route.fulfill({
      json: {
        configured: aliasAvailable,
        session_available: true,
        missing_fields: [],
        alias_map_available: aliasAvailable,
        sync_available: syncAvailable,
        grades_sync_available: gradeSyncAvailable,
      },
    }),
  )
  await page.route('**/api/primuss/preview', (route) => route.fulfill({ json: preview }))
  await page.route('**/api/primuss/recheck', (route) => {
    hasSaved = true
    return route.fulfill({ json: { ...preview, saved: true } })
  })
  await page.route('**/api/primuss/exams', (route) =>
    route.fulfill({
      json: hasSaved
        ? [
            {
              id: 1,
              title: 'Fiktive Prüfung',
              exam_at: null,
              registration: 'unclear',
              checked_at: '2026-09-25T20:00:00Z',
              proof_id: preview.proof_id,
            },
          ]
        : [],
    }),
  )
  await page.route('**/api/primuss/grades/sync', (route) =>
    route.fulfill({
      json: {
        created: 1,
        updated: 0,
        unchanged: 0,
        skipped: 0,
        warnings: [],
      },
    }),
  )
  await page.goto('/grades')
  const ectsBeforePreview = await page.locator('.grades-summary strong').first().textContent()
  await expect(
    page.getByText('Die lokale CSS-Zuordnung fehlt im System-Schlüsselbund dieses Hauptgeräts.'),
  ).toBeVisible()
  await expect(page.getByRole('button', { name: 'PRIMUSS lesen' })).toBeDisabled()
  aliasAvailable = true
  await page.reload()
  await expect(page.getByRole('button', { name: 'PRIMUSS lesen' })).toBeEnabled()
  await page.getByRole('button', { name: 'PRIMUSS lesen' }).click()
  await expect(page.getByText('Anmeldung: Unklar', { exact: false })).toBeVisible()
  await expect(page.getByText('Portalwert: 1,7', { exact: false })).toBeVisible()
  // The proof opens in the app, not in the browser.
  await page.route('**/api/primuss/proofs/*', (route) =>
    route.fulfill({
      contentType: 'image/svg+xml',
      body: '<svg xmlns="http://www.w3.org/2000/svg" width="400" height="200"><rect width="400" height="200" fill="#ddd"/></svg>',
    }),
  )
  await page.getByRole('button', { name: 'Bild öffnen' }).click()
  const proof = page.getByRole('dialog', { name: 'Nachweis' })
  await expect(proof.getByRole('img', { name: 'Nachweis' })).toBeVisible()
  expect(await proof.getByRole('img').evaluate((img: HTMLImageElement) => img.naturalWidth)).toBeGreaterThan(0)
  await page.keyboard.press('Escape')
  await expect(proof).toHaveCount(0)
  await expect(page.locator('.grades-summary strong').first()).toHaveText(ectsBeforePreview ?? '')
  syncAvailable = true
  await page.reload()
  await page.getByRole('button', { name: 'Anmeldungen prüfen und speichern' }).click()
  await expect(page.getByText('Prüfungsanmeldungen mit Nachweis gespeichert.')).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Zuletzt geprüfte Anmeldungen' })).toBeVisible()
  gradeSyncAvailable = true
  await page.reload()
  await page.getByRole('button', { name: 'Noten und ECTS abgleichen' }).click()
  await expect(
    page.getByText('PRIMUSS-Noten abgeglichen: 1 neu, 0 aktualisiert, 0 unverändert, 0 ausgelassen.'),
  ).toBeVisible()
})

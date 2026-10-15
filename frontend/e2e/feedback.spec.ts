// SPDX-License-Identifier: AGPL-3.0-or-later

import { readFile } from 'node:fs/promises'
import { test, expect } from './fixtures'

test('a page problem and a private diagnosis can be exported', async ({ page }) => {
  await page.goto('/learning')
  await page.getByRole('link', { name: 'Problem mit dieser Seite melden' }).click()
  await expect(page).toHaveURL(/\/settings\?feedback=problem&from=%2Flearning#feedback$/)
  await expect(page.getByText('Betroffene Seite: /learning')).toBeVisible()
  await page.getByRole('textbox', { name: 'Deine Beschreibung' }).fill('Die Lernseite bleibt leer.')
  const feedbackEvent = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Bericht herunterladen' }).click()
  const feedback = await feedbackEvent
  expect(JSON.parse(await readFile((await feedback.path())!, 'utf-8'))).toMatchObject({
    kind: 'problem',
    page: '/learning',
    message: 'Die Lernseite bleibt leer.',
  })
  const diagnosisEvent = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Diagnose erstellen' }).click()
  const diagnosis = JSON.parse(await readFile((await (await diagnosisEvent).path())!, 'utf-8'))
  expect(Object.keys(diagnosis).sort()).toEqual([
    'app_version',
    'connectors',
    'error_codes',
    'host',
    'os',
    'os_version',
    'schema_version',
    'sync',
  ])
  expect(JSON.stringify(diagnosis)).not.toContain('fixture-token')
})

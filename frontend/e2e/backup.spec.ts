// SPDX-License-Identifier: AGPL-3.0-or-later

import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { expect, test } from './fixtures'

test('a backup folder is chosen once, a backup runs, and a restore can be staged and cancelled', async ({ page }) => {
  const folder = mkdtempSync(path.join(tmpdir(), 'unios-backup-e2e-'))
  try {
    await page.goto('/settings#data')
    const panel = page.locator('.backup-panel')
    await expect(panel.getByText(/Anmeldedaten bleiben auf diesem Gerät/)).toBeVisible()
    await panel.getByLabel('Backup-Ordner').fill(folder)
    await panel.getByRole('button', { name: 'Ordner übernehmen' }).click()
    await expect(panel.getByText(folder)).toBeVisible()
    await expect(panel.getByText('Noch keine Sicherung.')).toBeVisible()

    await panel.getByRole('button', { name: 'Jetzt sichern' }).click()
    await expect(panel.getByText(/^Letzte Sicherung: /)).toBeVisible({ timeout: 30_000 })
    const restore = panel.getByRole('button', { name: /^Stand vom .* wiederherstellen$/ })
    await expect(restore).toHaveCount(1)

    await restore.click()
    const dialog = page.getByRole('alertdialog', { name: 'Diesen Stand wiederherstellen?' })
    const confirm = dialog.getByRole('button', { name: 'Beim nächsten Start einspielen' })
    await expect(confirm).toBeDisabled()
    await dialog.getByLabel(/WIEDERHERSTELLEN/).fill('WIEDERHERSTELLEN')
    await confirm.click()
    await expect(
      panel.getByRole('status').filter({ hasText: 'wird beim nächsten Start von UniOS eingespielt' }),
    ).toBeVisible()
    await panel.getByRole('button', { name: 'Wiederherstellen abbrechen' }).click()
    await expect(panel.getByText(/wird beim nächsten Start/)).toHaveCount(0)
  } finally {
    rmSync(folder, { recursive: true, force: true })
  }
})

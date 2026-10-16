// SPDX-License-Identifier: AGPL-3.0-or-later

import type { Locator, Page } from '@playwright/test'

/** The one writing surface of a note. */
export function noteEditor(page: Page): Locator {
  return page.getByRole('textbox', { name: 'Notizinhalt' })
}

/** Replace the note's content by typing it line by line, the way a person would. */
export async function writeNote(page: Page, lines: string[]): Promise<Locator> {
  const editor = noteEditor(page)
  await editor.click()
  await page.keyboard.press('ControlOrMeta+A')
  await page.keyboard.press('Backspace')
  for (const [index, line] of lines.entries()) {
    if (index) await page.keyboard.press('Enter')
    if (line) await page.keyboard.type(line)
  }
  return editor
}

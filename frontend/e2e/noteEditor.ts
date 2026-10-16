// SPDX-License-Identifier: AGPL-3.0-or-later

import type { Locator, Page } from '@playwright/test'

/** The one writing surface of a note. */
export function noteEditor(page: Page): Locator {
  return page.getByRole('textbox', { name: 'Notizinhalt' })
}

/** Replace the note's content by typing it line by line, the way a person would. */
export async function writeNote(page: Page, lines: string[], editor: Locator = noteEditor(page)): Promise<Locator> {
  await editor.click()
  await page.keyboard.press('ControlOrMeta+A')
  await page.keyboard.press('Backspace')
  for (const [index, line] of lines.entries()) {
    if (index) await page.keyboard.press('Enter')
    if (line) await page.keyboard.type(line)
  }
  return editor
}

type StoredInline = { text?: string; title?: string; latex?: string }
type StoredBlock = { content?: StoredInline[]; children?: StoredBlock[] }

/** Readable text of a stored block document, one line per block. */
export function documentText(document: { blocks: StoredBlock[] }): string {
  const lines: string[] = []
  const walk = (blocks: StoredBlock[]) => {
    for (const block of blocks) {
      lines.push((block.content ?? []).map((item) => item.text ?? (item.title ? `[[${item.title}]]` : '')).join(''))
      walk(block.children ?? [])
    }
  }
  walk(document.blocks)
  return lines.join('\n')
}

/** Insert a block from the editor's "Einfügen" menu, the pointer-friendly way to the same blocks as "/". */
export async function insertFromMenu(page: Page, scope: Page | Locator, name: string): Promise<void> {
  await scope.getByRole('button', { name: 'Einfügen', exact: true }).click()
  await page.getByRole('menuitem', { name, exact: true }).click()
}

// SPDX-License-Identifier: AGPL-3.0-or-later
// @vitest-environment jsdom
import { expect, it } from 'vitest'
import { validImportFiles } from './ImportWizard'
it('bounds batch size and avoids silently treating a vault archive as a Markdown note', () => {
  const markdown = new File(['# Note'], 'note.md')
  expect(validImportFiles('markdown', [markdown])).toBe(true)
  expect(validImportFiles('markdown', [])).toBe(false)
  expect(validImportFiles('markdown', Array.from({ length: 51 }, () => markdown))).toBe(false)
  expect(validImportFiles('markdown', [new File(['archive'], 'vault.zip')])).toBe(false)
  expect(validImportFiles('markdown', [new File([''], 'blank.md')])).toBe(false)
  expect(validImportFiles('markdown', [new File(['x'.repeat(100_001)], 'large.md')])).toBe(false)
  expect(validImportFiles('pdf', [new File(['%PDF demo'], 'demo.pdf')])).toBe(true)
  expect(validImportFiles('csv', [new File(['Title,Body\nA,B'], 'notes.csv')])).toBe(true)
  expect(validImportFiles('csv', [new File(['x'.repeat(1024 * 1024 + 1)], 'first.csv'), new File(['x'.repeat(1024 * 1024)], 'second.csv')])).toBe(false)
})
